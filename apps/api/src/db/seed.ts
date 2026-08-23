import { randomUUID } from 'node:crypto';
import { count } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from './index.js';
import { users } from './schema.js';
import { hashPassword } from '../routes/auth.js';

/**
 * Create the first administrator from the environment. Idempotent: once any
 * user exists this is a no-op, so changing ADMIN_PASSWORD later does not
 * silently reset an account.
 */
export async function seedAdmin(
  db: Db,
  options: { username: string; password?: string },
  logger: FastifyBaseLogger,
): Promise<void> {
  const existing = db.select({ value: count() }).from(users).get()?.value ?? 0;
  if (existing > 0) return;

  if (!options.password) {
    logger.warn(
      'No hay usuarios y ADMIN_PASSWORD no está definido: nadie podrá iniciar sesión. ' +
        'Define ADMIN_PASSWORD y reinicia el contenedor.',
    );
    return;
  }

  db.insert(users)
    .values({
      id: randomUUID(),
      username: options.username,
      passwordHash: await hashPassword(options.password),
      role: 'admin',
      createdAt: new Date().toISOString(),
    })
    .run();

  logger.info({ username: options.username }, 'Administrador inicial creado');
}
