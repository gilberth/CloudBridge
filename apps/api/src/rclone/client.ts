import type {
  RcAbout,
  RcAsyncResult,
  RcCheckResult,
  RcCoreStats,
  RcCoreVersion,
  RcFsInfo,
  RcJobList,
  RcJobStatus,
  RcListItem,
  RcListResult,
  RcProviders,
  RcSize,
  RcTransferredItem,
} from './types.js';

export interface RcloneClientConfig {
  url: string;
  user: string;
  password: string;
  timeoutMs?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

/** The daemon answered, but the operation failed. */
export class RcloneError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'RcloneError';
  }
}

/** The daemon could not be reached (down, DNS failure, timeout). */
export class RcloneUnavailableError extends Error {
  constructor(
    readonly endpoint: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RcloneUnavailableError';
  }
}

export interface CallOptions {
  /** Run the operation in the background; the response carries a `jobid`. */
  async?: boolean;
  /** rclone stats group, so progress can be polled per run. */
  group?: string;
  /** `_config`: global flags for the duration of the call (DryRun, Transfers…). */
  config?: Record<string, unknown>;
  /** `_filter`: include/exclude rules for the duration of the call. */
  filter?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ListOptions {
  recurse?: boolean;
  noModTime?: boolean;
  noMimeType?: boolean;
  showHash?: boolean;
  dirsOnly?: boolean;
  filesOnly?: boolean;
}

/**
 * Thin typed wrapper over the rclone rc HTTP API (https://rclone.org/rc/).
 *
 * Every long-running operation is issued with `_async: true` and a `_group`, so
 * the caller gets a `jobid` to follow with `job/status` and per-run progress
 * from `core/stats?group=…`.
 */
export class RcloneClient {
  readonly url: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: RcloneClientConfig) {
    this.url = config.url.replace(/\/+$/, '');
    this.authHeader = `Basic ${Buffer.from(`${config.user}:${config.password}`).toString('base64')}`;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  /** POST a JSON body to one rc endpoint and return its parsed response. */
  async call<T = Record<string, unknown>>(
    endpoint: string,
    params: Record<string, unknown> = {},
    options: CallOptions = {},
  ): Promise<T> {
    const body: Record<string, unknown> = { ...params };
    if (options.async) body._async = true;
    if (options.group) body._group = options.group;
    if (options.config && Object.keys(options.config).length > 0) body._config = options.config;
    if (options.filter && Object.keys(options.filter).length > 0) body._filter = options.filter;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.url}/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: this.authHeader },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      const reason =
        cause instanceof Error && cause.name === 'AbortError'
          ? `El daemon rclone no respondió en ${options.timeoutMs ?? this.timeoutMs} ms`
          : `No se pudo contactar con el daemon rclone en ${this.url}`;
      throw new RcloneUnavailableError(endpoint, reason, cause);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { error: text };
    }

    if (!response.ok) {
      const message =
        (parsed as { error?: string } | null)?.error ??
        `rclone respondió ${response.status} en ${endpoint}`;
      if (response.status === 401 || response.status === 403) {
        throw new RcloneError(endpoint, response.status, 'Credenciales de la RC API rechazadas', parsed);
      }
      throw new RcloneError(endpoint, response.status, message, parsed);
    }

    return parsed as T;
  }

  /** Issue an async call and return the rclone job id. */
  async callAsync(
    endpoint: string,
    params: Record<string, unknown> = {},
    options: Omit<CallOptions, 'async'> = {},
  ): Promise<number> {
    const result = await this.call<RcAsyncResult>(endpoint, params, { ...options, async: true });
    if (typeof result.jobid !== 'number') {
      throw new RcloneError(endpoint, 200, 'rclone no devolvió un jobid', result);
    }
    return result.jobid;
  }

  /**
   * Issue a call in the background and poll `job/status` until it finishes,
   * returning the job's `output` field.
   *
   * This is the pattern for calls whose duration scales with the remote
   * itself (listing a huge Team Drive, an S3 bucket with many objects) rather
   * than with CloudBridge: a single synchronous HTTP call is bound by one
   * fixed timeout no matter how generous, so it either succeeds or fails
   * outright. Polling instead removes that ceiling — the request takes as
   * long as rclone needs, and each individual poll stays fast — while still
   * giving the caller one place to bound the *total* wait via `maxWaitMs`.
   */
  async callAsyncAndWait<T>(
    endpoint: string,
    params: Record<string, unknown> = {},
    options: Omit<CallOptions, 'async'> & { pollIntervalMs?: number; maxWaitMs?: number } = {},
  ): Promise<T> {
    const { pollIntervalMs = 750, maxWaitMs = 10 * 60_000, ...call } = options;
    const jobid = await this.callAsync(endpoint, params, call);
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const status = await this.call<RcJobStatus>('job/status', { jobid }, { timeoutMs: 10_000 });
      if (status.finished) {
        if (!status.success) {
          throw new RcloneError(endpoint, 200, status.error || `${endpoint} falló en rclone`, status);
        }
        return status.output as T;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Best-effort: don't leave an abandoned job running forever in rclone.
    await this.jobStop(jobid).catch(() => undefined);
    throw new RcloneUnavailableError(
      endpoint,
      `${endpoint} no terminó tras ${Math.round(maxWaitMs / 1000)}s`,
    );
  }

  // ---------------------------------------------------------------- core ---

  version(): Promise<RcCoreVersion> {
    return this.call<RcCoreVersion>('core/version', {}, { timeoutMs: 5000 });
  }

  stats(group?: string): Promise<RcCoreStats> {
    return this.call<RcCoreStats>('core/stats', group ? { group } : {}, { timeoutMs: 10_000 });
  }

  async transferred(group?: string): Promise<RcTransferredItem[]> {
    const result = await this.call<{ transferred: RcTransferredItem[] }>(
      'core/transferred',
      group ? { group } : {},
    );
    return result.transferred ?? [];
  }

  statsReset(group?: string): Promise<unknown> {
    return this.call('core/stats-reset', group ? { group } : {});
  }

  bwlimit(rate?: string): Promise<{ rate: string; bytesPerSecond: number }> {
    return this.call('core/bwlimit', rate ? { rate } : {});
  }

  // -------------------------------------------------------------- config ---

  async listRemotes(): Promise<string[]> {
    const result = await this.call<{ remotes: string[] }>('config/listremotes');
    return result.remotes ?? [];
  }

  configDump(): Promise<Record<string, Record<string, string>>> {
    return this.call<Record<string, Record<string, string>>>('config/dump');
  }

  configGet(name: string): Promise<Record<string, string>> {
    return this.call<Record<string, string>>('config/get', { name });
  }

  configCreate(
    name: string,
    type: string,
    parameters: Record<string, string>,
  ): Promise<unknown> {
    return this.call('config/create', {
      name,
      type,
      parameters,
      opt: { nonInteractive: true, obscure: true },
    });
  }

  configUpdate(name: string, parameters: Record<string, string>): Promise<unknown> {
    return this.call('config/update', {
      name,
      parameters,
      opt: { nonInteractive: true, obscure: true },
    });
  }

  configDelete(name: string): Promise<unknown> {
    return this.call('config/delete', { name });
  }

  providers(): Promise<RcProviders> {
    return this.call<RcProviders>('config/providers');
  }

  // ---------------------------------------------------------- operations ---

  async list(fs: string, remote: string, opt: ListOptions = {}): Promise<RcListItem[]> {
    // A single-level listing is usually instant, but a cold OAuth token
    // refresh or a directory with thousands of entries (a large Team Drive,
    // an S3 bucket root, …) can take arbitrarily long. Run it as a background
    // job and poll instead of a single call bound by a fixed timeout, so a
    // slow listing degrades to "still loading" rather than a hard failure.
    const result = await this.callAsyncAndWait<RcListResult>(
      'operations/list',
      { fs, remote, opt },
      { maxWaitMs: 5 * 60_000 },
    );
    return result.list ?? [];
  }

  about(fs: string): Promise<RcAbout> {
    return this.call<RcAbout>('operations/about', { fs });
  }

  fsInfo(fs: string): Promise<RcFsInfo> {
    return this.call<RcFsInfo>('operations/fsinfo', { fs });
  }

  size(fs: string): Promise<RcSize> {
    return this.call<RcSize>('operations/size', { fs }, { timeoutMs: 120_000 });
  }

  stat(fs: string, remote: string): Promise<{ item: RcListItem | null }> {
    return this.call<{ item: RcListItem | null }>('operations/stat', { fs, remote });
  }

  mkdir(fs: string, remote: string): Promise<unknown> {
    return this.call('operations/mkdir', { fs, remote });
  }

  deleteFile(fs: string, remote: string): Promise<unknown> {
    return this.call('operations/deletefile', { fs, remote });
  }

  purge(fs: string, remote: string): Promise<unknown> {
    return this.call('operations/purge', { fs, remote });
  }

  copyFile(
    srcFs: string,
    srcRemote: string,
    dstFs: string,
    dstRemote: string,
    options: CallOptions = {},
  ): Promise<number> {
    return this.callAsync('operations/copyfile', { srcFs, srcRemote, dstFs, dstRemote }, options);
  }

  moveFile(
    srcFs: string,
    srcRemote: string,
    dstFs: string,
    dstRemote: string,
    options: CallOptions = {},
  ): Promise<number> {
    return this.callAsync('operations/movefile', { srcFs, srcRemote, dstFs, dstRemote }, options);
  }

  publicLink(fs: string, remote: string): Promise<{ url: string }> {
    return this.call<{ url: string }>('operations/publiclink', { fs, remote });
  }

  check(
    srcFs: string,
    dstFs: string,
    params: { download?: boolean; oneWay?: boolean; checkFileHash?: string } = {},
  ): Promise<RcCheckResult> {
    return this.call<RcCheckResult>(
      'operations/check',
      {
        srcFs,
        dstFs,
        combined: true,
        missingOnSrc: true,
        missingOnDst: true,
        match: true,
        differ: true,
        error: true,
        ...params,
      },
      { timeoutMs: 300_000 },
    );
  }

  // ---------------------------------------------------------------- sync ---

  syncCopy(srcFs: string, dstFs: string, options: CallOptions & { createEmptySrcDirs?: boolean } = {}) {
    const { createEmptySrcDirs, ...call } = options;
    return this.callAsync('sync/copy', { srcFs, dstFs, createEmptySrcDirs }, call);
  }

  syncMove(
    srcFs: string,
    dstFs: string,
    options: CallOptions & { createEmptySrcDirs?: boolean; deleteEmptySrcDirs?: boolean } = {},
  ) {
    const { createEmptySrcDirs, deleteEmptySrcDirs, ...call } = options;
    return this.callAsync(
      'sync/move',
      { srcFs, dstFs, createEmptySrcDirs, deleteEmptySrcDirs },
      call,
    );
  }

  syncSync(srcFs: string, dstFs: string, options: CallOptions & { createEmptySrcDirs?: boolean } = {}) {
    const { createEmptySrcDirs, ...call } = options;
    return this.callAsync('sync/sync', { srcFs, dstFs, createEmptySrcDirs }, call);
  }

  bisync(
    path1: string,
    path2: string,
    options: CallOptions & { dryRun?: boolean; resync?: boolean } = {},
  ) {
    const { dryRun, resync, ...call } = options;
    return this.callAsync('sync/bisync', { path1, path2, dryRun, resync }, call);
  }

  // ----------------------------------------------------------------- job ---

  jobStatus(jobid: number): Promise<RcJobStatus> {
    return this.call<RcJobStatus>('job/status', { jobid });
  }

  jobStop(jobid: number): Promise<unknown> {
    return this.call('job/stop', { jobid });
  }

  jobStopGroup(group: string): Promise<unknown> {
    return this.call('job/stopgroup', { group });
  }

  jobList(): Promise<RcJobList> {
    return this.call<RcJobList>('job/list');
  }
}
