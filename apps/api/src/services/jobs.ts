import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import cronstrueI18n from 'cronstrue/i18n.js';
import type { FastifyInstance } from 'fastify';
import type {
  CronPreview,
  Job,
  JobInput,
  RemotePath,
  Run,
  TransferOptions,
} from '@cloudbridge/shared';
import { DEFAULT_TRANSFER_OPTIONS } from '@cloudbridge/shared';
import { jobDestinations, jobs as jobsTable, runs } from '../db/schema.js';
import type { JobDestinationRow, JobRow } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { sanitizePath } from '../lib/path.js';
import { TransferService } from './transfers.js';

/**
 * `cronstrue/i18n` is a CommonJS bundle whose typings do not survive the ESM
 * default import, so the shape used here is declared explicitly.
 */
interface CronstrueI18n {
  toString(
    expression: string,
    options?: { locale?: string; use24HourTimeFormat?: boolean },
  ): string;
}

const cronstrue = cronstrueI18n as unknown as CronstrueI18n;

/** Describe a cron expression in Spanish, e.g. "A las 03:00". */
function describeCron(expression: string): string {
  try {
    return cronstrue.toString(expression, { locale: 'es', use24HourTimeFormat: true });
  } catch {
    return expression;
  }
}

export class JobsService {
  constructor(private readonly app: FastifyInstance) {}

  private rowToJob(row: JobRow, destinations: JobDestinationRow[], lastRun: Run | null): Job {
    const options = row.options as TransferOptions;
    return {
      id: row.id,
      name: row.name,
      mode: row.mode,
      source: { remote: row.sourceRemote, path: row.sourcePath },
      destinations: destinations
        .sort((a, b) => a.position - b.position)
        .map((destination) => ({ remote: destination.remote, path: destination.path })),
      options: { ...DEFAULT_TRANSFER_OPTIONS, ...options },
      cron: row.cron,
      timezone: row.timezone,
      enabled: row.enabled,
      webhookUrl: row.webhookUrl,
      notifyOnSuccess: row.notifyOnSuccess,
      notifyOnFailure: row.notifyOnFailure,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastRun,
      nextRunAt: row.enabled && row.cron ? this.nextRun(row.cron, row.timezone) : null,
      scheduleLabel: row.cron ? describeCron(row.cron) : 'Manual',
    };
  }

  private nextRun(expression: string, timezone: string): string | null {
    try {
      return CronExpressionParser.parse(expression, { tz: timezone }).next().toDate().toISOString();
    } catch {
      return null;
    }
  }

