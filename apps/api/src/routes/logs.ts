import type { FastifyInstance } from 'fastify';
import { logQuerySchema } from '@cloudbridge/shared';

export async function logRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/logs', async (request) => {
    const query = logQuerySchema.parse(request.query);
    return app.logs.query(query);
  });

  app.get('/api/logs/export', async (request, reply) => {
    const query = logQuerySchema.parse({ ...(request.query as object), limit: 1000 });
    const result = app.logs.query(query);
    reply.header('content-type', 'text/plain; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="cloudbridge-logs.txt"');
    return reply.send(app.logs.toText(result.items));
  });
}
