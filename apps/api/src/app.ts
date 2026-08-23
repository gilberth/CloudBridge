import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { HttpError } from './lib/errors.js';
import { createLogController, loggerOptions } from './lib/logger.js';
import { RcloneClient, RcloneError, RcloneUnavailableError } from './rclone/client.js';
import { healthRoutes } from './routes/health.js';

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
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
    logController: createLogController(),
  });

  app.decorate('appVersion', await readVersion());
  app.decorate(
    'rclone',
    new RcloneClient({
      url: config.RCLONE_RC_URL,
      user: config.RCLONE_RC_USER,
      password: config.RCLONE_RC_PASS,
      timeoutMs: config.RCLONE_TIMEOUT_MS,
    }),
  );

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
      return reply
        .status(503)
        .send({ error: 'rclone_unavailable', message: error.message, details: { endpoint: error.endpoint } });
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

  await app.register(healthRoutes);

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