  private lastRunOf(jobId: string): Run | null {
    const row = this.app.db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.jobId, jobId))
      .orderBy(desc(runs.startedAt))
      .limit(1)
      .get();
    return row ? this.app.runs.find(row.id) : null;
  }

  list(): Job[] {
    const rows = this.app.db.select().from(jobsTable).orderBy(asc(jobsTable.name)).all();
    const allDestinations = this.app.db.select().from(jobDestinations).all();
    return rows.map((row) =>
      this.rowToJob(
        row,
        allDestinations.filter((destination) => destination.jobId === row.id),
        this.lastRunOf(row.id),
      ),
    );
  }

  get(id: string): Job {
    const row = this.app.db.select().from(jobsTable).where(eq(jobsTable.id, id)).get();
    if (!row) throw notFound('Job no encontrado');
    const destinations = this.app.db
      .select()
      .from(jobDestinations)
      .where(eq(jobDestinations.jobId, id))
      .all();
    return this.rowToJob(row, destinations, this.lastRunOf(id));
  }

  /** Validate the schedule and the destructive-confirmation rule. */
  private validate(input: JobInput, existingId?: string): void {
    if (input.cron && !cron.validate(input.cron)) {
      throw badRequest(`La expresión cron "${input.cron}" no es válida`);
    }
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: input.timezone });
      } catch {
        throw badRequest(`Zona horaria desconocida: "${input.timezone}"`);
      }
    }
    if (TransferService.isDestructive(input.mode, input.options) && input.confirm !== input.name) {
      throw badRequest(
        `Este job borra archivos en el destino. Confirma escribiendo el nombre del job: ${input.name}`,
      );
    }

    const clash = this.app.db.select().from(jobsTable).where(eq(jobsTable.name, input.name)).get();
    if (clash && clash.id !== existingId) throw conflict(`Ya existe un job llamado "${input.name}"`);
  }

  private writeDestinations(jobId: string, destinations: RemotePath[]): void {
    this.app.db.delete(jobDestinations).where(eq(jobDestinations.jobId, jobId)).run();
    for (const [position, destination] of destinations.entries()) {
      this.app.db
        .insert(jobDestinations)
        .values({
          id: randomUUID(),
          jobId,
          remote: destination.remote,
          path: sanitizePath(destination.path),
          position,
        })
        .run();
    }
  }

  create(input: JobInput): Job {
    this.validate(input);
    const id = randomUUID();
    const now = new Date().toISOString();

    this.app.db
      .insert(jobsTable)
      .values({
        id,
        name: input.name,
        mode: input.mode,
        sourceRemote: input.source.remote,
        sourcePath: sanitizePath(input.source.path),
        options: input.options,
        cron: input.cron,
        timezone: input.timezone,
        enabled: input.enabled,
        webhookUrl: input.webhookUrl,
        notifyOnSuccess: input.notifyOnSuccess,
        notifyOnFailure: input.notifyOnFailure,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    this.writeDestinations(id, input.destinations);

    const job = this.get(id);
    this.app.scheduler.register(job);
    this.app.logs.write('info', 'jobs', `Job "${job.name}" creado (${job.scheduleLabel})`, undefined, {
      jobId: id,
    });
    return job;
  }

  update(id: string, input: JobInput): Job {
    this.get(id); // 404 if missing
    this.validate(input, id);

    this.app.db
      .update(jobsTable)
      .set({
        name: input.name,
        mode: input.mode,
        sourceRemote: input.source.remote,
        sourcePath: sanitizePath(input.source.path),
        options: input.options,
        cron: input.cron,
        timezone: input.timezone,
        enabled: input.enabled,
        webhookUrl: input.webhookUrl,
        notifyOnSuccess: input.notifyOnSuccess,
        notifyOnFailure: input.notifyOnFailure,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobsTable.id, id))
      .run();
    this.writeDestinations(id, input.destinations);

    const job = this.get(id);
    this.app.scheduler.register(job);
    this.app.logs.write('info', 'jobs', `Job "${job.name}" actualizado`, undefined, { jobId: id });
    return job;
  }

  remove(id: string): void {
    const job = this.get(id);
    this.app.scheduler.unregister(id);
    this.app.db.delete(jobsTable).where(eq(jobsTable.id, id)).run();
    this.app.logs.write('warn', 'jobs', `Job "${job.name}" eliminado`);
  }

  duplicate(id: string): Job {
    const job = this.get(id);
    let name = `${job.name} (copia)`;
    let attempt = 2;
    while (this.app.db.select().from(jobsTable).where(eq(jobsTable.name, name)).get()) {
      name = `${job.name} (copia ${attempt})`;
      attempt += 1;
    }

    return this.create({
      name,
      mode: job.mode,
      source: job.source,
      destinations: job.destinations,
      options: job.options,
      cron: job.cron,
      timezone: job.timezone,
      // A duplicate starts disabled so it cannot fire before it is reviewed.
      enabled: false,
      webhookUrl: job.webhookUrl,
      notifyOnSuccess: job.notifyOnSuccess,
      notifyOnFailure: job.notifyOnFailure,
      confirm: name,
    });
  }

  /** Launch a job now. Used by the "Ejecutar ahora" button and the scheduler. */
  async run(id: string, override: { dryRun?: boolean } = {}): Promise<Run> {
    const job = this.get(id);
    const options: TransferOptions = {
      ...job.options,
      ...(override.dryRun === undefined ? {} : { dryRun: override.dryRun }),
    };

    return this.app.transfers.start({
      mode: job.mode,
      source: job.source,
      destinations: job.destinations,
      items: [],
      options,
      label: `${job.name} · ${job.mode}${options.dryRun ? ' (dry-run)' : ''}`,
      jobId: job.id,
      jobName: job.name,
      // The destructive confirmation was given when the job was saved.
      confirm: job.name,
    });
  }

  history(id: string): Run[] {
    this.get(id);
    return this.app.runs.history(id);
  }

  /** Natural-language description plus the next five executions. */
  preview(expression: string, timezone: string): CronPreview {
    if (!cron.validate(expression)) {
      return { valid: false, description: '', next: [], error: 'Expresión cron no válida' };
    }
    try {
      const iterator = CronExpressionParser.parse(expression, { tz: timezone });
      return {
        valid: true,
        description: describeCron(expression),
        next: Array.from({ length: 5 }, () => iterator.next().toDate().toISOString()),
      };
    } catch (error) {
      return {
        valid: false,
        description: '',
        next: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
