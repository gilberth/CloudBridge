import type { FastifyInstance } from 'fastify';
import type {
  JobMode,
  RemotePath,
  Run,
  TransferFilters,
  TransferOptions,
} from '@cloudbridge/shared';
import { DEFAULT_TRANSFER_OPTIONS } from '@cloudbridge/shared';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { joinPath, sanitizeName, sanitizePath } from '../lib/path.js';
import { buildConfig, buildFilter, syncEndpointFor } from '../rclone/options.js';
import { fsPath, serverSideOptions, type BackendOptions } from '../rclone/fsstring.js';
import { RcloneError, RcloneUnavailableError } from '../rclone/client.js';

export interface SelectedItem {
  name: string;
  isDir: boolean;
}

export interface TransferRequest {
  mode: JobMode;
  source: RemotePath;
  destinations: RemotePath[];
  /** Empty means "the whole source directory". */
  items?: SelectedItem[];
  options: Partial<TransferOptions>;
  label?: string;
  jobId?: string | null;
  jobName?: string | null;
  /** Required when the operation deletes at the destination. */
  confirm?: string;
}

/** Persisted with the run so "resume" can re-issue the exact same operation. */
interface RunParams {
  mode: JobMode;
  source: RemotePath;
  destinations: RemotePath[];
  items: SelectedItem[];
  options: TransferOptions;
}

/**
 * Launches transfers on rclone and tracks them as runs.
 *
 * Everything is issued with `_async` plus a per-run `_group`, so progress can
 * be read back from `core/stats?group=…` without mixing runs together.
 */
export class TransferService {
  constructor(private readonly app: FastifyInstance) {}

  private get rclone() {
    return this.app.rclone;
  }

  /**
   * Turn a selection into rclone filter rules, so a multi-file drag becomes a
   * single rclone job instead of one job per file.
   */
  private selectionFilter(items: SelectedItem[], filters: TransferFilters): Record<string, unknown> {
    const include = [...filters.include];
    for (const item of items) {
      const name = sanitizeName(item.name);
      include.push(item.isDir ? `/${name}/**` : `/${name}`);
    }
    return buildFilter({ include, exclude: filters.exclude });
  }

  private async backendOptions(
    source: RemotePath,
    destination: RemotePath,
  ): Promise<{ src?: BackendOptions; dst?: BackendOptions }> {
    const types = await this.app.remotes.types();
    const srcType = types[source.remote];
    const dstType = types[destination.remote];
    if (!srcType) throw notFound(`El remoto "${source.remote}" no existe`);
    if (!dstType) throw notFound(`El remoto "${destination.remote}" no existe`);

    const shared = serverSideOptions(srcType, dstType);
    return shared ? { src: shared, dst: shared } : {};
  }

  /** Does this operation delete data at the destination? */
  static isDestructive(mode: JobMode, options: Partial<TransferOptions>): boolean {
    return mode === 'sync' && Boolean(options.deleteOnDst) && !options.dryRun;
  }

  async start(request: TransferRequest): Promise<Run> {
    const options: TransferOptions = {
      ...DEFAULT_TRANSFER_OPTIONS,
      ...request.options,
      filters: {
        include: request.options.filters?.include ?? [],
        exclude: request.options.filters?.exclude ?? [],
      },
    };
    const items = request.items ?? [];

    if (request.destinations.length === 0) throw badRequest('Falta el destino');

    if (TransferService.isDestructive(request.mode, options)) {
      const expected = request.jobName ?? this.describe(request.destinations);
      if (request.confirm !== expected) {
        throw badRequest(
          `Esta operación borra archivos en el destino. Confirma escribiendo exactamente: ${expected}`,
        );
      }
    }

    const label =
      request.label ??
      `${request.mode} ${request.source.remote}:${request.source.path} → ${this.describe(request.destinations)}`;

    const run = this.app.runs.create({
      jobId: request.jobId ?? null,
      jobName: request.jobName ?? null,
      label,
      mode: request.mode,
      dryRun: options.dryRun,
      source: request.source,
      destinations: request.destinations,
      params: {
        mode: request.mode,
        source: request.source,
        destinations: request.destinations,
        items,
        options,
      } satisfies RunParams,
    });

    try {
      // rclone's limiter is process-wide, so the limit is held for this run and
      // released when it finishes.
      await this.app.bandwidth.acquire(run.id, options.bwlimit ?? null);
      const jobIds = await this.issue(run.group, request.mode, request.source, request.destinations, items, options);
      this.app.runs.attachJobIds(run.id, jobIds);
      this.app.logs.write(
        'info',
        'transfer',
        `${options.dryRun ? '[dry-run] ' : ''}${label}`,
        { jobIds, files: items.length || 'todo el directorio' },
        { runId: run.id, jobId: request.jobId ?? null },
      );
      return { ...run, rcloneJobIds: jobIds };
    } catch (error) {
      await this.app.bandwidth.release(run.id);
      const message =
        error instanceof RcloneError || error instanceof RcloneUnavailableError
          ? error.message
          : 'No se pudo lanzar la operación en rclone';
      this.app.runs.update(run.id, {
        status: 'error',
        finishedAt: new Date().toISOString(),
        errorMessage: message,
        errors: 1,
      });
      this.app.logs.write('error', 'transfer', `Fallo al lanzar: ${label}`, { error: message }, {
        runId: run.id,
        jobId: request.jobId ?? null,
      });
      throw error;
    }
  }

