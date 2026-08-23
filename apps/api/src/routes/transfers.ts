import type { FastifyInstance } from 'fastify';

export async function transferRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/transfers', async () => app.runs.recent());

  app.post<{ Params: { id: string } }>('/api/transfers/:id/stop', async (request) =>
    app.transfers.stop(request.params.id),
  );

  app.post<{ Params: { id: string } }>('/api/transfers/:id/pause', async (request) =>
    app.transfers.pause(request.params.id),
  );

  app.post<{ Params: { id: string } }>('/api/transfers/:id/resume', async (request) =>
    app.transfers.resume(request.params.id),
  );
}
