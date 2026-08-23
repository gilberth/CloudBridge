import type { FastifyInstance } from 'fastify';
import type { Job, Run } from '@cloudbridge/shared';
import { humanBytes, humanDuration } from '../lib/format.js';

export type NotificationOutcome = 'success' | 'error';

/**
 * Webhook notifications when a job finishes. The payload is a JSON template
 * from Settings with `{{placeholders}}`; without a template a default JSON
 * body is posted.
 */
export class NotificationService {
  constructor(private readonly app: FastifyInstance) {}

  private variables(job: Job | null, run: Run | null, outcome: NotificationOutcome, error: string | null) {
    return {
      job: job?.name ?? run?.jobName ?? 'CloudBridge',
      jobId: job?.id ?? run?.jobId ?? '',
      status: outcome,
      mode: run?.mode ?? job?.mode ?? '',
      files: String(run?.files ?? 0),
      bytes: String(run?.bytes ?? 0),
      bytesHuman: humanBytes(run?.bytes ?? 0),
      duration: run?.durationMs != null ? humanDuration(run.durationMs) : '',
      errors: String(run?.errors ?? 0),
      error: error ?? run?.errorMessage ?? '',
      runId: run?.id ?? '',
      startedAt: run?.startedAt ?? new Date().toISOString(),
      finishedAt: run?.finishedAt ?? new Date().toISOString(),
      source: run?.source ? `${run.source.remote}:${run.source.path}` : '',
      destinations: (run?.destinations ?? [])
        .map((destination) => `${destination.remote}:${destination.path}`)
        .join(', '),
    };
  }

  private render(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
      const value = variables[key] ?? '';
      // Escape so the rendered value stays valid inside a JSON string.
      return JSON.stringify(value).slice(1, -1);
    });
  }

  async send(
    job: Job | null,
    run: Run | null,
    outcome: NotificationOutcome,
    error: string | null = null,
  ): Promise<void> {
    const settings = this.app.settings.get();
    const url = job?.webhookUrl ?? settings.webhookUrl;
    if (!url) return;

    if (job) {
      if (outcome === 'success' && !job.notifyOnSuccess) return;
      if (outcome === 'error' && !job.notifyOnFailure) return;
    }

    const variables = this.variables(job, run, outcome, error);
    const body = settings.webhookTemplate
      ? this.render(settings.webhookTemplate, variables)
      : JSON.stringify(variables);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.app.logs.write(
          'warn',
          'webhook',
          `El webhook respondió ${response.status}`,
          { url },
          { jobId: job?.id ?? null, runId: run?.id ?? null },
        );
      }
    } catch (cause) {
      this.app.logs.write(
        'warn',
        'webhook',
        `No se pudo entregar el webhook: ${cause instanceof Error ? cause.message : String(cause)}`,
        { url },
        { jobId: job?.id ?? null, runId: run?.id ?? null },
      );
    }
  }
}