  /** Issue one rclone job per destination and return their ids. */
  private async issue(
    group: string,
    mode: JobMode,
    source: RemotePath,
    destinations: RemotePath[],
    items: SelectedItem[],
    options: TransferOptions,
  ): Promise<number[]> {
    const defaults = this.app.settings.transferDefaults();
    const config = buildConfig(options, defaults);
    const jobIds: number[] = [];

    // A selection of only files (no directories) doesn't need a directory
    // sync at all: `sync/copy`+`--include` still walks and lists the whole
    // source tree to apply the filter, which re-resolves every item's ID —
    // for a handful of legacy/"Google Photos in Drive" items that ID can
    // come back different from what a direct path lookup gives, causing a
    // spurious 404 even though the file is perfectly copyable on its own.
    // Copy/move those directly by path instead; only `sync` (which needs a
    // real tree diff for deleteOnDst) and selections containing a directory
    // still go through the filtered sync/copy path below.
    //
    // Some legacy Drive items (old v2-API-style IDs) 404 specifically on
    // Google's server-side copy (`files.copy`) — deterministically, every
    // time — while a normal download+reupload of the exact same ID always
    // succeeds. Reproduced: 3/3 failures with `server_side_across_configs`
    // on, 3/3 successes with it off, same file, same ID. So when the
    // server-side attempt 404s "File not found", fall back to a plain
    // (non-server-side) copy/move of just that file instead of giving up.
    const onlyFiles = items.length > 0 && items.every((item) => !item.isDir);
    if (onlyFiles && (mode === 'copy' || mode === 'move')) {
      for (const destination of destinations) {
        const backends = await this.backendOptions(source, destination);
        const candidates = [
          {
            srcFs: fsPath(source.remote, source.path, backends.src),
            dstFs: fsPath(destination.remote, destination.path, backends.dst),
          },
          // Only a distinct fallback when server-side options were actually
          // applied above; otherwise it's the same call twice.
          ...(backends.src || backends.dst
            ? [
                {
                  srcFs: fsPath(source.remote, source.path),
                  dstFs: fsPath(destination.remote, destination.path),
                },
              ]
            : []),
        ];
        const call = { group, config } as const;
        for (const item of items) {
          const name = sanitizeName(item.name);
          const srcRemote = joinPath(source.path, name);
          const dstRemote = joinPath(destination.path, name);
          const { jobid, error } = await this.copyOrMoveFileWithRetry(
            mode,
            candidates,
            srcRemote,
            dstRemote,
            call,
          );
          // Always keep the jobid, success or not: `reconcile()` finalises a
          // run by polling `rcloneJobIds` — an empty array (e.g. every item
          // failed and got swallowed by ignoreErrors) leaves the run stuck
          // in "running" forever, since nothing is left to poll.
          jobIds.push(jobid);
          if (error && !options.ignoreErrors) throw error;
        }
      }
      return jobIds;
    }

    for (const destination of destinations) {
      const backends = await this.backendOptions(source, destination);
      const srcFs = fsPath(source.remote, source.path, backends.src);
      const dstFs = fsPath(destination.remote, destination.path, backends.dst);
      const filter =
        items.length > 0 ? this.selectionFilter(items, options.filters) : buildFilter(options.filters);

      const endpoint = syncEndpointFor(mode, options.deleteOnDst);
      const call = { group, config, filter } as const;

      if (endpoint === 'sync/bisync') {
        jobIds.push(
          await this.rclone.bisync(srcFs, dstFs, { ...call, dryRun: options.dryRun }),
        );
        continue;
      }

      const createEmptySrcDirs = options.createEmptySrcDirs;
      if (endpoint === 'sync/copy') {
        jobIds.push(await this.rclone.syncCopy(srcFs, dstFs, { ...call, createEmptySrcDirs }));
      } else if (endpoint === 'sync/move') {
        jobIds.push(
          await this.rclone.syncMove(srcFs, dstFs, {
            ...call,
            createEmptySrcDirs,
            deleteEmptySrcDirs: items.length === 0,
          }),
        );
      } else {
        jobIds.push(await this.rclone.syncSync(srcFs, dstFs, { ...call, createEmptySrcDirs }));
      }
    }

    return jobIds;
  }

