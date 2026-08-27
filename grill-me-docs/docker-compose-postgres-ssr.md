# Grill-me: Docker Compose (Postgres + Astro SSR + Drizzle)

**Started:** 2026-06-05  
**Request:** Generate a simple `docker-compose` that scaffolds Postgres and SSR for this Astro frontend so Drizzle can work.

**Status:** **Done** — implemented 2026-06-05 (Q13 **A**).

### Locked so far

| # | Decision |
|---|----------|
| Q1 | **C** — Deploy scaffold (prod-oriented compose) |
| Q2 | **A** — App + Postgres in one project |
| Q3 | **C** — One-shot `migrate` service before `app` |
| Q4 | **C** — Bun build, Node run |
| Q5 | **B** — Secrets in `.env`, `postgres_data` volume |
| Q6 | **A** — Host exposure via reverse proxy (refined in Q8: **nginx** is the entrypoint, not raw `app`) |
| Q7 | **B** — Manual `db:seed` once; not a compose service |
| Q8 | **A + nginx** — HTTPS at edge; `Secure` cookies; nginx `upstream` → `app:4321` |
| Q9 | **B** — Host publishes **443 only** on nginx (no port 80) |
| Q10 | **B** — Postgres-only Docker image; **SQLite unchanged in repo** for host dev |
| Q11 | **A + ii** — `unless-stopped`; `app` healthcheck before nginx |
| Q12 | **C** — Default `./nginx/`; override config/certs dirs via `.env` |
| Q13 | **A** — Implement now |

---

## Codebase context (explored)

| Area | Finding |
|------|---------|
| SSR | `astro.config.mjs`: `output: "server"`, adapter `@astrojs/node` standalone when `SERVER_ADAPTER_MODE=node` (default). |
| Drizzle | Dual provider: SQLite default, Postgres when `DATABASE_URL` is `postgres://` / `postgresql://` or `DATABASE_PROVIDER=postgres`. |
| PG config | `drizzle.config.pg.ts` → schema `src/db/schema.pg.ts`, migrations `drizzle/pg/`. |
| Client | `src/db/client.ts` uses `postgres` driver with `prepare: false` (Supabase pooler); fine for local Postgres too. |
| Scripts | `bun run db:migrate` (tsx), `bun run start` → `node ./dist/server/entry.mjs`. |
| Env | `.env.example`: `DATABASE_PATH` (SQLite), `DATABASE_URL` + optional `DATABASE_PROVIDER` (Postgres). |
| Docker today | No `Dockerfile` or `docker-compose` yet. |

---

## Decision log

### Q1 — What is this Compose stack for?

**Options**

| Option | Meaning |
|--------|---------|
| **A — Local dev only** | Fast feedback: bind-mount source, hot reload, dev secrets, Postgres + app on published ports. |
| **B — Dev + “works like prod”** | Same compose (or profiles): built image, `node ./dist/server/entry.mjs`, no bind-mount in prod profile. |
| **C — Deploy scaffold** | Minimal prod-oriented compose (built app + Postgres + volumes), not optimized for day-to-day coding. |

**Recommendation:** **A (local dev only)** for a first pass.

- Matches “simple docker compose” and “scaffold.”
- README already assumes host `bun run dev` / `db:migrate`; Compose can mirror that with Postgres in Docker.
- B/C add Dockerfile polish, healthchecks, and migration-on-start decisions to layer after the dev loop works.

**Sketch if A is chosen:** `postgres:16-alpine` + `app` service running `bun run dev` with `DATABASE_URL=postgresql://...@postgres:5432/...`, `DATABASE_PROVIDER=postgres`, plus documented or one-shot `docker compose run app bun run db:migrate`.

**Answer:** **C — Deploy scaffold** (2026-06-05). First deliverable is prod-oriented compose (built app + Postgres + volumes), not optimized for day-to-day host dev.

**Implications:** Expect a `Dockerfile` multi-stage build, `bun run build` + `node ./dist/server/entry.mjs`, pinned env, named volumes, healthchecks, and explicit migration strategy — not bind-mount + `bun run dev`.

### Q2 — What runs in Compose?

**Options**

