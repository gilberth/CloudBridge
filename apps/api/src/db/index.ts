import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export function openDatabase(path: string): { db: Db; sqlite: Database.Database } {
  const file = resolve(path);
  mkdirSync(dirname(file), { recursive: true });

  const sqlite = new Database(file);
  // WAL keeps the scheduler's writes from blocking the UI's reads.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return { db: drizzle(sqlite, { schema }), sqlite };
}

export { schema };
