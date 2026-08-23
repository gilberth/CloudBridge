import { eq } from 'drizzle-orm';
import { DEFAULT_SETTINGS, type AppSettings, type SettingsUpdateInput } from '@cloudbridge/shared';
import type { Db } from '../db/index.js';
import { settings as settingsTable } from '../db/schema.js';
import type { Env } from '../config/env.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';

const APP_KEY = 'app';
const RCLONE_KEY = 'rclone';

interface StoredApp {
  defaults: AppSettings['defaults'];
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
    const row = this.db.select().from(settingsTable).where(eq(settingsTable.key, APP_KEY)).get();
    const stored = (row?.value as Partial<StoredApp> | undefined) ?? {};
    return {
      defaults: { ...DEFAULT_SETTINGS.defaults, ...stored.defaults },
      historyRetentionDays: stored.historyRetentionDays ?? DEFAULT_SETTINGS.historyRetentionDays,
      webhookUrl: stored.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl,
      webhookTemplate: stored.webhookTemplate ?? DEFAULT_SETTINGS.webhookTemplate,
      timezone: stored.timezone ?? this.env.TZ ?? DEFAULT_SETTINGS.timezone,
      accentColor: stored.accentColor ?? DEFAULT_SETTINGS.accentColor,
    };
  }

  private readRclone(): StoredRclone | null {
    const row = this.db.select().from(settingsTable).where(eq(settingsTable.key, RCLONE_KEY)).get();
    return (row?.value as StoredRclone | undefined) ?? null;
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
    const password = stored.password ? decryptSecret(stored.password, this.env.JWT_SECRET) : null;
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
      rclone: {
        url: connection.url,
        user: connection.user,
        passwordSet: Boolean(stored?.password) || Boolean(this.env.RCLONE_RC_PASS),
      },
    };
  }

  update(patch: SettingsUpdateInput): AppSettings {
    const current = this.readApp();
    const next: StoredApp = {
      defaults: patch.defaults ? { ...current.defaults, ...patch.defaults } : current.defaults,
      historyRetentionDays: patch.historyRetentionDays ?? current.historyRetentionDays,
      webhookUrl: patch.webhookUrl !== undefined ? patch.webhookUrl : current.webhookUrl,
      webhookTemplate:
        patch.webhookTemplate !== undefined ? patch.webhookTemplate : current.webhookTemplate,
      timezone: patch.timezone ?? current.timezone,
      accentColor: patch.accentColor ?? current.accentColor,
    };
    this.write(APP_KEY, next);

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
