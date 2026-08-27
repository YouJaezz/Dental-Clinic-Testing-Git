import "./load-env";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { getDatabaseProvider, isPostgres } from "./provider";
import { runPostgresMigrations } from "./migrate-postgres";

async function migrateSqliteFile() {
  const raw = process.env.DATABASE_PATH ?? "./data/app.db";
  const dbPath = resolve(process.cwd(), raw);
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const drizzleDb = drizzle(sqlite);
  migrateSqlite(drizzleDb, { migrationsFolder: "./drizzle" });
  sqlite.close();
  console.log("SQLite migrations applied to", dbPath);
}

async function main() {
  const provider = getDatabaseProvider();
  console.log(`Database provider: ${provider}`);

  if (isPostgres()) {
    await runPostgresMigrations();
  } else {
    await migrateSqliteFile();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
