import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  notificationChannelInputSchema,
  settingsUpdateSchema,
} from "@cloudbridge/shared";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema.js";
import { SettingsService } from "../settings.js";

const base = {
  id: "channel-main",
  name: "Canal principal",
  enabled: true,
  notifyOnSuccess: true,
  notifyOnFailure: true,
};

describe("notificationChannelInputSchema", () => {
  it("acepta un canal Telegram con sus campos específicos", () => {
    const result = notificationChannelInputSchema.parse({
      ...base,
      provider: "telegram",
      config: { token: "bot-secret", chatId: "-100123", messageThreadId: "42" },
    });

    expect(result.provider).toBe("telegram");
  });

  it("acepta un servidor ntfy HTTP de la red interna", () => {
    const result = notificationChannelInputSchema.parse({
      ...base,
      provider: "ntfy",
      config: { serverUrl: "http://ntfy:80", topic: "cloudbridge", priority: 4 },
    });

    expect(result.provider).toBe("ntfy");
  });

  it("rechaza protocolos que no sean HTTP o HTTPS", () => {
    expect(() =>
      notificationChannelInputSchema.parse({
        ...base,
        provider: "discord",
        config: { webhookUrl: "file:///tmp/hook" },
      }),
    ).toThrow();
  });

  it("admite secretos omitidos al editar un canal ya configurado", () => {
    const result = settingsUpdateSchema.parse({
      notifications: [
        { ...base, provider: "telegram", config: { chatId: "-100123" } },
        { ...base, id: "discord-main", provider: "discord", config: {} },
        {
          ...base,
          id: "webhook-main",
          provider: "webhook",
          config: { template: null },
        },
      ],
    });

    expect(result.notifications).toHaveLength(3);
  });
});

function createService() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  const db = drizzle(sqlite, { schema });
  const env = loadEnv({
    NODE_ENV: "test",
    RCLONE_RC_USER: "test",
    RCLONE_RC_PASS: "test-password",
    JWT_SECRET: "0123456789abcdef0123456789abcdef",
  });
  return { sqlite, service: new SettingsService(db, env) };
}

describe("SettingsService notifications", () => {
  it("cifra secretos y solo devuelve indicadores públicos", () => {
    const { sqlite, service } = createService();

    service.update({
      notifications: [
        {
          ...base,
          provider: "telegram",
          config: { token: "bot-secret", chatId: "-100123" },
        },
      ],
    });

    const raw = sqlite
      .prepare("SELECT value FROM settings WHERE key = 'notifications'")
      .get() as { value: string };
    expect(raw.value).not.toContain("bot-secret");
    expect(service.get().notifications[0]).toMatchObject({
      provider: "telegram",
      config: { tokenSet: true, chatId: "-100123" },
    });
    expect(service.notificationChannels()[0]).toMatchObject({
      provider: "telegram",
      config: { token: "bot-secret", chatId: "-100123" },
    });
  });

  it("conserva el secreto almacenado cuando una edición lo omite", () => {
    const { service } = createService();
    service.update({
      notifications: [
        {
          ...base,
          provider: "discord",
          config: { webhookUrl: "https://discord.com/api/webhooks/1/secret" },
        },
      ],
    });

    service.update({
      notifications: [
        {
          ...base,
          name: "Discord renombrado",
          provider: "discord",
          config: { username: "CloudBridge" },
        },
      ],
    });

    expect(service.notificationChannels()[0]).toMatchObject({
      name: "Discord renombrado",
      config: { webhookUrl: "https://discord.com/api/webhooks/1/secret" },
    });
  });

  it("migra el webhook global anterior como canal genérico", () => {
    const { sqlite, service } = createService();
    sqlite.prepare("INSERT INTO settings (key, value) VALUES ('app', ?)").run(
      JSON.stringify({
        webhookUrl: "https://example.com/hook",
        webhookTemplate: '{"text":"{{status}}"}',
      }),
    );

    expect(service.get().notifications).toEqual([
      expect.objectContaining({
        id: "webhook-legacy",
        provider: "webhook",
        config: expect.objectContaining({ urlSet: true }),
      }),
    ]);
    expect(service.notificationChannels()[0]).toMatchObject({
      config: { url: "https://example.com/hook" },
    });
  });

  it("conserva la URL heredada cuando se guarda el canal migrado", () => {
    const { sqlite, service } = createService();
    sqlite.prepare("INSERT INTO settings (key, value) VALUES ('app', ?)").run(
      JSON.stringify({
        webhookUrl: "https://example.com/legacy-secret",
        webhookTemplate: null,
      }),
    );

    const migrated = service.get().notifications[0];
    if (migrated.provider !== "webhook") throw new Error("Canal inesperado");
    service.update({
      notifications: [
        {
          id: migrated.id,
          name: migrated.name,
          provider: "webhook",
          enabled: migrated.enabled,
          notifyOnSuccess: migrated.notifyOnSuccess,
          notifyOnFailure: migrated.notifyOnFailure,
          config: { template: migrated.config.template },
        },
      ],
    });

    expect(service.notificationChannels()[0]).toMatchObject({
      config: { url: "https://example.com/legacy-secret" },
    });
  });
});
