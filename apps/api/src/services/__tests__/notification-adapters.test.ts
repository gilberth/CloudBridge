import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedNotificationChannel } from "../settings.js";
import { createNotificationAdapter } from "../notification-adapters.js";
import type { NotificationEvent } from "../notification-types.js";

const event: NotificationEvent = {
  outcome: "error",
  job: "Copia fotos",
  mode: "copy",
  source: "drive:Fotos",
  destinations: ["backup:Fotos"],
  files: 12,
  bytes: 1024,
  bytesHuman: "1.0 KB",
  duration: "4s",
  error: "permiso denegado",
  startedAt: "2026-09-06T10:00:00.000Z",
  finishedAt: "2026-09-06T10:00:04.000Z",
  runId: "run-1",
  failedFiles: [{ name: "privada.jpg", error: "permiso denegado", bytes: 0, size: 100 }],
};

const base = {
  id: "main",
  name: "Principal",
  enabled: true,
  notifyOnSuccess: true,
  notifyOnFailure: true,
};

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(status === 204 ? null : "", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("notification adapters", () => {
  it("envía Telegram con chat, tema y mensaje", async () => {
    const fetchMock = mockFetch();
    const channel: ResolvedNotificationChannel = {
      ...base,
      provider: "telegram",
      config: { token: "bot-secret", chatId: "-100123", messageThreadId: "42" },
    };

    await createNotificationAdapter(channel).send(event);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-secret/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"chat_id":"-100123"'),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      message_thread_id: 42,
      disable_web_page_preview: true,
    });
  });

  it("envía Discord con content y username", async () => {
    const fetchMock = mockFetch(204);
    const channel: ResolvedNotificationChannel = {
      ...base,
      provider: "discord",
      config: {
        webhookUrl: "https://discord.com/api/webhooks/1/secret",
        username: "CloudBridge",
      },
    };

    await createNotificationAdapter(channel).send(event);

    expect(fetchMock).toHaveBeenCalledWith(
      channel.config.webhookUrl,
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      username: "CloudBridge",
    });
  });

  it("envía ntfy como texto con prioridad y token opcional", async () => {
    const fetchMock = mockFetch();
    const channel: ResolvedNotificationChannel = {
      ...base,
      provider: "ntfy",
      config: {
        serverUrl: "http://ntfy:80",
        topic: "cloudbridge",
        token: "ntfy-secret",
        priority: 4,
      },
    };

    await createNotificationAdapter(channel).send(event);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://ntfy:80/cloudbridge",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer ntfy-secret",
          Priority: "4",
        }),
      }),
    );
  });

  it("renderiza el webhook genérico con cabeceras configuradas", async () => {
    const fetchMock = mockFetch();
    const channel: ResolvedNotificationChannel = {
      ...base,
      provider: "webhook",
      config: {
        url: "https://example.com/hook",
        template: '{"text":"{{job}}: {{error}}"}',
        headers: { "X-Api-Key": "header-secret" },
      },
    };

    await createNotificationAdapter(channel).send(event);

    expect(fetchMock).toHaveBeenCalledWith(
      channel.config.url,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Api-Key": "header-secret" }),
        body: '{"text":"Copia fotos: permiso denegado"}',
      }),
    );
  });

  it("lanza un error sanitizado ante una respuesta no exitosa", async () => {
    mockFetch(401);
    const channel: ResolvedNotificationChannel = {
      ...base,
      provider: "telegram",
      config: { token: "do-not-leak", chatId: "1", messageThreadId: null },
    };

    await expect(createNotificationAdapter(channel).send(event)).rejects.toThrow(
      'Telegram "Principal" respondió 401',
    );
    await expect(createNotificationAdapter(channel).send(event)).rejects.not.toThrow(
      "do-not-leak",
    );
  });
});
