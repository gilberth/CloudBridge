import type { FastifyInstance } from 'fastify';
import {
  fsCompareSchema,
  fsDeleteSchema,
  fsListQuerySchema,
  fsMkdirSchema,
  fsRenameSchema,
  fsTransferSchema,
  remoteNameSchema,
  remotePathStringSchema,
} from '@cloudbridge/shared';
import { z } from 'zod';

const sizeQuerySchema = z.object({
  remote: remoteNameSchema,
  path: remotePathStringSchema.default(''),
});

export async function fsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/fs/list', async (request) => {
    const query = fsListQuerySchema.parse(request.query);
    return app.fs.list(query.remote, query.path, query.recurse);
  });

  app.get('/api/fs/size', async (request) => {
    const query = sizeQuerySchema.parse(request.query);
    return app.fs.size(query.remote, query.path);
  });

  app.post('/api/fs/mkdir', async (request, reply) => {
    const input = fsMkdirSchema.parse(request.body);
    await app.fs.mkdir(input.remote, input.path);
    app.logs.write('info', 'fs', `Carpeta creada: ${input.remote}:${input.path}`);
    return reply.status(204).send();
  });

  app.post('/api/fs/delete', async (request, reply) => {
    const input = fsDeleteSchema.parse(request.body);
    await app.fs.remove(input.remote, input.entries);
    app.logs.write('warn', 'fs', `Eliminados ${input.entries.length} elementos de "${input.remote}"`, {
      entries: input.entries.map((entry) => entry.path).slice(0, 50),
    });
    return reply.status(204).send();
  });

  app.post('/api/fs/rename', async (request, reply) => {
    const input = fsRenameSchema.parse(request.body);
    await app.fs.rename(input.remote, input.from, input.to, input.isDir);
    app.logs.write('info', 'fs', `Renombrado ${input.remote}:${input.from} → ${input.to}`);
    return reply.status(204).send();
  });

  app.get('/api/fs/download', async (request, reply) => {
    const query = sizeQuerySchema.parse(request.query);
    const file = await app.fs.download(query.remote, query.path);
    reply.header('content-type', file.contentType);
    if (file.contentLength) reply.header('content-length', file.contentLength);
    reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    return reply.send(file.body);
  });

  // Copy / move / sync share one handler; the mode comes from the route.
  for (const mode of ['copy', 'move', 'sync'] as const) {
    app.post(`/api/fs/${mode}`, async (request) => {
      const input = fsTransferSchema.parse({ ...(request.body as object), mode });
      return app.transfers.start({
        mode,
        source: input.source,
        destinations: [input.destination],
        items: input.items,
        options: input.options,
        ...(input.confirm !== undefined ? { confirm: input.confirm } : {}),
      });
    });
  }

  app.post('/api/fs/compare', async (request) => {
    const input = fsCompareSchema.parse(request.body);
    return app.fs.compare(input);
  });
}
