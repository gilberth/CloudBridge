import { describe, expect, it } from "vitest";
import {
  notificationChannelInputSchema,
  settingsUpdateSchema,
} from "@cloudbridge/shared";

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
