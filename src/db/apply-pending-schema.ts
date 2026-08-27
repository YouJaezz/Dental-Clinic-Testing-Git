/**
 * Applies migrations 0012–0014 when they were never registered in drizzle journal.
 * Safe to run multiple times (skips existing columns/tables).
 */
import "./load-env";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { getDatabaseProvider, isPostgres } from "./provider";

function sqlitePath(): string {
  const raw = process.env.DATABASE_PATH ?? "./data/app.db";
  return resolve(process.cwd(), raw);
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.some((r) => r.name === column);
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(table) as { name: string } | undefined;
  return row != null;
}

function runSqlFile(db: Database.Database, relativePath: string) {
  const full = resolve(process.cwd(), relativePath);
  const raw = readFileSync(full, "utf8");
  const statements = raw
    .split(/--> statement-breakpoint\n?/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of statements) {
    db.exec(sql);
  }
}

function applySqlite() {
  const dbPath = sqlitePath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  if (!hasColumn(db, "visit_procedure_lines", "voided_at")) {
    console.log("Applying 0012_procedure_line_void…");
    runSqlFile(db, "drizzle/0012_procedure_line_void.sql");
  } else {
    console.log("0012 already applied (void columns present).");
  }

  if (!hasTable(db, "correction_requests")) {
    console.log("Applying 0013_correction_requests…");
    runSqlFile(db, "drizzle/0013_correction_requests.sql");
  } else {
    console.log("0013 already applied (correction_requests table present).");
  }

  if (!hasColumn(db, "visit_procedure_lines", "void_category")) {
    console.log("Applying 0014_procedure_void_category…");
    runSqlFile(db, "drizzle/0014_procedure_void_category.sql");
  } else {
    console.log("0014 already applied (void_category present).");
  }

  if (!hasColumn(db, "users", "locale")) {
    console.log("Applying 0015_locale_dev_sessions…");
    db.exec("ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'en';");
  }
  if (!hasColumn(db, "sessions", "user_agent")) {
    db.exec("ALTER TABLE sessions ADD COLUMN user_agent text;");
    db.exec("ALTER TABLE sessions ADD COLUMN ip_address text;");
    db.exec("ALTER TABLE sessions ADD COLUMN device_label text;");
    db.exec(
      "CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions (created_at);",
    );
  }

  if (!hasTable(db, "admin_gate")) {
    console.log("Applying admin_gate…");
    db.exec(`
      CREATE TABLE admin_gate (
        id text PRIMARY KEY NOT NULL,
        code_hash text NOT NULL,
        cookie_secret text,
        updated_at integer NOT NULL,
        updated_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT
      );
    `);
  } else if (!hasColumn(db, "admin_gate", "cookie_secret")) {
    db.exec("ALTER TABLE admin_gate ADD COLUMN cookie_secret text;");
  }

  if (!hasTable(db, "blocked_devices")) {
    console.log("Applying blocked_devices…");
    db.exec(`
      CREATE TABLE blocked_devices (
        id text PRIMARY KEY NOT NULL,
        ip_address text,
        device_label text,
        reason text NOT NULL,
        blocked_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at integer NOT NULL
      );
      CREATE INDEX blocked_devices_ip_idx ON blocked_devices (ip_address);
      CREATE INDEX blocked_devices_label_idx ON blocked_devices (device_label);
    `);
  }

  if (!hasTable(db, "role_elevation_requests")) {
    console.log("Applying role_elevation_requests…");
    db.exec(`
      CREATE TABLE role_elevation_requests (
        id text PRIMARY KEY NOT NULL,
        target_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'PENDING',
        reason text NOT NULL,
        resolved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
        resolved_at integer,
        resolution_note text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE INDEX role_elevation_requests_status_idx ON role_elevation_requests (status);
      CREATE INDEX role_elevation_requests_target_user_id_idx ON role_elevation_requests (target_user_id);
    `);
  }

  db.exec(`UPDATE users SET role = 'ADMIN_I' WHERE role = 'ADMIN';`);
  db.exec(`UPDATE users SET role = 'ADMIN_II' WHERE role = 'DEV';`);

  if (!hasTable(db, "dev_otp_challenges")) {
    console.log("Applying dev_otp_challenges…");
    db.exec(`
      CREATE TABLE dev_otp_challenges (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash text NOT NULL,
        expires_at integer NOT NULL,
        created_at integer NOT NULL
      );
      CREATE INDEX dev_otp_challenges_user_id_idx ON dev_otp_challenges (user_id);
      CREATE INDEX dev_otp_challenges_expires_at_idx ON dev_otp_challenges (expires_at);
    `);
  }

  db.exec("CREATE INDEX IF NOT EXISTS visits_status_idx ON visits (status);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS visits_visit_date_idx ON visits (visit_date);",
  );
  db.exec("CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);",
  );

  if (!hasColumn(db, "visits", "ticket_number")) {
    console.log("Applying visit ticket numbers…");
    db.exec("ALTER TABLE visits ADD COLUMN ticket_number integer;");
  }

  const needBackfill = db
    .prepare(
      "SELECT COUNT(*) as n FROM visits WHERE ticket_number IS NULL OR ticket_number < 1",
    )
    .get() as { n: number };
  if (needBackfill.n > 0) {
    console.log(`Backfilling ${needBackfill.n} visit ticket number(s)…`);
    const maxRow = db
      .prepare(
        "SELECT COALESCE(MAX(ticket_number), 0) as m FROM visits WHERE ticket_number >= 1",
      )
      .get() as { m: number };
    let next = maxRow.m;
    const visitIds = db
      .prepare(
        "SELECT id FROM visits WHERE ticket_number IS NULL OR ticket_number < 1 ORDER BY created_at ASC, id ASC",
      )
      .all() as { id: string }[];
    const assign = db.prepare(
      "UPDATE visits SET ticket_number = ? WHERE id = ?",
    );
    for (const row of visitIds) {
      next += 1;
      assign.run(next, row.id);
    }
  }

  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS visits_ticket_number_idx ON visits (ticket_number);",
  );

  db.close();
  console.log("Schema update complete:", dbPath);
}

