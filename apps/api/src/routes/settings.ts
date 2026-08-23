import type { FastifyInstance } from 'fastify';
import { settingsUpdateSchema } from '@cloudbridge/shared';
import { RcloneClient } from '../rclone/client.js';

/** A short, practical list; `Intl.supportedValuesOf` covers everything else. */
function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
      'timeZone',
    ) ?? ['UTC'];
  } catch {
    return ['UTC'];
  }
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/settings', async () => app.settings.get());

  app.get('/api/settings/timezones', async () => timezones());

  app.put('/api/settings', { preHandler: app.requireAdmin }, async (request) => {
    const input = settingsUpdateSchema.parse(request.body);
    const updated = app.settings.update(input);
    if (input.rclone) app.reloadRclone();
    if (input.defaults?.bwlimit !== undefined) void app.bandwidth.applyDefault();
    app.logs.write('info', 'settings', 'Configuración actualizada');
    return updated;
  });

  app.post('/api/settings/test-rclone', async (request) => {
    const body = (request.body ?? {}) as { url?: string; user?: string; password?: string };
    const connection = app.settings.connection();
    const client = new RcloneClient({
      url: body.url || connection.url,
      user: body.user || connection.user,
      password: body.password || connection.password,
      timeoutMs: 8000,
    });
    try {
      const version = await client.version();
      return { online: true, version: version.version, error: null, checkedAt: new Date().toISOString() };
    } catch (error) {
      return {
        online: false,
        version: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
        checkedAt: new Date().toISOString(),
      };
    }
  });
}
