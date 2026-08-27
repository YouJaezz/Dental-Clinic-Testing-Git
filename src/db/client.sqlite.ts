import "./load-env";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as sqliteSchema from "./schema.sqlite";
import { getDatabaseProvider } from "./provider";
import { ensureVisitTicketsSqlite } from "@/lib/visit-ticket-backfill";

function resolveDbPath(): string {
  const raw = process.env.DATABASE_PATH ?? "./data/app.db";
  return resolve(process.cwd(), raw);
}

function createSqliteClient() {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureVisitTicketsSqlite(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema: sqliteSchema }) };
}

const backend = createSqliteClient();

export const db = backend.db;
export const sqlite = backend.sqlite;
export const postgresClient = null;

export function getActiveDatabaseProvider() {
  return getDatabaseProvider();
}

export async function closeDatabase(): Promise<void> {
  sqlite.close();
}
