import type { ResolvedNotificationChannel } from "./settings.js";
import {
  formatDefaultMessage,
  renderJsonTemplate,
  truncateMessage,
} from "./notification-format.js";
import type { NotificationAdapter, NotificationEvent } from "./notification-types.js";

const LABELS = {
  telegram: "Telegram",
  discord: "Discord",
  ntfy: "ntfy",
  webhook: "Webhook",
} as const;

async function deliver(
  channel: ResolvedNotificationChannel,
  url: string,
  init: RequestInit,
): Promise<void> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(
        `${LABELS[channel.provider]} "${channel.name}" respondió ${response.status}`,
      );
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith(LABELS[channel.provider]))
      throw cause;
    throw new Error(
      `No se pudo entregar en ${LABELS[channel.provider]} "${channel.name}"`,
    );
  }
}

export function createNotificationAdapter(
  channel: ResolvedNotificationChannel,
): NotificationAdapter {
  switch (channel.provider) {
    case "telegram":
      return {
        async send(event) {
          const threadId = channel.config.messageThreadId?.trim();
          const body: Record<string, unknown> = {
            chat_id: channel.config.chatId,
            text: truncateMessage(formatDefaultMessage(event), 4096),
            disable_web_page_preview: true,
          };
          if (threadId && /^\d+$/.test(threadId))
            body.message_thread_id = Number(threadId);
          await deliver(
            channel,
            `https://api.telegram.org/bot${channel.config.token}/sendMessage`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
          );
        },
      };
    case "discord":
      return {
        async send(event) {
          await deliver(channel, channel.config.webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              content: truncateMessage(formatDefaultMessage(event), 2000),
              ...(channel.config.username ? { username: channel.config.username } : {}),
            }),
          });
        },
      };
    case "ntfy":
      return {
        async send(event) {
          await deliver(
            channel,
            `${channel.config.serverUrl.replace(/\/+$/, "")}/${encodeURIComponent(channel.config.topic)}`,
            {
              method: "POST",
              headers: {
                "content-type": "text/plain; charset=utf-8",
                Title: `CloudBridge: ${event.outcome === "success" ? "Completada" : "Fallida"}`,
                Priority: String(channel.config.priority),
                ...(channel.config.token
                  ? { Authorization: `Bearer ${channel.config.token}` }
                  : {}),
              },
              body: truncateMessage(formatDefaultMessage(event), 4096),
            },
          );
        },
      };
    case "webhook":
      return {
        async send(event: NotificationEvent) {
          await deliver(channel, channel.config.url, {
            method: "POST",
            headers: { "content-type": "application/json", ...channel.config.headers },
            body: channel.config.template
              ? renderJsonTemplate(channel.config.template, event)
              : JSON.stringify(event),
          });
        },
      };
  }
}