  /**
   * `operations/copyfile`/`operations/movefile` against each `{srcFs,dstFs}`
   * candidate in order (server-side first, plain download+reupload as
   * fallback — see the comment at the call site) until one succeeds. A
   * "File not found" 404 moves on to the next candidate, or retries the same
   * one with a short backoff if there isn't one; any other error stops
   * immediately.
   */
  private async copyOrMoveFileWithRetry(
    mode: 'copy' | 'move',
    candidates: Array<{ srcFs: string; dstFs: string }>,
    srcRemote: string,
    dstRemote: string,
    call: { group: string; config: Record<string, unknown> },
  ): Promise<{ jobid: number; error?: RcloneError | RcloneUnavailableError }> {
    const endpoint = mode === 'move' ? 'operations/movefile' : 'operations/copyfile';
    const attemptsPerCandidate = candidates.length > 1 ? 1 : 3;
    let jobid = -1;
    let lastError: RcloneError | RcloneUnavailableError | undefined;

    for (const { srcFs, dstFs } of candidates) {
      const params = { srcFs, srcRemote, dstFs, dstRemote };
      for (let attempt = 1; attempt <= attemptsPerCandidate; attempt++) {
        jobid = await this.rclone.callAsync(endpoint, params, call);
        try {
          await this.waitForJob(jobid, endpoint);
          return { jobid };
        } catch (error) {
          lastError = error as RcloneError | RcloneUnavailableError;
          const notFound = error instanceof RcloneError && /file not found/i.test(error.message);
          if (!notFound) return { jobid, error: lastError };
          if (attempt < attemptsPerCandidate) {
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          }
        }
      }
    }
    return { jobid, error: lastError };
  }