| Option | Meaning |
|--------|---------|
| **A — App + Postgres** | Single `docker compose up` brings up built SSR app and database; one host / one compose project. |
| **B — Postgres only** | Compose runs DB; app runs on host, another PaaS, or a separate deploy path. |
| **C — App only** | Compose runs SSR; `DATABASE_URL` points at external/managed Postgres (e.g. Supabase). |

**Recommendation:** **A (App + Postgres)** — aligns with C and “scaffold” as a self-contained deploy unit for a clinic VPS or on-prem box.

- B splits deploy docs and networking (`DATABASE_URL` hostnames, firewall).
- C matches existing Supabase docs but is not a Postgres scaffold; skip unless you explicitly want compose without a local DB service.

**Answer:** **A — App + Postgres** (2026-06-05). Single compose project runs built SSR + `postgres:16-alpine` (or similar) with shared env / network.

### Q3 — How do Postgres migrations run on deploy?

**Options**

| Option | Meaning |
|--------|---------|
| **A — App entrypoint** | Container starts with `db:migrate` then `node ./dist/server/entry.mjs` on every app start/restart. |
| **B — Manual step** | Operator runs `docker compose run --rm app bun run db:migrate` (or `npm run db:migrate`) before/after image updates; app service does not auto-migrate. |
| **C — One-shot `migrate` service** | Compose defines a `migrate` job (`restart: "no"`) after Postgres is healthy; `app` depends on `service_completed_successfully`. |

**Recommendation:** **C (one-shot migrate service)** for this deploy scaffold.

- Repo already has `bun run db:migrate` → `tsx ./src/db/migrate.ts` applying `drizzle/pg/` when `DATABASE_URL` is set.
- Separates schema changes from the long-running SSR process (clearer logs, failed migrate does not leave a half-started app).
- On upgrade: `compose up` re-runs migrate once, then starts app — without re-migrating on every app container restart (A).
- B is fine for minimal YAML but easy to forget on first deploy; C keeps “one command” UX while staying explicit.

**Answer:** **C — One-shot `migrate` service** (2026-06-05). `migrate` runs `bun run db:migrate` after Postgres healthcheck; `app` depends on `service_completed_successfully`; `restart: "no"` on migrate.

### Q4 — What runtime inside the app image?

**Options**

| Option | Meaning |
|--------|---------|
| **A — Node only** | Multi-stage build: install with bun (or npm), `bun run build`, runtime image uses `node:24-alpine`; `start` = `node ./dist/server/entry.mjs`; migrate uses `node` + `tsx` (matches `package.json` today). |
| **B — Bun only** | `oven/bun` image for build and run; `bun run start` if wired, or still shell out to node for Astro output. |
| **C — Bun build, Node run** | Bun in builder stage for speed/deps; slim `node:24-alpine` final stage copies `dist/` + production `node_modules` (or pruned deps). |

**Recommendation:** **C (Bun build, Node run)** — or **A** if you want zero Bun in the runtime image.

- `package.json` `start` already targets **Node** (`node ./dist/server/entry.mjs`); `@astrojs/node` standalone expects Node.
- `db:migrate` uses **tsx on Node** because `better-sqlite3` is not required for Postgres path, but the script imports both providers — Node + tsx is the tested path in the project description.
- Bun-only runtime (B) adds friction for Astro SSR + native modules without clear upside on a deploy scaffold.
- Builder can still use `oven/bun:1` for `bun install --frozen-lockfile` and `bun run build`; final stage ~smaller attack surface with only Node + prod deps.

**Answer:** **C — Bun build, Node run** (2026-06-05). Builder: `oven/bun:1` for install + `bun run build`; runtime: `node:24-alpine` (Active LTS) with prod deps, `node ./dist/server/entry.mjs`; migrate image stage shares Node + tsx + migration files.

### Q5 — Postgres credentials and data persistence?

**Options**

