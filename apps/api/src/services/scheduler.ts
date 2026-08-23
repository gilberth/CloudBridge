import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyInstance } from 'fastify';
import type { Job, Run } from '@cloudbridge/shared';

/**
 * Cron scheduler for saved jobs. One node-cron task per enabled job with a
 * schedule; disabled jobs and manual ones hold no task at all.
 */
export class Scheduler {
  private readonly tasks = new Map<string, ScheduledTask>();

  constructor(private readonly app: FastifyInstance) {}

  /** (Re)register a job. Called on boot and after every create/update. */
  register(job: Job): void {
    this.unregister(job.id);
    if (!job.enabled || !job.cron) return;
    if (!cron.validate(job.cron)) {
      this.app.logs.write('error', 'scheduler', `Cron inválido en "${job.name}": ${job.cron}`, undefined, {
        jobId: job.id,
      });
      return;
    }

    const task = cron.schedule(
      job.cron,
      () => {
        void this.fire(job.id);
      },
      { timezone: job.timezone },
    );
    task.unref?.();
    this.tasks.set(job.id, task);
  }

  unregister(jobId: string): void {
    const task = this.tasks.get(jobId);
    if (!task) return;
    void task.destroy();
    this.tasks.delete(jobId);
  }

  /** Load every job from the database and arm the enabled ones. */
  start(): void {
    const jobs = this.app.jobs.list();
    for (const job of jobs) this.register(job);
    const armed = this.tasks.size;
    this.app.log.info({ jobs: jobs.length, armed }, 'Scheduler iniciado');
  }

  stop(): void {
    for (const jobId of [...this.tasks.keys()]) this.unregister(jobId);
  }

  get armedCount(): number {
    return this.tasks.size;
  }

  private async fire(jobId: string): Promise<void> {
    let job: Job;
    try {
      job = this.app.jobs.get(jobId);
    } catch {
      // The job was deleted between the tick and here.
      this.unregister(jobId);
      return;
    }

    if (!job.enabled) return;

    // Skip the tick if the previous execution of this job is still going.
    const active = this.app.runs.active().find((run) => run.jobId === jobId && run.status === 'running');
    if (active) {
      this.app.logs.write(
        'warn',
        'scheduler',
        `"${job.name}" se salta esta ejecución: la anterior sigue en curso`,
        undefined,
        { jobId, runId: active.id },
      );
      return;
    }

    try {
      const run = await this.app.jobs.run(jobId);
      this.app.logs.write('info', 'scheduler', `"${job.name}" lanzado por programación`, undefined, {
        jobId,
        runId: run.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.app.logs.write('error', 'scheduler', `"${job.name}" no pudo lanzarse: ${message}`, undefined, {
        jobId,
      });
      void this.app.notifications.send(job, null, 'error', message);
    }
  }
}
