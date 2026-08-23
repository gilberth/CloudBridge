import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';

/**
 * Live progress channel. Authentication reuses the session cookie: the upgrade
 * request goes through the same guard as the REST API.
 */
export async function websocketRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyWebsocket, {
    options: { maxPayload: 1024 * 1024 },
  });

  app.get(
    '/ws/stats',
    { websocket: true, preValidation: app.authenticate },
    (socket) => {
      app.stats.add(socket);
      socket.on('message', (raw: Buffer) => {
        // The client only ever sends keepalive pings.
        if (raw.toString() === 'ping' && socket.readyState === socket.OPEN) socket.send('pong');
      });
    },
  );
}
