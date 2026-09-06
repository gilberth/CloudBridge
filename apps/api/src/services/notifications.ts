import type { FastifyInstance } from "fastify";
import type { Job, Run } from "@cloudbridge/shared";
import { humanBytes, humanDuration } from "../lib/format.js";
import { createNotificationAdapter } from "./notification-adapters.js";
import type {
  NotificationAdapter,
  NotificationEvent,
  NotificationFailedFile,
} from "./notification-types.js";
import type { ResolvedNotificationChannel } from "./settings.js";

export type NotificationOutcome = "success" | "error";
export type NotificationAdapterFactory = (
  channel: ResolvedNotificationChannel,
) => NotificationAdapter;

/** Delivers one transfer event to every matching global notification channel. */
export class NotificationService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly adapterFactory: NotificationAdapterFactory = createNotificationAdapter,
  ) {}

  private event(
    run: Run | null,
    outcome: NotificationOutcome,
    error: string | null,
    failedFiles: NotificationFailedFile[],
    job: Job | null,
  ): NotificationEvent {
    const now = new Date().toISOString();
    const source = run?.source ?? job?.source ?? null;
    const destinations = run?.destinations ?? job?.destinations ?? [];
    return {
      outcome,
      job: run?.jobName ?? job?.name ?? run?.label ?? "CloudBridge",
      mode: run?.mode ?? job?.mode ?? "copy",
      source: source ? `${source.remote}:${source.path}` : "",
      destinations: destinations.map((item) => `${item.remote}:${item.path}`),
      files: run?.files ?? 0,
      bytes: run?.bytes ?? 0,
      bytesHuman: humanBytes(run?.bytes ?? 0),
      duration: run?.durationMs != null ? humanDuration(run.durationMs) : "",
      error: error ?? run?.errorMessage ?? null,
      startedAt: run?.startedAt ?? now,
      finishedAt: run?.finishedAt ?? now,
      runId: run?.id ?? "",
      failedFiles,
    };
  }

  async send(
    run: Run | null,
    outcome: NotificationOutcome,
    error: string | null = null,
    failedFiles: NotificationFailedFile[] = [],
    job: Job | null = null,
  ): Promise<void> {
    const channels = this.app.settings
      .notificationChannels()
      .filter(
        (channel) =>
          channel.enabled &&
          (outcome === "success" ? channel.notifyOnSuccess : channel.notifyOnFailure),
      );
    if (channels.length === 0) return;

    const event = this.event(run, outcome, error, failedFiles, job);
    const results = await Promise.allSettled(
      channels.map((channel) => this.adapterFactory(channel).send(event)),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      const channel = channels[index]!;
      this.app.logs.write(
        "warn",
        "notification",
        result.reason instanceof Error
          ? result.reason.message
          : `No se pudo entregar en ${channel.name}`,
        { channelId: channel.id, provider: channel.provider },
        { jobId: run?.jobId ?? job?.id ?? null, runId: run?.id ?? null },
      );
    });
  }

  async test(channel: ResolvedNotificationChannel): Promise<void> {
    await this.adapterFactory(channel).send(this.event(null, "success", null, [], null));
  }
}