async function applyPostgres() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Set DATABASE_URL for Postgres.");
    process.exit(1);
  }
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'visit_procedure_lines' AND column_name = 'void_category'
    `;
    if (cols.length === 0) {
      console.log("Applying Postgres pending migrations…");
      await runSqlFileOnPg(sql, "drizzle/pg/0003_procedure_line_void.sql");
      await runSqlFileOnPg(sql, "drizzle/pg/0004_correction_requests.sql");
      await runSqlFileOnPg(sql, "drizzle/pg/0005_procedure_void_category.sql");
    } else {
      console.log("Postgres schema already includes void_category.");
    }
    const localeCol = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'locale'
    `;
    if (localeCol.length === 0) {
      console.log("Applying Postgres locale + session device columns…");
      await sql`ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'en'`;
      await sql`ALTER TABLE sessions ADD COLUMN user_agent text`;
      await sql`ALTER TABLE sessions ADD COLUMN ip_address text`;
      await sql`ALTER TABLE sessions ADD COLUMN device_label text`;
      await sql`CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions (created_at)`;
    }

    const gateTable = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'admin_gate'
    `;
    if (gateTable.length === 0) {
      console.log("Applying Postgres admin_gate…");
      await sql`
        CREATE TABLE admin_gate (
          id text PRIMARY KEY NOT NULL,
          code_hash text NOT NULL,
          cookie_secret text,
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT
        )
      `;
    } else {
      const gateSecretCol = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'admin_gate' AND column_name = 'cookie_secret'
      `;
      if (gateSecretCol.length === 0) {
        await sql`ALTER TABLE admin_gate ADD COLUMN cookie_secret text`;
      }
    }

    const blockedTable = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'blocked_devices'
    `;
    if (blockedTable.length === 0) {
      console.log("Applying Postgres blocked_devices…");
      await sql`
        CREATE TABLE blocked_devices (
          id text PRIMARY KEY NOT NULL,
          ip_address text,
          device_label text,
          reason text NOT NULL,
          blocked_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX blocked_devices_ip_idx ON blocked_devices (ip_address)`;
      await sql`CREATE INDEX blocked_devices_label_idx ON blocked_devices (device_label)`;
    }

    const elevationTable = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'role_elevation_requests'
    `;
    if (elevationTable.length === 0) {
      console.log("Applying Postgres role_elevation_requests…");
      await sql`
        CREATE TABLE role_elevation_requests (
          id text PRIMARY KEY NOT NULL,
          target_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          requested_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          status text NOT NULL DEFAULT 'PENDING',
          reason text NOT NULL,
          resolved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
          resolved_at timestamptz,
          resolution_note text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX role_elevation_requests_status_idx ON role_elevation_requests (status)`;
      await sql`CREATE INDEX role_elevation_requests_target_user_id_idx ON role_elevation_requests (target_user_id)`;
    }

    await sql`UPDATE users SET role = 'ADMIN_I' WHERE role = 'ADMIN'`;
    await sql`UPDATE users SET role = 'ADMIN_II' WHERE role = 'DEV'`;

    const otpTable = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'dev_otp_challenges'
    `;
    if (otpTable.length === 0) {
      console.log("Applying Postgres dev_otp_challenges…");
      await sql`
        CREATE TABLE dev_otp_challenges (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash text NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX dev_otp_challenges_user_id_idx ON dev_otp_challenges (user_id)`;
      await sql`CREATE INDEX dev_otp_challenges_expires_at_idx ON dev_otp_challenges (expires_at)`;
    }

    await sql`CREATE INDEX IF NOT EXISTS visits_status_idx ON visits (status)`;
    await sql`CREATE INDEX IF NOT EXISTS visits_visit_date_idx ON visits (visit_date)`;
    await sql`CREATE INDEX IF NOT EXISTS users_role_idx ON users (role)`;
    await sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)`;

    const ticketCol = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'visits' AND column_name = 'ticket_number'
    `;
    if (ticketCol.length === 0) {
      console.log("Applying Postgres visit ticket numbers…");
      await sql`ALTER TABLE visits ADD COLUMN ticket_number integer`;
    }

    const [{ n: needBackfill }] = await sql`
      SELECT COUNT(*)::int as n FROM visits
      WHERE ticket_number IS NULL OR ticket_number < 1
    `;
    if ((needBackfill ?? 0) > 0) {
      console.log(`Backfilling ${needBackfill} visit ticket number(s)…`);
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
  } finally {
    await sql.end();
  }
}

async function runSqlFileOnPg(
  sql: import("postgres").Sql,
  relativePath: string,
) {
  const full = resolve(process.cwd(), relativePath);
  const raw = readFileSync(full, "utf8");
  const statements = raw
    .split(/--> statement-breakpoint\n?/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
}

async function main() {
  const provider = getDatabaseProvider();
  console.log(`Database provider: ${provider}`);
  if (isPostgres()) {
    await applyPostgres();
  } else {
    applySqlite();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
