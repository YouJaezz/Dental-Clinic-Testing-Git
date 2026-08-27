/** Detect SQLite schema drift (migrations not applied). */
export function isMissingSchemaError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : "";
  return (
    msg.includes("no such table") ||
    msg.includes("no such column") ||
    msg.includes("SQLITE_ERROR")
  );
}

export const MIGRATION_HINT =
  "Database schema is out of date. Stop the dev server, run `npm run db:migrate`, then restart.";
