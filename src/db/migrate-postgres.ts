import postgres from "postgres";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";

/** Applies `drizzle/pg` migrations (Docker / Supabase / local Postgres). */
export async function runPostgresMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Set DATABASE_URL to your Postgres connection string before migrating.",
    );
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  const drizzleDb = drizzlePg(sql);
  await migratePg(drizzleDb, { migrationsFolder: "./drizzle/pg" });
  await sql.end();
  console.log("Postgres migrations applied.");
}
