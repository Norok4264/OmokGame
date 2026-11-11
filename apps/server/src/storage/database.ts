import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { runMigrations } from "./migrations.js";

export type SqliteDatabase = InstanceType<typeof BetterSqlite3>;

export function openDatabase(filename: string): SqliteDatabase {
  const resolved = filename === ":memory:" ? filename : resolve(filename);
  if (resolved !== ":memory:") mkdirSync(dirname(resolved), { recursive: true });

  const db = new BetterSqlite3(resolved);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (resolved !== ":memory:") db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

export function isDatabaseReady(db: SqliteDatabase): boolean {
  try {
    const row = db.prepare("SELECT 1 AS ready FROM schema_migrations WHERE version = ?").get(1) as
      | { ready: number }
      | undefined;
    return row?.ready === 1;
  } catch {
    return false;
  }
}
