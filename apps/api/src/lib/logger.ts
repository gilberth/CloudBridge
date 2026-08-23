import { LogController } from 'fastify';
import { pino, type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/**
 * Structured JSON logs on stdout, ready for Promtail/Loki. Nothing is written
 * to a file: the container's stdout is the log transport.
 */
export function loggerOptions(): LoggerOptions {
  return {
    level: env().LOG_LEVEL,
    base: { service: 'cloudbridge' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.pass',
        '*.token',
        '*.client_secret',
      ],
      censor: '[redacted]',
    },
  };
}

/**
 * Request logging controller. Health probes and the stats websocket are polled
 * constantly, so they are always silent; the rest of the traffic is logged only
 * at debug level.
 */
export function createLogController(): LogController {
  const verbose = env().LOG_LEVEL === 'debug';
  return new LogController({
    disableRequestLogging: (request) =>
      !verbose || request.url.startsWith('/api/health') || request.url.startsWith('/ws'),
  });
}
