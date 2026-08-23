import type { FastifyInstance } from 'fastify';
import { cronPreviewSchema, jobInputSchema, jobRunSchema } from '@cloudbridge/shared';

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/jobs', async () => app.jobs.list());

  app.post('/api/jobs/cron-preview', async (request) => {
    const input = cronPreviewSchema.parse(request.body);
    return app.jobs.preview(input.cron, input.timezone);
  });

  app.post('/api/jobs', async (request, reply) => {
    const input = jobInputSchema.parse(request.body);
    return reply.status(201).send(app.jobs.create(input));
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request) =>
    app.jobs.get(request.params.id),
  );

  app.put<{ Params: { id: string } }>('/api/jobs/:id', async (request) => {
    const input = jobInputSchema.parse(request.body);
    return app.jobs.update(request.params.id, input);
  });

  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    app.jobs.remove(request.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/duplicate', async (request, reply) =>
    reply.status(201).send(app.jobs.duplicate(request.params.id)),
  );

  app.post<{ Params: { id: string } }>('/api/jobs/:id/run', async (request) => {
    const input = jobRunSchema.parse(request.body ?? {});
    return app.jobs.run(request.params.id, {
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
    });
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id/history', async (request) =>
    app.jobs.history(request.params.id),
  );
}
