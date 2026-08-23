import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'user'] })
      .notNull()
      .default('user'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [uniqueIndex('users_username_idx').on(table.username)],
);

/**
 * One row per issued session token. The JWT carries the `jti`, so logging out
 * (or deleting a user) revokes the cookie server-side instead of waiting for it
 * to expire.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    jti: text('jti').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(now),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    mode: text('mode', { enum: ['copy', 'sync', 'move', 'bisync'] }).notNull(),
    sourceRemote: text('source_remote').notNull(),
    sourcePath: text('source_path').notNull().default(''),
    /** Serialised TransferOptions. */
    options: text('options', { mode: 'json' }).notNull(),
    cron: text('cron'),
    timezone: text('timezone').notNull().default('UTC'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    webhookUrl: text('webhook_url'),
    notifyOnSuccess: integer('notify_on_success', { mode: 'boolean' }).notNull().default(false),
    notifyOnFailure: integer('notify_on_failure', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [uniqueIndex('jobs_name_idx').on(table.name)],
);

/** A job can fan out to several destinations in a single execution (1:N). */
export const jobDestinations = sqliteTable(
  'job_destinations',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    remote: text('remote').notNull(),
    path: text('path').notNull().default(''),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('job_destinations_job_idx').on(table.jobId)],
);

/**
 * One execution. `jobId` is null for ad-hoc Explorer operations, so the
 * Transfers view and a job's history read from the same table.
 */
export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    jobName: text('job_name'),
    label: text('label').notNull(),
    mode: text('mode', { enum: ['copy', 'sync', 'move', 'bisync'] }).notNull(),
    status: text('status', {
      enum: ['running', 'paused', 'success', 'error', 'cancelled', 'interrupted'],
    })
      .notNull()
      .default('running'),
    dryRun: integer('dry_run', { mode: 'boolean' }).notNull().default(false),
    /** rclone stats group used to isolate this run's progress. */
    group: text('group_name').notNull(),
    rcloneJobIds: text('rclone_job_ids', { mode: 'json' }).notNull(),
    sourceRemote: text('source_remote'),
    sourcePath: text('source_path'),
    /** Serialised RemotePath[]. */
    destinations: text('destinations', { mode: 'json' }).notNull(),
    /** Everything needed to re-issue the operation when resuming. */
    params: text('params', { mode: 'json' }),
    startedAt: text('started_at').notNull().default(now),
    finishedAt: text('finished_at'),
    files: integer('files').notNull().default(0),
    bytes: integer('bytes').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    errorMessage: text('error_message'),
    dryRunReport: text('dry_run_report'),
  },
  (table) => [
    index('runs_job_idx').on(table.jobId),
    index('runs_status_idx').on(table.status),
    index('runs_started_idx').on(table.startedAt),
  ],
);

export const logs = sqliteTable(
  'logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: text('ts').notNull().default(now),
    level: text('level', { enum: ['debug', 'info', 'warn', 'error'] })
      .notNull()
      .default('info'),
    source: text('source').notNull().default('app'),
    jobId: text('job_id'),
    runId: text('run_id'),
    message: text('message').notNull(),
    meta: text('meta', { mode: 'json' }),
  },
  (table) => [
    index('logs_ts_idx').on(table.ts),
    index('logs_level_idx').on(table.level),
    index('logs_job_idx').on(table.jobId),
    index('logs_run_idx').on(table.runId),
  ],
);

/** Simple key/value store for application settings. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().default(now),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type JobDestinationRow = typeof jobDestinations.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type LogRow = typeof logs.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
