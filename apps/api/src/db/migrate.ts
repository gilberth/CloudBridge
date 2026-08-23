import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Folder holding the SQL produced by `pnpm run db:generate`. */
export const migrationsFolder = join(here, '..', '..', 'drizzle');

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder });
}