  /** Poll `job/status` until an already-launched job finishes. */
  private async waitForJob(jobid: number, endpoint: string): Promise<void> {
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      const status = await this.rclone.call<{ finished: boolean; success: boolean; error: string }>(
        'job/status',
        { jobid },
        { timeoutMs: 10_000 },
      );
      if (status.finished) {
        if (!status.success) throw new RcloneError(endpoint, 200, status.error || `${endpoint} falló`, status);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new RcloneUnavailableError(endpoint, `${endpoint} no terminó a tiempo`);
  }

  private describe(destinations: RemotePath[]): string {
    return destinations
      .map((destination) => `${destination.remote}:${sanitizePath(destination.path)}`)
      .join(', ');
  }

  /** Cancel a run: stop every rclone job in its group. */
  async stop(runId: string, status: 'cancelled' | 'paused' = 'cancelled'): Promise<Run> {
    const run = this.app.runs.get(runId);
    if (run.status !== 'running') {
      throw conflict(`La ejecución no está en curso (estado: ${run.status})`);
    }

    try {
      await this.rclone.jobStopGroup(run.group);
    } catch (error) {
      // Fall back to stopping the individual jobs.
      this.app.log.warn({ err: error, runId }, 'job/stopgroup falló, se paran los jobs uno a uno');
      for (const jobId of run.rcloneJobIds) {
        await this.rclone.jobStop(jobId).catch(() => undefined);
      }
    }

    await this.app.bandwidth.release(runId);
    const stats = await this.rclone.stats(run.group).catch(() => null);
    this.app.runs.update(runId, {
      status,
      finishedAt: status === 'cancelled' ? new Date().toISOString() : null,
      files: stats?.transfers ?? run.files,
      bytes: stats?.bytes ?? run.bytes,
    });

    this.app.logs.write(
      'warn',
      'transfer',
      status === 'paused' ? `Pausada: ${run.label}` : `Cancelada: ${run.label}`,
      undefined,
      { runId, jobId: run.jobId },
    );

    return this.app.runs.get(runId);
  }

  /**
   * rclone has no pause/resume for a running job. "Pause" stops it and keeps
   * the parameters; "resume" re-issues the very same operation — rclone skips
   * files that already exist identically at the destination, so it continues
   * where it left off, losing only the partially transferred file.
   * See https://forum.rclone.org/t/how-to-resume-copy-process/14890/3
   */
  pause(runId: string): Promise<Run> {
    return this.stop(runId, 'paused');
  }

  async resume(runId: string): Promise<Run> {
    const run = this.app.runs.get(runId);
    if (run.status !== 'paused' && run.status !== 'interrupted' && run.status !== 'error') {
      throw conflict(`Solo se pueden reanudar ejecuciones pausadas, interrumpidas o con error`);
    }

    const params = this.app.runs.params(runId) as RunParams | null;
    if (!params) throw badRequest('Esta ejecución no guardó parámetros y no se puede reanudar');

    return this.start({
      mode: params.mode,
      source: params.source,
      destinations: params.destinations,
      items: params.items,
      options: params.options,
      label: `${run.label} (reanudada)`,
      jobId: run.jobId,
      jobName: run.jobName,
      // The original run already passed the destructive confirmation.
      confirm: run.jobName ?? this.describe(params.destinations),
    });
  }

  /**
   * Check every active run against rclone and finalise the ones that finished.
   * Called on a timer by the stats broadcaster.
   */
  async reconcile(): Promise<void> {
    const active = this.app.runs.active().filter((run) => run.status === 'running');
    if (active.length === 0) return;

    for (const run of active) {
      if (run.rcloneJobIds.length === 0) continue;

      try {
        const statuses = await Promise.all(
          run.rcloneJobIds.map((jobId) => this.rclone.jobStatus(jobId)),
        );
        if (!statuses.every((status) => status.finished)) continue;

        const stats = await this.rclone.stats(run.group).catch(() => null);
        const failed = statuses.filter((status) => !status.success);
        const errorMessage = failed.map((status) => status.error).filter(Boolean).join('; ') || null;

        let dryRunReport: string | null = null;
        if (run.dryRun) {
          const transferred = await this.rclone.transferred(run.group).catch(() => []);
          dryRunReport =
            transferred.length > 0
              ? transferred.map((item) => `${item.name} (${item.size} B)`).join('\n')
              : 'El dry-run no encontró nada que transferir.';
        }

        await this.app.bandwidth.release(run.id);
        this.app.runs.update(run.id, {
          status: failed.length > 0 ? 'error' : 'success',
          finishedAt: new Date().toISOString(),
          files: stats?.transfers ?? 0,
          bytes: stats?.bytes ?? 0,
          errors: stats?.errors ?? failed.length,
          errorMessage,
          dryRunReport,
        });

        this.app.logs.write(
          failed.length > 0 ? 'error' : 'info',
          'transfer',
          `${failed.length > 0 ? 'Fallida' : 'Completada'}: ${run.label}`,
          { files: stats?.transfers ?? 0, bytes: stats?.bytes ?? 0, error: errorMessage },
          { runId: run.id, jobId: run.jobId },
        );

        const finished = this.app.runs.get(run.id);
        this.app.stats?.emitRunFinished(finished);

        if (finished.jobId) {
          const job = (() => {
            try {
              return this.app.jobs.get(finished.jobId!);
            } catch {
              return null;
            }
          })();
          void this.app.notifications.send(
            job,
            finished,
            failed.length > 0 ? 'error' : 'success',
            errorMessage,
          );
        }
      } catch (error) {
        if (error instanceof RcloneUnavailableError) return; // Retry on the next tick.
        this.app.log.warn({ err: error, runId: run.id }, 'No se pudo reconciliar la ejecución');
      }
    }
  }
}