| Option | Meaning |
|--------|---------|
| **A — Compose defaults + named volume** | Fixed dev-style user/db/password in `docker-compose.yml` (e.g. `clinical` / `clinical` / `clinical_hub`); `postgres_data` named volume; document “change before real prod.” |
| **B — `.env` file (gitignored)** | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` from `.env`; compose interpolates `${VAR}`; same named volume; `.env.example` documents placeholders. |
| **C — Docker secrets / external only** | No defaults in repo; operator supplies secrets via env files not committed or Swarm/K8s secrets (heavier for a “simple” scaffold). |

**Recommendation:** **B (`.env` file, gitignored)** with a **named volume** `postgres_data`.

- Matches how the app already loads env (`DATABASE_URL` in `.env.example`).
- Scaffold stays copy-paste friendly: commit `.env.example` with `postgresql://user:pass@postgres:5432/dbname` template; real `.env` on the server only.
- Named volume (not bind-mount) avoids host path permissions and is the usual VPS/on-prem pattern.
- Pin `postgres:16-alpine` (or 17) with a healthcheck (`pg_isready`) for the migrate service dependency.
- Do **not** commit real passwords; optional weak defaults only in `.env.example` with a comment to rotate.

**Answer:** **B — `.env` + named volume** (2026-06-05). `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` + matching `DATABASE_URL` and `DATABASE_PROVIDER=postgres` in gitignored `.env`; `postgres_data` volume; `.env.example` documents placeholders only.

### Q6 — How is the app exposed on the host?

**Options**

| Option | Meaning |
|--------|---------|
| **A — Publish app port only** | `app` maps `${PORT:-4321}:4321` (or container `PORT`); Postgres **not** published (internal network only). TLS/HTTPS documented as operator-owned (host nginx, Caddy, Cloudflare Tunnel, etc.). |
| **B — Reverse proxy in Compose** | Add `caddy` or `nginx` service with TLS certs; proxy to `app:4321`; app ports not on host. |
| **C — No host ports** | Stack is internal-only; operator joins a host proxy to the compose network (uncommon for a clinic VPS scaffold). |

**Recommendation:** **A (publish app port only)**.

- Keeps the compose file “simple” per the original request; B is a second PR once domain + certs are known.
- README already documents `PORT` / `HOST` for `bun run start`; same vars in the `app` service env.
- Postgres stays off the host firewall — only `app` (and optionally nothing else) is reachable.
- Clinic LAN or VPS: operator puts HTTPS in front when ready without baking cert strategy into v1.

**Answer:** **A** (2026-06-05), **superseded for host binding by Q8** — originally “publish app port”; final design: **only nginx** published on host; `app` is internal on `4321`; `postgres` has no `ports:`.

### Q7 — First-boot admin and catalog seed?

**Options**

| Option | Meaning |
|--------|---------|
| **A — One-shot `seed` service** | Like `migrate`: `seed` runs `bun run db:seed` when `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` are set; idempotent (skips existing admin/catalog). |
| **B — Manual only** | README: after first `compose up`, run `docker compose run --rm app bun run db:seed` once; no seed service in YAML. |
| **C — Skip seed in Docker docs** | Operator creates admin another way; catalog rows added in-app or SQL. |

**Recommendation:** **B (manual only)**.

- `db:seed` is optional and requires secrets in `.env` — auto-running on every `compose up` (A) risks leaving `SEED_ADMIN_PASSWORD` in server `.env` longer than needed.
- Script is already idempotent (`seed.ts` checks existing admin/catalog); manual run is a clear “first install” step.
- Deploy scaffold core jobs: `postgres`, `migrate`, `app` (+ `nginx` per Q8) — no auto `seed` service.

**Answer:** **B — Manual seed only** (2026-06-05). Document `docker compose run --rm app bun run db:seed` after first successful migrate/up; remove or rotate `SEED_*` from `.env` when done.

### Q8 — Production access: HTTP port vs HTTPS in front?

**Context (codebase):** In `PROD`, session cookies get the **`Secure`** flag (`auth-server.ts`). Browsers will not store/send them over plain `http://host:4321`. External TLS (Q6 A) is required for login to work in a production build.

**Options**

