import type { LogLevel } from "./common.js";

export interface RcloneConnectionSettings {
  url: string;
  user: string;
  /** Always returned masked; send a new value to replace it. */
  passwordSet: boolean;
}

export type NotificationProvider = "telegram" | "discord" | "ntfy" | "webhook";

export interface NotificationChannelBase {
  id: string;
  name: string;
  enabled: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
}

export type NotificationChannel =
  | (NotificationChannelBase & {
      provider: "telegram";
      config: { tokenSet: boolean; chatId: string; messageThreadId: string | null };
    })
  | (NotificationChannelBase & {
      provider: "discord";
      config: { webhookUrlSet: boolean; username: string | null };
    })
  | (NotificationChannelBase & {
      provider: "ntfy";
      config: {
        serverUrl: string;
        topic: string;
        tokenSet: boolean;
        priority: number;
      };
    })
  | (NotificationChannelBase & {
      provider: "webhook";
      config: { urlSet: boolean; template: string | null; headersSet: boolean };
    });

export interface AppSettings {
  rclone: RcloneConnectionSettings;
  defaults: {
    transfers: number;
    checkers: number;
    bwlimit: string | null;
    logLevel: LogLevel;
  };
  historyRetentionDays: number;
  notifications: NotificationChannel[];
  /** @deprecated Migrated to `notifications`. */
  webhookUrl: string | null;
  /** @deprecated Migrated to `notifications`. */
  webhookTemplate: string | null;
  timezone: string;
  accentColor: string;
}

export const DEFAULT_SETTINGS: Omit<AppSettings, "rclone"> = {
  defaults: {
    transfers: 4,
    checkers: 8,
    bwlimit: null,
    logLevel: "info",
  },
  historyRetentionDays: 30,
  notifications: [],
  webhookUrl: null,
  webhookTemplate: null,
  timezone: "UTC",
  accentColor: "#f97316",
};

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}
