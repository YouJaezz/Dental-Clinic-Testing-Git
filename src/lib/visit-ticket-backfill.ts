import type Database from "better-sqlite3";
import type postgres from "postgres";

/** Assign sequential ticket numbers to visits missing a valid ticket (#1, #2, …). */
export function ensureVisitTicketsSqlite(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(visits)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "ticket_number")) {
    db.exec("ALTER TABLE visits ADD COLUMN ticket_number integer;");
  }

  const needBackfill = db
    .prepare(
      "SELECT COUNT(*) as n FROM visits WHERE ticket_number IS NULL OR ticket_number < 1",
    )
    .get() as { n: number };

  if (needBackfill.n > 0) {
    const maxRow = db
      .prepare(
        "SELECT COALESCE(MAX(ticket_number), 0) as m FROM visits WHERE ticket_number >= 1",
      )
      .get() as { m: number };
    let next = maxRow.m;
    const rows = db
      .prepare(
        "SELECT id FROM visits WHERE ticket_number IS NULL OR ticket_number < 1 ORDER BY created_at ASC, id ASC",
      )
      .all() as { id: string }[];
    const assign = db.prepare(
      "UPDATE visits SET ticket_number = ? WHERE id = ?",
    );
    for (const row of rows) {
      next += 1;
      assign.run(next, row.id);
    }
  }

  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS visits_ticket_number_idx ON visits (ticket_number);",
  );
}

export async function ensureVisitTicketsPostgres(
  sql: postgres.Sql,
): Promise<void> {
  const col = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'ticket_number'
  `;
  if (col.length === 0) {
    await sql`ALTER TABLE visits ADD COLUMN ticket_number integer`;
  }

  const [{ n }] = await sql`
    SELECT COUNT(*)::int as n FROM visits
    WHERE ticket_number IS NULL OR ticket_number < 1
  `;
  if ((n ?? 0) > 0) {
    const [{ m }] = await sql`
      SELECT COALESCE(MAX(ticket_number), 0)::int as m FROM visits
      WHERE ticket_number >= 1
    `;
    let next = m ?? 0;
    const rows = await sql`
      SELECT id FROM visits
      WHERE ticket_number IS NULL OR ticket_number < 1
      ORDER BY created_at ASC, id ASC
    `;
    for (const row of rows) {
      next += 1;
      await sql`UPDATE visits SET ticket_number = ${next} WHERE id = ${row.id}`;
    }
  }

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS visits_ticket_number_idx ON visits (ticket_number)`;
}
