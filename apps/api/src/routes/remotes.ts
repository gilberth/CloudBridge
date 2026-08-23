import type { FastifyInstance } from 'fastify';
import { createRemoteSchema, updateRemoteSchema } from '@cloudbridge/shared';
import { badRequest } from '../lib/errors.js';

export async function remoteRoutes(app: FastifyInstance): Promise<void> {
  // Everything below requires a session.
  app.addHook('preHandler', app.authenticate);

  app.get('/api/remotes', async () => app.remotes.list());

  app.get('/api/remotes/providers', async () => app.remotes.providers());

  app.get('/api/remotes/config/export', async () => ({
    config: await app.remotes.exportConfig(),
  }));

  app.post<{ Body: { config?: string } }>('/api/remotes/config/import', async (request) => {
    const config = request.body?.config;
    if (typeof config !== 'string' || config.trim().length === 0) {
      throw badRequest('Falta el contenido de rclone.conf');
    }
    const imported = await app.remotes.importConfig(config);
    app.logs.write('info', 'remotes', `Importados ${imported} remotos desde rclone.conf`);
    return { imported };
  });

  app.get<{ Params: { name: string } }>('/api/remotes/:name', async (request) =>
    app.remotes.get(request.params.name),
  );

  app.post('/api/remotes', async (request, reply) => {
    const input = createRemoteSchema.parse(request.body);
    const remote = await app.remotes.create(input.name, input.type, input.parameters, input.token);
    app.logs.write('info', 'remotes', `Remoto "${remote.name}" (${remote.type}) creado`);
    return reply.status(201).send(remote);
  });

  app.put<{ Params: { name: string } }>('/api/remotes/:name', async (request) => {
    const input = updateRemoteSchema.parse(request.body);
    const remote = await app.remotes.update(request.params.name, input.parameters, input.token);
    app.logs.write('info', 'remotes', `Remoto "${remote.name}" actualizado`);
    return remote;
  });

  app.delete<{ Params: { name: string } }>('/api/remotes/:name', async (request, reply) => {
    await app.remotes.remove(request.params.name);
    app.logs.write('warn', 'remotes', `Remoto "${request.params.name}" eliminado`);
    return reply.status(204).send();
  });

  app.post<{ Params: { name: string } }>('/api/remotes/:name/test', async (request) => {
    const probe = await app.remotes.probe(request.params.name, 0);
    return { online: probe.online, error: probe.error ?? null };
  });

  app.get<{ Params: { name: string } }>('/api/remotes/:name/about', async (request) => {
    const probe = await app.remotes.probe(request.params.name, 0);
    const types = await app.remotes.types();
    return {
      name: request.params.name,
      type: types[request.params.name] ?? 'unknown',
      online: probe.online,
      about: probe.about,
      ...(probe.error ? { error: probe.error } : {}),
    };
  });
}
