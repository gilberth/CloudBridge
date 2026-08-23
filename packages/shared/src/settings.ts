import type { LogLevel } from './common.js';

export interface RcloneConnectionSettings {
  url: string;
  user: string;
  /** Always returned masked; send a new value to replace it. */
  passwordSet: boolean;
}

export interface AppSettings {
  rclone: RcloneConnectionSettings;
  defaults: {
    transfers: number;
    checkers: number;
    bwlimit: string | null;
    logLevel: LogLevel;
  };
  historyRetentionDays: number;
  webhookUrl: string | null;
  webhookTemplate: string | null;
  timezone: string;
  accentColor: string;
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'rclone'> = {
  defaults: {
    transfers: 4,
    checkers: 8,
    bwlimit: null,
    logLevel: 'info',
  },
  historyRetentionDays: 30,
  webhookUrl: null,
  webhookTemplate: null,
  timezone: 'UTC',
  accentColor: '#f97316',
};

export interface SessionUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
}
