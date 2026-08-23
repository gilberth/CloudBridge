import type { FastifyInstance } from 'fastify';
import type { RcloneHealth } from '@cloudbridge/shared';
import { RcloneError, RcloneUnavailableError } from '../rclone/client.js';

/**
 * Liveness of CloudBridge plus reachability of the rclone daemon. Unauthenticated
 * on purpose so container health checks and the login screen can use it.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    const health = await probeRclone(app);
    return {
      status: 'ok',
      version: app.appVersion,
      rclone: health,
    };
  });
}

export async function probeRclone(app: FastifyInstance): Promise<RcloneHealth> {
  const checkedAt = new Date().toISOString();
  try {
    const version = await app.rclone.version();
    return { online: true, version: version.version, error: null, checkedAt };
  } catch (error) {
    const message =
      error instanceof RcloneUnavailableError || error instanceof RcloneError
        ? error.message
        : 'Error desconocido consultando el daemon rclone';
    app.log.warn({ err: error }, 'Sondeo del daemon rclone fallido');
    return { online: false, version: null, error: message, checkedAt };
  }
}
