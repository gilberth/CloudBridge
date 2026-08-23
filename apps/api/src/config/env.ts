import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** Absolute path of the SQLite file. The parent directory is created on boot. */
  DATABASE_PATH: z.string().default('./data/cloudbridge.db'),

  /** Base URL of the rclone rc daemon. Must stay on the internal Docker network. */
  RCLONE_RC_URL: z.string().url().default('http://rclone:5572'),
  RCLONE_RC_USER: z.string().min(1),
  RCLONE_RC_PASS: z.string().min(1),
  RCLONE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
  /** Path of the daemon's rclone.conf, mounted read-only for raw export. */
  RCLONE_CONFIG_PATH: z.string().default('/config/rclone/rclone.conf'),

  /** Signing key for the session JWT. Generate with `openssl rand -hex 32`. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  COOKIE_SECURE: booleanish.default(false),
  COOKIE_NAME: z.string().default('cloudbridge_session'),

  /** Seed credentials for the first admin. Only used when no user exists yet. */
  ADMIN_USER: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  /** Directory holding the built web client; empty disables static serving. */
  WEB_DIST: z.string().default(''),

  /** Container timezone; also the scheduler default until Settings overrides it. */
  TZ: z.string().min(1).max(64).default('UTC'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRUST_PROXY: booleanish.default(false),

  /** Failed logins allowed per IP within the window. */
  LOGIN_RATE_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  LOGIN_RATE_WINDOW: z.string().default('5 minutes'),

  /** Interval of the core/stats poll broadcast over the websocket. */
  STATS_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(1000),

  /**
   * Own OAuth client for Google Drive remotes. rclone's default client_id is
   * shared across every rclone user in the world and is being retired during
   * 2026; it's also prone to rate limits and odd 404s on exports of native
   * Google Docs well before then. When set, every new `drive` remote gets
   * these injected automatically unless the caller already supplied its own
   * `client_id` — see `RemotesService.create()`.
   */
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}
