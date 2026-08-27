export type DatabaseProvider = "sqlite" | "postgres";

/**
 * `postgres` when `DATABASE_URL` is a Postgres connection string (e.g. Supabase pooler),
 * or when `DATABASE_PROVIDER=postgres`. Otherwise defaults to local SQLite.
 */
export function getDatabaseProvider(): DatabaseProvider {
  const explicit = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
  if (explicit === "postgres" || explicit === "postgresql") return "postgres";
  if (explicit === "sqlite") return "sqlite";

  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (/^postgres(ql)?:\/\//i.test(url)) return "postgres";

  return "sqlite";
}

export function isPostgres(): boolean {
  return getDatabaseProvider() === "postgres";
}
