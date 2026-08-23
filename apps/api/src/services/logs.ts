import { and, count, desc, eq, gte, like, lt, lte, type SQL } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { LogEntry, LogLevel, LogQueryInput, Paginated } from '@cloudbridge/shared';
import type { Db } from '../db/index.js';
import { logs } from '../db/schema.js';

interface LogContext {
  jobId?: string | null;
  runId?: string | null;
}

/**
 * Application-level log. Every entry goes to stdout as structured JSON (for
 * Loki/Promtail) *and* into SQLite, which is what the Logs viewer reads and
 * what a job's history shows.
 */
export class LogService {
  constructor(
    private readonly db: Db,
    private readonly logger: FastifyBaseLogger,
  ) {}

  write(
    level: LogLevel,
    source: string,
    message: string,
    meta?: Record<string, unknown>,
    context: LogContext = {},
  ): void {
    this.logger[level]({ source, jobId: context.jobId, runId: context.runId, ...meta }, message);
    try {
      this.db
        .insert(logs)
        .values({
          ts: new Date().toISOString(),
          level,
          source,
          jobId: context.jobId ?? null,
          runId: context.runId ?? null,
          message,
          meta: meta ?? null,
        })
        .run();
    } catch (error) {
      // Never let logging break the operation that produced the entry.
      this.logger.warn({ err: error }, 'No se pudo persistir la entrada de log');
    }
  }

  private buildWhere(query: Partial<LogQueryInput>): SQL | undefined {
    const clauses: SQL[] = [];
    if (query.level) clauses.push(eq(logs.level, query.level as LogLevel));
    if (query.jobId) clauses.push(eq(logs.jobId, query.jobId));
    if (query.runId) clauses.push(eq(logs.runId, query.runId));
    if (query.from) clauses.push(gte(logs.ts, query.from));
    if (query.to) clauses.push(lte(logs.ts, query.to));
    if (query.search) clauses.push(like(logs.message, `%${query.search}%`));
    if (clauses.length === 0) return undefined;
    return clauses.length === 1 ? clauses[0] : and(...clauses);
  }

  query(query: LogQueryInput): Paginated<LogEntry> {
    const where = this.buildWhere(query);
    const limit = query.limit ?? 200;
    const offset = query.offset ?? 0;

    const rows = this.db
      .select()
      .from(logs)
      .where(where)
      .orderBy(desc(logs.ts), desc(logs.id))
      .limit(limit)
      .offset(offset)
      .all();

    const total = this.db.select({ value: count() }).from(logs).where(where).get()?.value ?? 0;

    return {
      items: rows.map((row) => ({
        id: row.id,
        ts: row.ts,
        level: row.level,
        source: row.source,
        jobId: row.jobId,
        runId: row.runId,
        message: row.message,
        meta: (row.meta as Record<string, unknown> | null) ?? null,
      })),
      total,
      limit,
      offset,
    };
  }

  /** Plain-text rendering used by the "Exportar a .txt" button. */
  toText(entries: LogEntry[]): string {
    return entries
      .map((entry) => {
        const scope = entry.jobId ? ` [job:${entry.jobId}]` : entry.runId ? ` [run:${entry.runId}]` : '';
        const meta = entry.meta && Object.keys(entry.meta).length > 0 ? ` ${JSON.stringify(entry.meta)}` : '';
        return `${entry.ts} ${entry.level.toUpperCase().padEnd(5)} ${entry.source}${scope} ${entry.message}${meta}`;
      })
      .join('\n');
  }

  /** Drop entries older than the configured retention window. */
  purge(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const result = this.db.delete(logs).where(lt(logs.ts, cutoff)).run();
    return result.changes;
  }
}
