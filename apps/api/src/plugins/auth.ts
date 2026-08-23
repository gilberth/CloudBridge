import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionUser } from '@cloudbridge/shared';
import { env } from '../config/env.js';
import { sessions, users } from '../db/schema.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface SessionPayload {
  sub: string;
  jti: string;
  username: string;
  role: 'admin' | 'user';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionPayload;
    user: SessionPayload;
  }
}

/**
 * Session auth: argon2id password hashes, a signed JWT delivered as an
 * httpOnly cookie, and a `sessions` row per token so logout revokes it
 * server-side. An OIDC provider can be added later by issuing the same
 * session row from a different verification path — see `issueSession`.
 */
export const authPlugin = fp(async (app) => {
  const config = env();

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: config.COOKIE_NAME, signed: false },
    sign: { expiresIn: `${config.SESSION_TTL_HOURS}h` },
  });
  await app.register(fastifyRateLimit, {
    global: false,
    // Behind Traefik/Cloudflare the real client IP arrives in X-Forwarded-For,
    // which Fastify resolves for us when TRUST_PROXY is on.
    keyGenerator: (request) => request.ip,
  });

  /** Create a session row and return the signed token for the cookie. */
  app.decorate(
    'issueSession',
    async (
      user: { id: string; username: string; role: 'admin' | 'user' },
      request: FastifyRequest,
    ): Promise<string> => {
      const jti = randomUUID();
      const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000);
      app.db
        .insert(sessions)
        .values({
          jti,
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
          ip: request.ip,
          userAgent: request.headers['user-agent']?.slice(0, 500) ?? null,
        })
        .run();

      return app.jwt.sign({ sub: user.id, jti, username: user.username, role: user.role });
    },
  );

  app.decorate('revokeSession', (jti: string): void => {
    app.db
      .update(sessions)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(sessions.jti, jti))
      .run();
  });

  app.decorate('setSessionCookie', (reply: FastifyReply, token: string): void => {
    reply.setCookie(config.COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.COOKIE_SECURE,
      path: '/',
      maxAge: config.SESSION_TTL_HOURS * 3600,
    });
  });

  app.decorate('clearSessionCookie', (reply: FastifyReply): void => {
    reply.clearCookie(config.COOKIE_NAME, { path: '/' });
  });

  /** Route guard: valid JWT + a live session row + an existing user. */
  app.decorate('authenticate', async (request: FastifyRequest): Promise<void> => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized('Sesión inválida o expirada');
    }

    const payload = request.user;
    const session = app.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.jti, payload.jti), isNull(sessions.revokedAt)))
      .get();

    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      throw unauthorized('Sesión revocada o expirada');
    }

    const user = app.db.select().from(users).where(eq(users.id, payload.sub)).get();
    if (!user) throw unauthorized('El usuario ya no existe');

    request.sessionUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    } satisfies SessionUser;
  });

  app.decorate('requireAdmin', async (request: FastifyRequest): Promise<void> => {
    await app.authenticate(request);
    if (request.sessionUser?.role !== 'admin') {
      throw forbidden('Se requiere una cuenta de administrador');
    }
  });

  // Housekeeping: drop expired session rows on boot and hourly afterwards.
  const purge = () => {
    try {
      app.db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
    } catch (error) {
      app.log.warn({ err: error }, 'No se pudieron purgar las sesiones expiradas');
    }
  };
  purge();
  const timer = setInterval(purge, 3600_000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
});