| Option | Meaning |
|--------|---------|
| **A — HTTPS required (document only)** | Compose sets `HOST=0.0.0.0`, `PORT=4321`, production build; README states clinic must use HTTPS reverse proxy (or tunnel) in front — not raw HTTP for staff login. |
| **B — Allow insecure cookies for LAN** | Add env (e.g. `COOKIE_SECURE=false`) and code change to skip `Secure` when set — for clinic LAN hitting `http://server-ip:4321` directly. |
| **C — HTTP-only deploy** | Ship with `NODE_ENV=development` or non-PROD build so cookies lack `Secure` (not recommended for a “deploy scaffold”). |

**Recommendation:** **A (HTTPS required, document only)**.

- Matches existing auth behavior; no code changes for grill-me outcome.
- Q6 already assumes TLS outside compose; document nginx/Caddy `proxy_pass` to `http://127.0.0.1:4321` with standard forwarded headers.
- Optional smoke test: health on HTTP is fine; staff login tested only via HTTPS URL.

**Answer:** **A + nginx in Compose** (2026-06-05).

- **HTTPS required** for staff login (`Secure` cookies in `PROD` — see `auth-server.ts`).
- Add **`nginx`** service as the **host entrypoint** (not `app`): operator configures SSL (cert paths or future Let’s Encrypt hook) in mounted `nginx.conf` / `conf.d/`.
- **`upstream app_backend`** → `server app:4321` (or `${PORT}` inside the compose network); `proxy_pass http://app_backend` with usual headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`).
- **`app`**: `HOST=0.0.0.0`, no `ports:` on host; reachable only on the compose network.
- **`postgres`**: internal only (unchanged).
- Scaffold ships a minimal default `nginx.conf` (e.g. HTTP → redirect HTTPS, or TLS stub + commented SSL block); real certs via volume mount (e.g. `./nginx/certs/` gitignored).

**Sketch services:** `postgres` → `migrate` → `app` → `nginx` (depends on `app` healthy or started).

### Q9 — What do we publish on the host (nginx)?

**Options**

| Option | Meaning |
|--------|---------|
| **A — 80 + 443** | HTTP for ACME HTTP-01 or redirect to HTTPS; HTTPS for the app. |
| **B — 443 only** | TLS only; certs supplied out-of-band (no redirect from 80). |
| **C — Configurable via `.env`** | e.g. `NGINX_HTTP_PORT=80`, `NGINX_HTTPS_PORT=443` mapped in compose. |

**Recommendation:** **C (configurable via `.env`, default 80 + 443)** — same pattern as Q5; clinic can change ports without editing YAML.

**Answer:** **B — 443 only** (2026-06-05). Nginx maps host `443:443` only; TLS certs mounted by operator (no HTTP listener for redirect/ACME in v1 — add 80 later if needed).

### Q10 — Runtime image: full `node_modules` or Postgres-only slim?

**Context:** `src/db/migrate.ts` imports `better-sqlite3` even on the Postgres path; Docker build still compiles native SQLite unless we refactor or use multi-stage copy tricks.

**Options**

| Option | Meaning |
|--------|---------|
| **A — Full production deps** | `bun install --production` in builder; copy all prod `node_modules` to Node runtime — simplest, works for `db:migrate` / `db:seed` as-is. |
| **B — Slim Postgres-only** | Refactor migrate (split entrypoints) or `npm prune` / omit `better-sqlite3` in image — smaller image, extra work now. |
| **C — Full deps in migrate image, slimmer app** | Two targets from one Dockerfile: `migrate` stage with tsx + full deps; `app` stage copies only what `dist/server` needs (harder with Astro standalone). |

**Recommendation:** **A (full production deps)** for v1 deploy scaffold — **user chose B with constraints below.**

**Answer:** **B — Postgres-only Docker; keep SQLite in codebase** (2026-06-05).

- **Compose + Docker:** Postgres only — `DATABASE_PROVIDER=postgres`, `DATABASE_URL` to `postgres` service; no SQLite volume, no `DATABASE_PATH` in compose/env for containers.
- **Codebase:** Retain dual-provider SQLite/Postgres for **host development** (`bun run dev`, local `DATABASE_PATH`); do **not** delete SQLite schema, `drizzle.config.ts`, or provider switching.
- **Image slimming (implementation):** Drop `better-sqlite3` from the **production Docker image** (e.g. separate `db:migrate:pg` entry or dynamic import split in `migrate.ts` so the container bundle never loads SQLite). `db:seed` in container uses Postgres path only.
- **Dev workflow unchanged:** Developers without Docker keep using SQLite as today.

### Q11 — Container restart and health dependencies?

**Options**

| Option | Meaning |
|--------|---------|
| **A — `restart: unless-stopped` on long-running services** | `postgres`, `app`, `nginx` restart automatically; `migrate` stays `restart: "no"`. |
| **B — `restart: always`** | Same as A but restarts even after manual `docker stop` (usually too aggressive). |
| **C — No restart policy in compose** | Operator sets policy externally; compose file stays minimal. |

**Nginx → app wiring**

| Sub-option | Meaning |
|------------|---------|
| **i — `depends_on: app` (started)** | Nginx starts when app container starts (may proxy before app listens). |
| **ii — `app` healthcheck + `depends_on: condition: service_healthy`** | HTTP check on `app:4321/api/health` (or similar) before nginx starts. |

**Recommendation:** **A + ii** — `unless-stopped` for `postgres` / `app` / `nginx`; `migrate` one-shot; **`app` healthcheck** so nginx does not come up against a dead upstream.

**Answer:** **A + ii** (2026-06-05). `restart: unless-stopped` on `postgres`, `app`, `nginx`; `migrate` → `restart: "no"`; `app` healthcheck (e.g. `/api/health`) with `nginx` `depends_on` `condition: service_healthy`.

### Q12 — Where do nginx config and TLS certs live?

**Options**

| Option | Meaning |
|--------|---------|
| **A — `./nginx/` in repo** | Commit `nginx.conf` + `conf.d/default.conf` template; gitignore `nginx/certs/*` (operator drops `fullchain.pem` / `privkey.pem`). |
| **B — Compose mount from `.env` paths** | e.g. `NGINX_CONFIG_DIR`, `NGINX_CERT_DIR` in `.env` pointing at host paths outside repo. |
| **C — A + B** | Sensible defaults under `./nginx/`; override dirs via `.env` for multi-env servers. |

**Recommendation:** **C (defaults in `./nginx/`, overridable via `.env`)** — matches Q5/Q9 patterns; you configure SSL in place without forking the repo per clinic.

**Answer:** **C — `./nginx/` defaults + `.env` overrides** (2026-06-05). Commit `nginx/nginx.conf` + `conf.d/`; gitignore `nginx/certs/*`; optional `NGINX_CONFIG_DIR`, `NGINX_CERT_DIR` for compose volume mounts.

### Q13 — Ready to implement?

**Planned artifacts**

| Artifact | Purpose |
|----------|---------|
| `Dockerfile` | Multi-stage: Bun build → Node run; Postgres-only deps (no `better-sqlite3` in image) |
| `docker-compose.yml` | `postgres`, `migrate`, `app`, `nginx`; Q3–Q12 behavior |
| `nginx/` | Upstream → `app:4321`, TLS on 443, mounts per Q12 |
| `.env.example` | Postgres + nginx paths + `DATABASE_URL` template |
| `README` | Docker quick start, certs, manual seed, HTTPS note |
| Code tweak | Postgres-only migrate entry for slim image (SQLite code untouched) |

**Options**

| Option | Meaning |
|--------|---------|
| **A — Implement now** | Apply the table above in the repo in this session / next agent turn. |
| **B — Hold** | Decision record only; implement later. |
| **C — Implement with exclusions** | Specify what to skip (e.g. README only, no nginx yet). |

**Recommendation:** **A (implement now)** — decision tree is complete; no open architectural branches.

**Answer:** **A — Implement now** (2026-06-05).

---

## Outcome

- [x] `Dockerfile` (Bun build, Node run, no `better-sqlite3` in runtime)
- [x] `docker-compose.yml` (`postgres`, `migrate`, `app`, `nginx`)
- [x] `nginx/` (upstream → `app:4321`, TLS on 443)
- [x] `.env.example` Docker block
- [x] README — [Docker Compose deploy](../README.md#docker-compose-deploy)
- [x] `src/db/migrate.pg.ts`, `client.pg.ts` / `client.sqlite.ts` (SQLite unchanged for host dev)
