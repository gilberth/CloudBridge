import { eq } from "drizzle-orm";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type NotificationChannelBase,
  type NotificationChannelInput,
  type SettingsUpdateInput,
} from "@cloudbridge/shared";
import type { Db } from "../db/index.js";
import { settings as settingsTable } from "../db/schema.js";
import type { Env } from "../config/env.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { badRequest } from "../lib/errors.js";

const APP_KEY = "app";
const RCLONE_KEY = "rclone";
const NOTIFICATIONS_KEY = "notifications";

interface StoredApp {
  defaults: AppSettings["defaults"];
  historyRetentionDays: number;
  webhookUrl: string | null;
  webhookTemplate: string | null;
  timezone: string;
  accentColor: string;
}

interface StoredRclone {
  url: string;
  user: string;
  /** AES-256-GCM ciphertext; never leaves the server. */
  password: string | null;
}

type StoredNotificationChannel =
  | (NotificationChannelBase & {
      provider: "telegram";
      config: { token: string; chatId: string; messageThreadId: string | null };
    })
  | (NotificationChannelBase & {
      provider: "discord";
      config: { webhookUrl: string; username: string | null };
    })
  | (NotificationChannelBase & {
      provider: "ntfy";
      config: {
        serverUrl: string;
        topic: string;
        token: string | null;
        priority: number;
      };
    })
  | (NotificationChannelBase & {
      provider: "webhook";
      config: { url: string; template: string | null; headers: string | null };
    });

export type ResolvedNotificationChannel =
  | (NotificationChannelBase & {
      provider: "telegram";
      config: { token: string; chatId: string; messageThreadId: string | null };
    })
  | (NotificationChannelBase & {
      provider: "discord";
      config: { webhookUrl: string; username: string | null };
    })
  | (NotificationChannelBase & {
      provider: "ntfy";
      config: {
        serverUrl: string;
        topic: string;
        token: string | null;
        priority: number;
      };
    })
  | (NotificationChannelBase & {
      provider: "webhook";
      config: { url: string; template: string | null; headers: Record<string, string> };
    });

export interface RcloneConnection {
  url: string;
  user: string;
  password: string;
}

/**
 * Application settings live in a small key/value table. Environment variables
 * are the source of truth for the rclone connection; a value saved in Settings
 * overrides them at runtime.
 */
export class SettingsService {
  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {}

