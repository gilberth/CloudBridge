import type { SessionUser } from '@cloudbridge/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from './db/index.js';
import type { RcloneClient } from './rclone/client.js';
import type { SettingsService } from './services/settings.js';
import type { RemotesService } from './services/remotes.js';
import type { FsService } from './services/fs.js';
import type { RunsService } from './services/runs.js';
import type { LogService } from './services/logs.js';
import type { TransferService } from './services/transfers.js';
import type { JobsService } from './services/jobs.js';
import type { Scheduler } from './services/scheduler.js';
import type { StatsBroadcaster } from './services/stats.js';

declare module 'fastify' {
  interface FastifyInstance {
    appVersion: string;
    db: Db;
    /** Typed client for the rclone rc daemon; replaced when Settings change. */
    rclone: RcloneClient;
    /** Rebuild `app.rclone` from the current settings (or explicit values). */
    reloadRclone: (override?: { url: string; user: string; password: string }) => RcloneClient;
    settings: SettingsService;
    remotes: RemotesService;
    fs: FsService;
    runs: RunsService;
    logs: LogService;
    transfers: TransferService;
    jobs: JobsService;
    scheduler: Scheduler;
    stats: StatsBroadcaster;

    issueSession: (
      user: { id: string; username: string; role: 'admin' | 'user' },
      request: FastifyRequest,
    ) => Promise<string>;
    revokeSession: (jti: string) => void;
    setSessionCookie: (reply: FastifyReply, token: string) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireAdmin: (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    sessionUser?: SessionUser;
  }
}

export {};
