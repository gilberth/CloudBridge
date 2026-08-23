import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { changePasswordSchema, createUserSchema, loginSchema } from '@cloudbridge/shared';
import { env } from '../config/env.js';
import { users } from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';

/** OWASP-aligned argon2id parameters; ~64 MiB per hash. */
export const ARGON_OPTIONS = { memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON_OPTIONS);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const config = env();

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: config.LOGIN_RATE_MAX,
          timeWindow: config.LOGIN_RATE_WINDOW,
          // Only failed attempts count towards the limit.
          skipOnResponse: (_request: FastifyRequest, reply: FastifyReply) => reply.statusCode < 400,
        },
      },
    },
    async (request, reply) => {
      const { username, password } = loginSchema.parse(request.body);
      const user = app.db.select().from(users).where(eq(users.username, username)).get();

      // Always run a verification so a missing user and a wrong password take
      // comparable time.
      const storedHash = user?.passwordHash ?? (await hashPassword(randomUUID()));
      const ok = await verify(storedHash, password).catch(() => false);

      if (!user || !ok) {
        request.log.warn({ username, ip: request.ip }, 'Intento de login fallido');
        throw unauthorized('Usuario o contraseña incorrectos');
      }

      const token = await app.issueSession(user, request);
      app.setSessionCookie(reply, token);
      app.logs.write('info', 'auth', `Inicio de sesión de ${user.username}`, { ip: request.ip });

      return {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
        },
      };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    try {
      await request.jwtVerify();
      app.revokeSession(request.user.jti);
    } catch {
      // An expired or missing cookie still results in a clean logout.
    }
    app.clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (request) => ({
    user: request.sessionUser,
  }));

  // ---------------------------------------------------------------- users ---

  app.get('/api/users', { preHandler: app.requireAdmin }, async () =>
    app.db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .all(),
  );

  app.post('/api/users', { preHandler: app.requireAdmin }, async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    const existing = app.db.select().from(users).where(eq(users.username, input.username)).get();
    if (existing) throw conflict(`Ya existe un usuario llamado "${input.username}"`);

    const user = {
      id: randomUUID(),
      username: input.username,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      createdAt: new Date().toISOString(),
    };
    app.db.insert(users).values(user).run();
    app.logs.write('info', 'auth', `Usuario "${user.username}" creado`);

    return reply.status(201).send({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    });
  });

  app.post<{ Params: { id: string } }>(
    '/api/users/:id/password',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const input = changePasswordSchema.parse(request.body);
      const target = request.params.id;
      const actor = request.sessionUser!;
      const isSelf = actor.id === target;

      if (!isSelf && actor.role !== 'admin') {
        throw forbidden('Solo un administrador puede cambiar la contraseña de otro usuario');
      }

      const user = app.db.select().from(users).where(eq(users.id, target)).get();
      if (!user) throw notFound('Usuario no encontrado');

      if (isSelf) {
        if (!input.currentPassword) throw badRequest('Falta la contraseña actual');
        const ok = await verify(user.passwordHash, input.currentPassword).catch(() => false);
        if (!ok) throw unauthorized('La contraseña actual no es correcta');
      }

      app.db
        .update(users)
        .set({ passwordHash: await hashPassword(input.newPassword) })
        .where(eq(users.id, target))
        .run();
      app.logs.write('info', 'auth', `Contraseña actualizada para "${user.username}"`);

      return reply.status(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: app.requireAdmin },
    async (request, reply) => {
      const target = request.params.id;
      if (request.sessionUser!.id === target) {
        throw badRequest('No puedes eliminar tu propia cuenta');
      }

      const remaining = app.db.select({ id: users.id, role: users.role }).from(users).all();
      const admins = remaining.filter((user) => user.role === 'admin');
      const victim = remaining.find((user) => user.id === target);
      if (!victim) throw notFound('Usuario no encontrado');
      if (victim.role === 'admin' && admins.length <= 1) {
        throw badRequest('Debe quedar al menos un administrador');
      }

      // Cascades to the user's sessions, so their cookies stop working at once.
      app.db.delete(users).where(eq(users.id, target)).run();
      app.logs.write('warn', 'auth', `Usuario eliminado (${target})`);

      return reply.status(204).send();
    },
  );
}
