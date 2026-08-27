import "./load-env";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as pgSchema from "./schema.pg";
import { getDatabaseProvider } from "./provider";
import { ensureVisitTicketsPostgres } from "@/lib/visit-ticket-backfill";

function createPostgresClient() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required when using Postgres (Supabase). Copy the connection string from the Supabase dashboard.",
    );
  }
  const sql = postgres(url, {
    /** Required for Supabase transaction pooler (port 6543). */
    prepare: false,
    max: 10,
  });
  return { sql, db: drizzlePg(sql, { schema: pgSchema }) };
}

const backend = createPostgresClient();
await ensureVisitTicketsPostgres(backend.sql);

export const db = backend.db;
export const sqlite = null;
export const postgresClient = backend.sql;

export function getActiveDatabaseProvider() {
  return getDatabaseProvider();
}

export async function closeDatabase(): Promise<void> {
  await postgresClient.end();
}