  private readApp(): StoredApp {
    const row = this.db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, APP_KEY))
      .get();
    const stored = (row?.value as Partial<StoredApp> | undefined) ?? {};
    return {
      defaults: { ...DEFAULT_SETTINGS.defaults, ...stored.defaults },
      historyRetentionDays:
        stored.historyRetentionDays ?? DEFAULT_SETTINGS.historyRetentionDays,
      webhookUrl: stored.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl,
      webhookTemplate: stored.webhookTemplate ?? DEFAULT_SETTINGS.webhookTemplate,
      timezone: stored.timezone ?? this.env.TZ ?? DEFAULT_SETTINGS.timezone,
      accentColor: stored.accentColor ?? DEFAULT_SETTINGS.accentColor,
    };
  }

  private readRclone(): StoredRclone | null {
    const row = this.db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, RCLONE_KEY))
      .get();
    return (row?.value as StoredRclone | undefined) ?? null;
  }

  private readNotifications(): StoredNotificationChannel[] | null {
    const row = this.db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, NOTIFICATIONS_KEY))
      .get();
    return (row?.value as StoredNotificationChannel[] | undefined) ?? null;
  }

  private legacyNotification(): ResolvedNotificationChannel | null {
    const app = this.readApp();
    if (!app.webhookUrl) return null;
    return {
      id: "webhook-legacy",
      name: "Webhook migrado",
      provider: "webhook",
      enabled: true,
      notifyOnSuccess: true,
      notifyOnFailure: true,
      config: { url: app.webhookUrl, template: app.webhookTemplate, headers: {} },
    };
  }

  private write(key: string, value: unknown): void {
    this.db
      .insert(settingsTable)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value, updatedAt: new Date().toISOString() },
      })
      .run();
  }

  /** Effective rclone connection: stored override first, environment second. */
  connection(): RcloneConnection {
    const stored = this.readRclone();
    if (!stored) {
      return {
        url: this.env.RCLONE_RC_URL,
        user: this.env.RCLONE_RC_USER,
        password: this.env.RCLONE_RC_PASS,
      };
    }
    const password = stored.password
      ? decryptSecret(stored.password, this.env.JWT_SECRET)
      : null;
    return {
      url: stored.url || this.env.RCLONE_RC_URL,
      user: stored.user || this.env.RCLONE_RC_USER,
      password: password ?? this.env.RCLONE_RC_PASS,
    };
  }

  get(): AppSettings {
    const app = this.readApp();
    const stored = this.readRclone();
    const connection = this.connection();
    return {
      ...app,
      notifications: this.publicNotificationChannels(),
      rclone: {
        url: connection.url,
        user: connection.user,
        passwordSet: Boolean(stored?.password) || Boolean(this.env.RCLONE_RC_PASS),
      },
    };
  }

  update(patch: SettingsUpdateInput): AppSettings {
    const current = this.readApp();
    const previousNotifications = new Map(
      (this.readNotifications() ?? []).map((channel) => [channel.id, channel] as const),
    );
    if (patch.notifications && previousNotifications.size === 0 && current.webhookUrl) {
      previousNotifications.set(
        "webhook-legacy",
        this.storeResolvedChannel({
          id: "webhook-legacy",
          name: "Webhook migrado",
          provider: "webhook",
          enabled: true,
          notifyOnSuccess: true,
          notifyOnFailure: true,
          config: {
            url: current.webhookUrl,
            template: current.webhookTemplate,
            headers: {},
          },
        }),
      );
    }
    const next: StoredApp = {
      defaults: patch.defaults
        ? { ...current.defaults, ...patch.defaults }
        : current.defaults,
      historyRetentionDays: patch.historyRetentionDays ?? current.historyRetentionDays,
      webhookUrl:
        patch.notifications !== undefined
          ? null
          : patch.webhookUrl !== undefined
            ? patch.webhookUrl
            : current.webhookUrl,
      webhookTemplate:
        patch.notifications !== undefined
          ? null
          : patch.webhookTemplate !== undefined
            ? patch.webhookTemplate
            : current.webhookTemplate,
      timezone: patch.timezone ?? current.timezone,
      accentColor: patch.accentColor ?? current.accentColor,
    };
    this.write(APP_KEY, next);

    if (patch.notifications) {
      this.write(
        NOTIFICATIONS_KEY,
        patch.notifications.map((channel) =>
          this.storeInputChannel(channel, previousNotifications.get(channel.id)),
        ),
      );
    }

    if (patch.rclone) {
      const stored = this.readRclone();
      this.write(RCLONE_KEY, {
        url: patch.rclone.url,
        user: patch.rclone.user,
        // An omitted password keeps whatever was stored before.
        password: patch.rclone.password
          ? encryptSecret(patch.rclone.password, this.env.JWT_SECRET)
          : (stored?.password ?? null),
      } satisfies StoredRclone);
    }

    return this.get();
  }

  notificationChannels(): ResolvedNotificationChannel[] {
    const stored = this.readNotifications();
    if (stored === null) {
      const legacy = this.legacyNotification();
      return legacy ? [legacy] : [];
    }
    return stored.map((channel) => this.resolveChannel(channel));
  }

  private publicNotificationChannels(): AppSettings["notifications"] {
    return this.notificationChannels().map((channel) => {
      const base = {
        id: channel.id,
        name: channel.name,
        provider: channel.provider,
        enabled: channel.enabled,
        notifyOnSuccess: channel.notifyOnSuccess,
        notifyOnFailure: channel.notifyOnFailure,
      };
      switch (channel.provider) {
        case "telegram":
          return {
            ...base,
            provider: "telegram",
            config: {
              tokenSet: Boolean(channel.config.token),
              chatId: channel.config.chatId,
              messageThreadId: channel.config.messageThreadId,
            },
          };
        case "discord":
          return {
            ...base,
            provider: "discord",
            config: {
              webhookUrlSet: Boolean(channel.config.webhookUrl),
              username: channel.config.username,
            },
          };
        case "ntfy":
          return {
            ...base,
            provider: "ntfy",
            config: {
              serverUrl: channel.config.serverUrl,
              topic: channel.config.topic,
              tokenSet: Boolean(channel.config.token),
              priority: channel.config.priority,
            },
          };
        case "webhook":
          return {
            ...base,
            provider: "webhook",
            config: {
              urlSet: Boolean(channel.config.url),
              template: channel.config.template,
              headersSet: Object.keys(channel.config.headers).length > 0,
            },
          };
      }
    });
  }

  private requiredSecret(
    plaintext: string | undefined,
    encrypted: string | undefined,
    label: string,
  ): string {
    if (plaintext) return encryptSecret(plaintext, this.env.JWT_SECRET);
    if (encrypted) return encrypted;
    throw badRequest(`${label} es obligatorio`);
  }

  private storeInputChannel(
    input: NotificationChannelInput,
    previous: StoredNotificationChannel | undefined,
  ): StoredNotificationChannel {
    const same = previous?.provider === input.provider ? previous : undefined;
    const base = {
      id: input.id,
      name: input.name,
      enabled: input.enabled,
      notifyOnSuccess: input.notifyOnSuccess,
      notifyOnFailure: input.notifyOnFailure,
    };
    switch (input.provider) {
      case "telegram":
        return {
          ...base,
          provider: "telegram",
          config: {
            token: this.requiredSecret(
              input.config.token,
              same?.provider === "telegram" ? same.config.token : undefined,
              "El token de Telegram",
            ),
            chatId: input.config.chatId,
            messageThreadId: input.config.messageThreadId ?? null,
          },
        };
      case "discord":
        return {
          ...base,
          provider: "discord",
          config: {
            webhookUrl: this.requiredSecret(
              input.config.webhookUrl,
              same?.provider === "discord" ? same.config.webhookUrl : undefined,
              "La URL de Discord",
            ),
            username: input.config.username ?? null,
          },
        };
      case "ntfy":
        return {
          ...base,
          provider: "ntfy",
          config: {
            serverUrl: input.config.serverUrl.replace(/\/+$/, ""),
            topic: input.config.topic,
            token: input.config.token
              ? encryptSecret(input.config.token, this.env.JWT_SECRET)
              : same?.provider === "ntfy"
                ? same.config.token
                : null,
            priority: input.config.priority,
          },
        };
      case "webhook":
        return {
          ...base,
          provider: "webhook",
          config: {
            url: this.requiredSecret(
              input.config.url,
              same?.provider === "webhook" ? same.config.url : undefined,
              "La URL del webhook",
            ),
            template: input.config.template ?? null,
            headers: input.config.headers
              ? encryptSecret(JSON.stringify(input.config.headers), this.env.JWT_SECRET)
              : same?.provider === "webhook"
                ? same.config.headers
                : null,
          },
        };
    }
  }

  private storeResolvedChannel(
    channel: ResolvedNotificationChannel,
  ): StoredNotificationChannel {
    const input =
      channel.provider === "telegram"
        ? { ...channel, config: { ...channel.config } }
        : channel.provider === "discord"
          ? { ...channel, config: { ...channel.config } }
          : channel.provider === "ntfy"
            ? {
                ...channel,
                config: { ...channel.config, token: channel.config.token ?? undefined },
              }
            : {
                ...channel,
                config: {
                  url: channel.config.url,
                  template: channel.config.template,
                  headers: channel.config.headers,
                },
              };
    return this.storeInputChannel(input, undefined);
  }

  private resolveChannel(
    channel: StoredNotificationChannel,
  ): ResolvedNotificationChannel {
    const base = {
      id: channel.id,
      name: channel.name,
      enabled: channel.enabled,
      notifyOnSuccess: channel.notifyOnSuccess,
      notifyOnFailure: channel.notifyOnFailure,
    };
    switch (channel.provider) {
      case "telegram":
        return {
          ...base,
          provider: "telegram",
          config: {
            token: decryptSecret(channel.config.token, this.env.JWT_SECRET) ?? "",
            chatId: channel.config.chatId,
            messageThreadId: channel.config.messageThreadId,
          },
        };
      case "discord":
        return {
          ...base,
          provider: "discord",
          config: {
            webhookUrl:
              decryptSecret(channel.config.webhookUrl, this.env.JWT_SECRET) ?? "",
            username: channel.config.username,
          },
        };
      case "ntfy":
        return {
          ...base,
          provider: "ntfy",
          config: {
            serverUrl: channel.config.serverUrl,
            topic: channel.config.topic,
            token: channel.config.token
              ? decryptSecret(channel.config.token, this.env.JWT_SECRET)
              : null,
            priority: channel.config.priority,
          },
        };
      case "webhook": {
        const headers = channel.config.headers
          ? decryptSecret(channel.config.headers, this.env.JWT_SECRET)
          : null;
        return {
          ...base,
          provider: "webhook",
          config: {
            url: decryptSecret(channel.config.url, this.env.JWT_SECRET) ?? "",
            template: channel.config.template,
            headers: headers ? (JSON.parse(headers) as Record<string, string>) : {},
          },
        };
      }
    }
  }

  /** Global transfer defaults, applied whenever a job leaves a value unset. */
  transferDefaults(): { transfers: number; checkers: number; bwlimit: string | null } {
    const { defaults } = this.readApp();
    return {
      transfers: defaults.transfers,
      checkers: defaults.checkers,
      bwlimit: defaults.bwlimit,
    };
  }
}
