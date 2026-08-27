# Clinical Hub

Astro SSR app with React, Tailwind/shadcn-style UI, Drizzle ORM, and either a local **SQLite** file or **Supabase Postgres** (via `DATABASE_URL`). The database is only accessed from **server-side** code (SSR and API routes).

## Prerequisites

- **[Bun](https://bun.sh)** — install dependencies and run dev/build (`bun install`, `bun run dev`, `bun run build`).
- **[Node.js](https://nodejs.org)** (LTS recommended) — required for:
  - **`bun run db:migrate`** (runs the migrator through **tsx**, which uses Node; `better-sqlite3` does not run under the Bun runtime on Windows).
  - **`bun run start`** after build (the start script invokes `node ./dist/server/entry.mjs`).

## Quick start

```bash
cd clinical-hub
bun install
```

Copy environment defaults and adjust if needed:

```bash
cp .env.example .env
```

On Windows (PowerShell or cmd):

```powershell
copy .env.example .env
```

Create or update the SQLite schema:

```bash
bun run db:migrate
```

Start the dev server:

```bash
bun run dev
```

- App: [http://localhost:4321/patients](http://localhost:4321/patients) after sign-in (root `/` redirects to `/patients`).
- Health check (opens the DB file): [http://localhost:4321/api/health](http://localhost:4321/api/health).

## App routes

### Pages (HTML)

Authenticated app pages use a **sidebar layout** (`AppShell`). Visit-related screens share URL query params `patientId` and `visitId` so you can refresh or deep-link.

| Route | Description |
|-------|-------------|
| `/` | Redirects to `/patients` (302). |
| `/patients` | Patient search, table, add patient, visit picker, link into workspace (updates `?patientId=` / `?visitId=` in the URL). |
| `/workspace` | Visit overview: start/close visit, visit selector, balance summary. Subnav links to procedures / record / payment preserve query params. |
| `/workspace/procedures` | Add procedure lines (quantities) for the current `visitId`. |
| `/workspace/record` | Read-only procedures and payments for the visit; filter field. |
| `/workspace/payment` | Record a payment against the current `visitId`. |
| `/admin` | Administration: full procedure catalog and users (`ADMIN` only; others see an access message). |
| `/login` | Sign-in form; redirects to `/patients` if already authenticated. |

### API (JSON)

Public (no session):

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | `POST` | Body `{ "email", "password" }`. Sets `clinical_session` cookie on success. |
| `/api/health` | `GET` | DB smoke check. Requires `Authorization: Bearer <HEALTH_CHECK_SECRET>` when the secret is set, or an existing session. |

Authenticated (`clinical_session` cookie; `TRAINEE` is read-only for mutations):

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/logout` | `POST` | Deletes server session and clears cookie. |
| `/api/auth/me` | `GET` | Current user id, email, role. |
| `/api/patients` | `GET` | Query `q` optional; list patients (search). |
| `/api/patients` | `POST` | Create patient (`USER`, `ADMIN` only). |
| `/api/patients/[id]` | `GET` | Get one patient. |
| `/api/patients/[id]` | `PATCH` | Update patient (`USER`, `ADMIN` only). |
| `/api/patients/[patientId]/visits` | `GET` | List visits for a patient. |
| `/api/patients/[patientId]/visits` | `POST` | Create visit (`USER`, `ADMIN` only). |
| `/api/visits/[visitId]` | `PATCH` | Update visit (e.g. close: `{ "status": "CLOSED" }`). |
| `/api/visits/[visitId]/summary` | `GET` | Charges, paid (completed), balance in cents. |
| `/api/visits/[visitId]/records` | `GET` | Visit, procedure lines (with catalog names), payments. |
| `/api/visits/[visitId]/procedures` | `GET` | Active catalog + existing lines on visit. |
| `/api/visits/[visitId]/procedures` | `POST` | Body `{ "lines": [{ "catalogId", "quantity" }] }` (`USER`, `ADMIN` only). |
| `/api/visits/[visitId]/payments` | `POST` | Body `{ "amountCents", "method", "reference?" }` (`USER`, `ADMIN` only). |
| `/api/catalog` | `GET` | Active catalog items; `?all=1` lists all items (`ADMIN` only). |
| `/api/catalog` | `POST` | Create catalog item (`ADMIN` only). |
| `/api/catalog/[id]` | `PATCH` | Update catalog item (`ADMIN` only). |
| `/api/users` | `GET`, `POST` | List or create users (`ADMIN` only). |

When you add more files under `src/pages/`, Astro maps them to URLs the same way (file-based routing).

## How to use the system

The app is modeled around **patients**, **visits** (one encounter), **procedure line items** attached to a visit, and **payments** recorded **per visit**. Amounts in the schema are stored in **integer cents** (`*_cents` columns).

### Roles and auth

- Sign in at `/login`. Sessions are stored in the **`sessions`** table with an **httpOnly** cookie (`clinical_session`).
- **`ADMIN`**: full access plus **Admin** page (sidebar): procedure catalog (including inactive items), user list, create users.
- **`USER`**: can create patients, visits, procedures, payments, and close visits.
- **`TRAINEE`**: can use all pages in read-only mode for writes; create/update APIs return **403**.

Create the first admin and sample procedures:

```bash
bun run db:migrate
# set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in the environment, then:
bun run db:seed
```

### Suggested workflow

1. **Sign in** and open **Patients** (`/patients`).
2. **Search or add patients**, select a row, optionally choose a visit, then **Open workspace** (carries `patientId` / `visitId` in the URL).
3. Use the **Workspace** sidebar tabs: **Overview** (start/close visit, balance), **Procedures**, **Record**, **Payment**.
4. **Close visit** on the overview when the encounter is finished.

### Operational tips

- **Inspect or edit data** during development with `bun run db:studio` (Drizzle Studio) after migrations, or run ad hoc SQL against the file path in `DATABASE_PATH`.
- **Backups**: copy the SQLite file (and any `-wal` / `-shm` sidecars if present) while the app is idle or use SQLite backup APIs for safer online copies.

## Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_PATH` | Path to the SQLite file when **not** using Postgres. Default in `.env.example` is `./data/app.db`. |
| `DATABASE_URL` | Postgres connection string (e.g. from Supabase). When this is a `postgresql://` or `postgres://` URL, the app uses Postgres instead of SQLite. |
| `DATABASE_PROVIDER` | Optional override: `sqlite` or `postgres`. |

The `data/` directory is created automatically when using SQLite.

### Using Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → Database**, copy the **URI** connection string for the **transaction pooler** (port **6543**).
3. Add to `.env`:

   ```env
   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

4. Apply schema migrations:

   ```bash
   bun run db:migrate
   ```

5. Seed an admin user (optional):

   ```bash
   bun run db:seed
   ```

Auth remains **app-managed** (email/password + `clinical_session` cookie in the `sessions` table). Supabase is used here as **hosted Postgres**, not Supabase Auth.

For schema changes on Postgres, edit `src/db/schema.pg.ts`, run `bun run db:generate:pg`, review SQL under `drizzle/pg/`, then `bun run db:migrate`.

## Scripts

| Command | Purpose |
|---------|---------|
| `bun run dev` | Astro development server with hot reload. |
| `bun run build` | Production build (`dist/`). |
| `bun run preview` | Serve the production build locally (after `build`). |
| `bun run start` | Run the built Node server (`node ./dist/server/entry.mjs`). Run from project root after `build`. |
| `bun run db:generate` | Generate a SQLite migration from `src/db/schema.sqlite.ts`. |
| `bun run db:generate:pg` | Generate a Postgres migration from `src/db/schema.pg.ts` (requires `DATABASE_URL`). |
| `bun run db:migrate` | Apply pending migrations (SQLite or Postgres, based on env). Uses **Node** via `tsx`. |
| `bun run db:migrate:pg` | Apply Postgres migrations only (`drizzle/pg/`). Used by Docker `migrate` service. |
| `bun run db:seed` | Create admin user and sample catalog rows from `SEED_ADMIN_*` env vars (uses **Node** via `tsx`). |
| `bun run db:push` | Push SQLite schema directly (local experiments). |
| `bun run db:push:pg` | Push Postgres schema directly (requires `DATABASE_URL`). |
| `bun run db:studio` | Drizzle Studio for SQLite. |
| `bun run db:studio:pg` | Drizzle Studio for Postgres (requires `DATABASE_URL`). |

## Deploying

This project uses **`@astrojs/node`** in **`standalone`** mode: the build outputs a **Node** server under `dist/`.

### Build

```bash
bun install
bun run build
```

### Run in production

From the project directory (so relative paths like `./data/app.db` resolve correctly unless you override `DATABASE_PATH`):

```bash
bun run start
```

Or explicitly:

```bash
node ./dist/server/entry.mjs
```

Set **`PORT`** (and optionally **`HOST`**) as supported by the Node adapter. Example:

```bash
set PORT=3000
bun run start
```

On Unix:

```bash
PORT=3000 bun run start
```

### SQLite and the filesystem

- The SQLite file must live on a **persistent, writable** volume. If the container or VM restarts without that volume, the database is reset unless you restore a backup.
- Use **one Node process** (or one replica) writing to the same file, or you risk database corruption. **Serverless multi-instance** hosting is a poor fit for a single SQLite file.
- The `@astrojs/node` adapter may use **filesystem-backed sessions**; the server process should have a **writable cwd or configured cache directory** so sessions and the DB behave as expected.

### Typical hosting targets

- **VPS / bare metal / single container** with Node 20+ and a persistent disk: copy `dist/`, `node_modules` (or run `bun install --production`), `package.json`, `drizzle/` migrations, run `db:migrate`, set `DATABASE_PATH`, then `bun run start` or `node ./dist/server/entry.mjs`.
- **Docker Compose (Postgres + nginx)**: see [Docker Compose deploy](#docker-compose-deploy) below. Host development can still use SQLite; the container stack is Postgres-only.

### HTTPS and secrets

Terminate TLS at your reverse proxy (Caddy, nginx, Traefik, load balancer) in front of Node. Keep production secrets and `.env` out of version control. Production session cookies use the **`Secure`** flag; staff should use **HTTPS** in production.

## Docker Compose deploy

Postgres-only production stack: `postgres` → one-shot `migrate` → `app` (Astro SSR) → `nginx` (HTTPS on **443**). Design decisions are recorded in [`grill-me-docs/docker-compose-postgres-ssr.md`](grill-me-docs/docker-compose-postgres-ssr.md).

### Prerequisites

- Docker Engine with Compose v2
- TLS files on the host (see `nginx/certs/README.md`): `fullchain.pem`, `privkey.pem`

### Setup

1. Copy and edit env (use strong passwords; URL-encode special characters in `DATABASE_URL` if needed):

   ```bash
   cp .env.example .env
   ```

   Uncomment and set the **Docker Compose** block: `POSTGRES_*`, `DATABASE_URL` (host `postgres`), `DATABASE_PROVIDER=postgres`, `HEALTH_CHECK_SECRET`, and optional `NGINX_CONFIG_DIR` / `NGINX_CERT_DIR`.

2. Place TLS certificates under `nginx/certs/` (or your `NGINX_CERT_DIR`).

3. Build and start:

   ```bash
   docker compose up -d --build
   ```

4. Create the first admin and sample catalog (once):

   ```bash
   docker compose run --rm app npx tsx ./src/db/seed.ts
   ```

   Requires `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`. Remove or rotate them after seeding.

5. Open the app at **`https://<your-server>/`** (port 443). The `app` service is not published on the host; only nginx is.

### Operations

| Task | Command |
|------|---------|
| View logs | `docker compose logs -f app` |
| Re-run migrations after upgrade | `docker compose up -d` (migrate runs once per up) or `docker compose run --rm migrate` |
| Health probe | `curl -s -H "Authorization: Bearer $HEALTH_CHECK_SECRET" https://localhost/api/health` |

The runtime image uses **Node 24 LTS** (`node:24-alpine`) and omits **`better-sqlite3`**; SQLite remains available for local `bun run dev` on the host.

## Schema changes workflow

**SQLite (local default)**

1. Edit `src/db/schema.sqlite.ts`.
2. Run `bun run db:generate` → migration under `drizzle/`.
3. Review the generated SQL.
4. Run `bun run db:migrate`.

**Postgres / Supabase**

1. Edit `src/db/schema.pg.ts` (keep shared enums in `src/db/schema.shared.ts` in sync).
2. Run `bun run db:generate:pg` → migration under `drizzle/pg/`.
3. Review the generated SQL.
4. Run `bun run db:migrate` with `DATABASE_URL` set.

## Troubleshooting

- **`better-sqlite3` / native module errors under Bun** when running **only** the migrate script: expected on Windows; migrations are wired to **tsx + Node**. Dev and production server code paths used by Astro still rely on **Node** for the built server.
- **Empty or missing tables after deploy**: run **`bun run db:migrate`** with the correct `DATABASE_PATH` (SQLite) or `DATABASE_URL` (Supabase).
- **Supabase connection errors**: use the **pooler** URI (port 6543), not the direct session port, for serverless-style Node hosts.
- **`db:migrate` uses SQLite despite `.env`**: ensure `.env` is in the project root and includes both `DATABASE_PROVIDER=postgres` and `DATABASE_URL`. CLI scripts (`db:migrate`, `db:seed`, Drizzle Kit) load `.env` automatically; you should see `Database provider: postgres` in the migrate output.