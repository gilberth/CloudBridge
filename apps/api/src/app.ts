import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { openDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { seedAdmin } from './db/seed.js';
import { HttpError } from './lib/errors.js';
import { createLogController, loggerOptions } from './lib/logger.js';
import { authPlugin } from './plugins/auth.js';
import { RcloneClient, RcloneError, RcloneUnavailableError } from './rclone/client.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { fsRoutes } from './routes/fs.js';
import { jobRoutes } from './routes/jobs.js';
import { settingsRoutes } from './routes/settings.js';
import { remoteRoutes } from './routes/remotes.js';
import { transferRoutes } from './routes/transfers.js';
import { websocketRoutes } from './routes/ws.js';
import { FsService } from './services/fs.js';
import { LogService } from './services/logs.js';
import { RunsService } from './services/runs.js';
import { BandwidthManager } from './services/bandwidth.js';
import { JobsService } from './services/jobs.js';
import { NotificationService } from './services/notifications.js';
import { Scheduler } from './services/scheduler.js';
import { StatsBroadcaster } from './services/stats.js';
import { TransferService } from './services/transfers.js';
import { RemotesService } from './services/remotes.js';
import { SettingsService } from './services/settings.js';

const here = dirname(fileURLToPath(import.meta.url));

async function readVersion(): Promise<string> {
  try {
    const pkg = await readFile(join(here, '..', 'package.json'), 'utf8');
    return (JSON.parse(pkg) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const config = env();
  const app = Fastify({
    logger: loggerOptions(),
    logController: createLogController(),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
  });

  app.decorate('appVersion', await readVersion());

  // ------------------------------------------------------------ database ---
  const { db, sqlite } = openDatabase(config.DATABASE_PATH);
  app.decorate('db', db);
  runMigrations(db);
  app.addHook('onClose', async () => sqlite.close());

  // ------------------------------------------------------------ services ---
  app.decorate('logs', new LogService(db, app.log));
  app.decorate('settings', new SettingsService(db, config));

  const buildClient = (override?: { url: string; user: string; password: string }) => {
    const connection = override ?? app.settings.connection();
    return new RcloneClient({
      url: connection.url,
      user: connection.user,
      password: connection.password,
      timeoutMs: config.RCLONE_TIMEOUT_MS,
    });
  };
  app.decorate('rclone', buildClient());
  app.decorate('reloadRclone', (override?: { url: string; user: string; password: string }) => {
    app.rclone = buildClient(override);
    app.remotes?.invalidate();
    return app.rclone;
  });
  app.decorate('remotes', new RemotesService(app));
  app.decorate('fs', new FsService(app));
  app.decorate('runs', new RunsService(db));
  app.decorate('bandwidth', new BandwidthManager(app));
  app.decorate('transfers', new TransferService(app));
  app.decorate('stats', new StatsBroadcaster(app, config.STATS_INTERVAL_MS));
  app.decorate('notifications', new NotificationService(app));
  app.decorate('jobs', new JobsService(app));
  app.decorate('scheduler', new Scheduler(app));

  // Anything still marked as running belongs to a previous container.
  const interrupted = app.runs.markInterrupted();
  if (interrupted > 0) {
    app.log.warn({ interrupted }, 'Ejecuciones marcadas como interrumpidas tras el reinicio');
  }

  await seedAdmin(db, { username: config.ADMIN_USER, password: config.ADMIN_PASSWORD }, app.log);

  // ------------------------------------------------------- error handler ---
  app.setErrorHandler((raw: FastifyError, request, reply) => {
    const error: unknown = raw;
    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send({ error: error.code, message: error.message, details: error.details });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Datos de entrada inválidos',
        details: error.issues,
      });
    }
    if (error instanceof RcloneUnavailableError) {
      return reply.status(503).send({
        error: 'rclone_unavailable',
        message: error.message,
        details: { endpoint: error.endpoint },
      });
    }
    if (error instanceof RcloneError) {
      return reply
        .status(502)
        .send({ error: 'rclone_error', message: error.message, details: { endpoint: error.endpoint } });
    }
    if (raw.validation) {
      return reply
        .status(400)
        .send({ error: 'validation_error', message: raw.message, details: raw.validation });
    }

    const status = raw.statusCode ?? 500;
    if (status >= 500) request.log.error({ err: raw }, 'Error no controlado');
    return reply.status(status).send({
      error: 'internal_error',
      message: status >= 500 ? 'Error interno del servidor' : raw.message,
    });
  });

  // -------------------------------------------------------------- routes ---
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(remoteRoutes);
  await app.register(fsRoutes);
  await app.register(transferRoutes);
  await app.register(jobRoutes);
  await app.register(settingsRoutes);
  await app.register(websocketRoutes);

  // One ticker drives both finishing runs and pushing progress to the clients.
  app.stats.start();
  app.scheduler.start();
  app.addHook('onClose', async () => app.scheduler.stop());
  // Re-assert the configured global bandwidth limit on the daemon.
  void app.bandwidth.applyDefault();
  app.addHook('onClose', async () => app.stats.stop());

  if (config.WEB_DIST) {
    const root = resolve(config.WEB_DIST);
    await app.register(fastifyStatic, { root, wildcard: false });

    // SPA fallback: anything that is not an API or websocket route renders the app.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        return reply.status(404).send({ error: 'not_found', message: 'Ruta no encontrada' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
