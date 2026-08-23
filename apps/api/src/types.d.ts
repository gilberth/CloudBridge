import type { RcloneClient } from './rclone/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Typed client for the rclone rc daemon. */
    rclone: RcloneClient;
    appVersion: string;
  }
}

export {};
