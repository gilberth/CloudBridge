import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, notInArray } from 'drizzle-orm';
import type { JobMode, RemotePath, Run, RunStatus } from '@cloudbridge/shared';
import type { Db } from '../db/index.js';
import { runs } from '../db/schema.js';
import type { RunRow } from '../db/schema.js';
import { notFound } from '../lib/errors.js';

export interface CreateRunInput {
  jobId?: string | null;
  jobName?: string | null;
  label: string;
  mode: JobMode;
  dryRun: boolean;
  source: RemotePath | null;
  destinations: RemotePath[];
  /** Everything needed to re-issue the operation on resume. */
  params: unknown;
}

const ACTIVE: RunStatus[] = ['running', 'paused'];

/** Persistence for executions: ad-hoc Explorer operations and job runs alike. */
export class RunsService {
  constructor(private readonly db: Db) {}

  create(input: CreateRunInput): Run {
    const id = randomUUID();
    const row = {
      id,
      jobId: input.jobId ?? null,
      jobName: input.jobName ?? null,
      label: input.label,
      mode: input.mode,
      status: 'running' as const,
      dryRun: input.dryRun,
      group: `run:${id}`,
      rcloneJobIds: [] as number[],
      sourceRemote: input.source?.remote ?? null,
      sourcePath: input.source?.path ?? null,
      destinations: input.destinations,
      params: input.params ?? null,
      startedAt: new Date().toISOString(),
    };
    this.db.insert(runs).values(row).run();
    return this.toRun({ ...row, finishedAt: null, files: 0, bytes: 0, errors: 0, errorMessage: null, dryRunReport: null } as RunRow);
  }

  attachJobIds(id: string, jobIds: number[]): void {
    this.db.update(runs).set({ rcloneJobIds: jobIds }).where(eq(runs.id, id)).run();
  }

  update(
    id: string,
    patch: Partial<{
      status: RunStatus;
      finishedAt: string | null;
      files: number;
      bytes: number;
      errors: number;
      errorMessage: string | null;
      dryRunReport: string | null;
      rcloneJobIds: number[];
    }>,
  ): void {
    this.db.update(runs).set(patch).where(eq(runs.id, id)).run();
  }

  get(id: string): Run {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!row) throw notFound('Ejecución no encontrada');
    return this.toRun(row);
  }

  find(id: string): Run | null {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    return row ? this.toRun(row) : null;
  }

  active(): Run[] {
    return this.db
      .select()
      .from(runs)
      .where(inArray(runs.status, ACTIVE))
      .orderBy(desc(runs.startedAt))
      .all()
      .map((row) => this.toRun(row));
  }

  /** Active runs plus whatever finished recently, for the Transfers view. */
  recent(limit = 100): Run[] {
    return this.db
      .select()
      .from(runs)
      .orderBy(desc(runs.startedAt))
      .limit(limit)
      .all()
      .map((row) => this.toRun(row));
  }

  history(jobId: string, limit = 100): Run[] {
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.jobId, jobId))
      .orderBy(desc(runs.startedAt))
      .limit(limit)
      .all()
      .map((row) => this.toRun(row));
  }

  /**
   * A container restart kills the rclone jobs behind any run that was still
   * going, so on boot they are marked `interrupted` instead of staying
   * "running" forever.
   */
  markInterrupted(): number {
    const result = this.db
      .update(runs)
      .set({
        status: 'interrupted',
        finishedAt: new Date().toISOString(),
        errorMessage: 'Interrumpida por un reinicio de CloudBridge',
      })
      .where(inArray(runs.status, ACTIVE))
      .run();
    return result.changes;
  }

  /** Retention cleanup for finished runs. */
  purge(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const result = this.db
      .delete(runs)
      .where(and(lt(runs.startedAt, cutoff), notInArray(runs.status, ACTIVE)))
      .run();
    return result.changes;
  }

  private toRun(row: RunRow): Run {
    const finishedAt = row.finishedAt;
    return {
      id: row.id,
      jobId: row.jobId,
      jobName: row.jobName,
      label: row.label,
      mode: row.mode,
      status: row.status,
      dryRun: row.dryRun,
      group: row.group,
      rcloneJobIds: (row.rcloneJobIds as number[]) ?? [],
      source: row.sourceRemote ? { remote: row.sourceRemote, path: row.sourcePath ?? '' } : null,
      destinations: (row.destinations as RemotePath[]) ?? [],
      startedAt: row.startedAt,
      finishedAt,
      durationMs: finishedAt
        ? new Date(finishedAt).getTime() - new Date(row.startedAt).getTime()
        : null,
      files: row.files,
      bytes: row.bytes,
      errors: row.errors,
      errorMessage: row.errorMessage,
      dryRunReport: row.dryRunReport,
    };
  }

  /** Raw row access for services that need `params`. */
  params(id: string): unknown {
    return this.db.select({ params: runs.params }).from(runs).where(eq(runs.id, id)).get()?.params ?? null;
  }
}
