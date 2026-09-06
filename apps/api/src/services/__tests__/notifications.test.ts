import type { FastifyInstance } from "fastify";
import type { Run } from "@cloudbridge/shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationAdapter } from "../notification-types.js";
import type { ResolvedNotificationChannel } from "../settings.js";
import { NotificationService } from "../notifications.js";

const run: Run = {
  id: "run-1",
  jobId: null,
  jobName: null,
  label: "copy drive:Fotos → backup:Fotos",
  mode: "copy",
  status: "success",
  dryRun: false,
  group: "run:run-1",
  rcloneJobIds: [42],
  source: { remote: "drive", path: "Fotos" },
  destinations: [{ remote: "backup", path: "Fotos" }],
  startedAt: "2026-09-06T10:00:00.000Z",
  finishedAt: "2026-09-06T10:00:04.000Z",
  durationMs: 4000,
  files: 12,
  bytes: 1024,
  errors: 0,
  errorMessage: null,
  dryRunReport: null,
};

function channel(
  id: string,
  rules: Partial<
    Pick<ResolvedNotificationChannel, "enabled" | "notifyOnSuccess" | "notifyOnFailure">
  > = {},
): ResolvedNotificationChannel {
  return {
    id,
    name: id,
    provider: "ntfy",
    enabled: rules.enabled ?? true,
    notifyOnSuccess: rules.notifyOnSuccess ?? true,
    notifyOnFailure: rules.notifyOnFailure ?? true,
    config: { serverUrl: "http://ntfy", topic: id, token: null, priority: 3 },
  };
}

describe("NotificationService", () => {
  it("entrega un éxito a todos los canales habilitados para éxitos", async () => {
    const channels = [
      channel("one"),
      channel("two", { enabled: false }),
      channel("three", { notifyOnSuccess: false }),
      channel("four"),
    ];
    const sends = new Map(channels.map((item) => [item.id, vi.fn()]));
    const app = {
      settings: { notificationChannels: () => channels },
      logs: { write: vi.fn() },
    } as unknown as FastifyInstance;
    const service = new NotificationService(app, (item): NotificationAdapter => ({
      send: sends.get(item.id)!,
    }));

    await service.send(run, "success");

    expect(sends.get("one")).toHaveBeenCalledOnce();
    expect(sends.get("two")).not.toHaveBeenCalled();
    expect(sends.get("three")).not.toHaveBeenCalled();
    expect(sends.get("four")).toHaveBeenCalledOnce();
  });

  it("continúa con los demás canales y registra un fallo sanitizado", async () => {
    const channels = [channel("broken"), channel("healthy")];
    const healthy = vi.fn();
    const app = {
      settings: { notificationChannels: () => channels },
      logs: { write: vi.fn() },
    } as unknown as FastifyInstance;
    const service = new NotificationService(app, (item): NotificationAdapter => ({
      send:
        item.id === "broken"
          ? vi.fn().mockRejectedValue(new Error('ntfy "broken" respondió 500'))
          : healthy,
    }));

    await service.send(run, "error", "falló la copia");

    expect(healthy).toHaveBeenCalledOnce();
    expect(app.logs.write).toHaveBeenCalledWith(
      "warn",
      "notification",
      'ntfy "broken" respondió 500',
      { channelId: "broken", provider: "ntfy" },
      { jobId: null, runId: "run-1" },
    );
  });
});
