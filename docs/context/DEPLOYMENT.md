# Deployment

> When to load: Docker, environment variables, CI/CD, infrastructure, going to production.

## Environment Variables

Validated at startup by `@t3-oss/env-nextjs`. The schema lives in `apps/web/src/env.ts`
(format logic for `EMAIL_FROM` / `AUTH_TRUSTED_ORIGINS` in `lib/env-schema.ts`, unit-tested).
If a required var is missing — or a set var is malformed (URL-shaped vars, `EMAIL_FROM`,
trusted-origin entries) — the app throws at startup with a clear error naming the var.

> The committed root `.env.example` carries every feature block below (all steps have
> landed) — copy it and uncomment what you configure. The only vars deliberately **not**
> in it are the script/worker-only `BETTER_STACK_API_TOKEN` / `BETTER_STACK_HEARTBEAT_URL`
> (never read by the app — see [SERVICES.md](SERVICES.md)). The full set:
```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/appdb"
DB_POOL_MAX=""               # optional app-pool max cap (A29); unset = pg default 10, invalid fails loud

# Auth
BETTER_AUTH_SECRET="replace-with-32-char-random-secret"
BETTER_AUTH_URL="http://localhost:3000"
AUTH_TRUSTED_ORIGINS=""      # optional, comma-separated; entries must be URLs or *-wildcards
SITE_URL=""                  # optional canonical public/SEO origin; defaults to BETTER_AUTH_URL

# OAuth (optional — add providers you enable)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Stripe
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""

# Email
RESEND_API_KEY=""
EMAIL_FROM="noreply@yourdomain.com"   # bare address or "Name <address>"

# Observability — Sentry
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_ORG=""
SENTRY_PROJECT=""
SENTRY_AUTH_TOKEN=""         # CI only — see the @sentry/cli note below

# Logging — BetterStack (@logtail/next). Needs BOTH; legacy LOGTAIL_* names also work.
BETTER_STACK_SOURCE_TOKEN=""
BETTER_STACK_INGESTING_URL=""

# Observability dashboards-as-code (@repo/observability → BetterStack Uptime). Both
# optional + script/worker-only (NEVER read by the app — not in env.ts). See SERVICES.md.
BETTER_STACK_API_TOKEN=""        # `pnpm --filter @repo/observability sync` only
BETTER_STACK_HEARTBEAT_URL=""    # jobs worker pings this (URL from the synced heartbeat)

# Analytics — PostHog
NEXT_PUBLIC_POSTHOG_KEY=""
NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"   # or https://eu.i.posthog.com

# File uploads
UPLOADTHING_TOKEN=""

# Search
MEILISEARCH_HOST="http://localhost:7700"
MEILISEARCH_API_KEY=""

# Rate limiting — distributed driver (optional Upstash Redis; in-memory if unset)
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# Bot protection — Cloudflare Turnstile CAPTCHA (optional; A12 — set BOTH to enable)
TURNSTILE_SECRET_KEY=""              # server: siteverify secret
NEXT_PUBLIC_TURNSTILE_SITE_KEY=""    # client widget key (build-time inlined)
```

**Managed Postgres & pooling.** The `DATABASE_URL` above is a direct local connection. On a
managed provider (Neon / Supabase / RDS) or **any serverless** target, point it at a **pooled**
connection string and size the pool deliberately — an unbounded per-invocation `pg.Pool` will
exhaust Postgres otherwise. Cap the app pool with the optional **`DB_POOL_MAX`** env var (unset →
pg's default of 10). One caveat specific to this stack: give the **pg-boss worker** a
*direct* (non-transaction-pooled) connection, since it needs `LISTEN/NOTIFY` + advisory locks.
Full guidance (pooler ports, the sizing rule, the transaction-mode caveat) is in
[DATABASE.md](DATABASE.md#connection-pooling-managed-postgres--serverless).

**IP-based rate limiting needs a trusted proxy.** The app derives the client IP from
`x-forwarded-for` / `x-real-ip`, which Vercel / Fly / Railway / Render / Cloudflare /
nginx-style proxies set for you — so it works out of the box on a real PaaS. If you
expose the Node server **directly** to the internet, those headers are client-spoofable
and IP limiting becomes meaningless; put a proxy in front that overwrites them with the
real peer IP. Full platform table + the per-surface IP-less behavior (incl. the webhook
`noip` bucket) are in [SECURITY.md](SECURITY.md#client-ip-resolution--trusted-proxies-d10).

**Observability is all-optional (Step 13).** The app builds and runs with every
Sentry/BetterStack/PostHog var unset (verified: `pnpm lint`+`type-check`+`build` with
them unset). Two deployment-specific notes:

- **PostHog `/ingest` proxy:** `next.config.ts` rewrites `/ingest/*` to the regional
  ingestion host derived from `NEXT_PUBLIC_POSTHOG_HOST` (default US). It's same-origin,
  so no CORS/ad-blocker config is needed; just set the env var for your region.
- **Sentry source-map upload** happens at **build time** and needs `SENTRY_AUTH_TOKEN`
  together with `SENTRY_ORG` and `SENTRY_PROJECT`. It also needs the `@sentry/cli` binary, which is
  **not built by default** — flip `@sentry/cli` to `true` in `pnpm-workspace.yaml`
  `allowBuilds` (it's `false` so installs stay network-light, and the no-creds build
  never invokes it). `core-js` (transitive via posthog-js) is also `false` — its
  postinstall is only a funding banner. Next 16's `next build` uses **Turbopack**, and
  source-map upload is **supported there and on by default** (since `@sentry/nextjs@10.13`
  and `next@15.4.1` — this repo is past both) via Next's `runAfterProductionCompile` hook,
  so no webpack build is needed; runtime error capture works regardless of bundler.
- **Dashboards-as-code** (`@repo/observability`): the BetterStack monitor + heartbeat
  config is checked in as TS. CI validates it credential-free
  (`pnpm --filter @repo/observability check`); to apply it, set `BETTER_STACK_API_TOKEN`
  and run `pnpm --filter @repo/observability sync` (idempotent upsert — re-running
  converges). It's a separate dev/CI-only package, never imported by the app, so it
  adds zero build/bundle/CSP surface and is trivially deletable. After the first sync,
  copy the `jobs-worker` heartbeat's ping URL into the worker's `BETTER_STACK_HEARTBEAT_URL`
  so a dead worker pages you. See [SERVICES.md](SERVICES.md#dashboards-as-code-repoobservability--betterstack).

## Local Development

```bash
# Copy env (DATABASE_URL is pre-filled to match docker-compose)
cp .env.example .env

# Start Postgres + Meilisearch
docker compose -f docker/docker-compose.yml up -d

# Install dependencies (requires Node 24+)
pnpm install

# Apply DB migrations
pnpm --filter @repo/db db:migrate

# Start dev server
pnpm dev
```

The web app loads the monorepo-root `.env` via `dotenv-cli` — its dev/build/start
scripts run `dotenv -e ../../.env -- next ...`. drizzle-kit loads the same root
`.env`, so one file is the single source of truth for local env. (In production,
env vars come from the host, not a file.)

## Local disk hygiene (Turbo cache)

Turbo's local cache (`.turbo/cache`) has **no native TTL or size cap** — it stores
every task-hash's output forever. Each `web:build` writes a **~3.5 GB** `.next`
artifact (Sentry source-maps + chunks; `.next/cache` is already excluded in
`turbo.json`), so intensive step-by-step rebuilding grows the cache without bound —
it reached **100 GB in three days** here. Note `pnpm clean` does **not** clear it
(that runs each package's `clean` task on `dist`/`.next`, never the root cache dir).

A size-capped prune keeps it bounded:

```bash
pnpm cache:size    # report .turbo/cache total + entry count
pnpm cache:prune   # delete oldest entries until under the cap (default 20 GB)
```

`scripts/prune-turbo-cache.mjs` (pure Node, cross-platform) evicts oldest-first, so
recent builds stay cached and hits still work. The cap is 20 GB by default (~5 build
artifacts); override with `--max-gb <n>` or `TURBO_CACHE_MAX_GB`, and preview with
`--dry-run`. It runs automatically at two points, so growth is bounded without relying
on discipline:

- **`/checkpoint`** — pruned after each push, at the exact cadence builds accumulate.
- **husky `pre-push`** — a backstop that prunes when over cap before code leaves the
  machine (a near-instant no-op otherwise), independent of who built.

For a deeper local pass (orphaned `:3000`/`:3100` dev servers, stale `@example.com`
e2e users, dangling Docker images), use the **`tidy`** Claude Code skill.

## Bundle analysis

To inspect the production bundle's module graph (find large dependencies, diff
before/after an optimization):

```bash
pnpm --filter web analyze          # interactive treemap (browser, default port 4000)
pnpm --filter web analyze:output   # write a static report to .next/diagnostics/analyze
```

This uses Next's **built-in** Bundle Analyzer (`next experimental-analyze`), which reads
**Turbopack's** module graph — the bundler this repo actually builds with (`next build`
defaults to Turbopack in Next 16). It compiles internally, so no prior `next build` is
needed, and it adds **no dependency** (it ships in the `next` CLI).

We deliberately do **not** use `@next/bundle-analyzer`: it hooks **webpack**, so under
this repo's Turbopack build it only emits output if you force `next build --webpack` —
i.e. you'd be analyzing a webpack bundle the app never ships. The built-in tool analyzes
the real output instead. Both `analyze` scripts wrap `dotenv -e ../../.env` like the
other Next scripts so the internal compile passes env validation; `--output` writes under
`.next/` (gitignored). The CLI is flagged **experimental**, so the `experimental-analyze`
name/output path could shift across Next majors.

## Performance budgets (opt-in)

Bundle analysis (above) *inspects* the graph; a **budget** *gates* it — a change that
bloats the client bundle past a threshold fails CI instead of silently shipping. The
budgets live in **`apps/web/.size-limit.json`** and are checked by
[`size-limit`](https://github.com/ai/size-limit) with its **`@size-limit/file`** plugin:

```bash
pnpm --filter web build     # produce .next (any build works; CI uses a keyless one)
pnpm --filter web size      # measure the built chunks against the budgets
```

Two entries, both **gzipped**, both stable globs over the real Turbopack output:

| Budget | Glob | Current | Limit |
| --- | --- | --- | --- |
| Client JS — all routes | `.next/static/chunks/**/*.js` | ~640 kB | **750 kB** |
| CSS — all routes | `.next/static/chunks/**/*.css` | ~11 kB | **15 kB** |

The limits are **starting guardrails** (~15 % headroom over today's sizes) — they catch
a gross regression (e.g. importing a heavy library into a shared layout), not every
kilobyte. Re-tune them for your app by editing `.size-limit.json`; raise a limit
deliberately (with the new size visible in the diff) when a feature genuinely needs the
bytes.

**Why `@size-limit/file`, not a bundler plugin** — the same reason this repo skips
`@next/bundle-analyzer` (see Bundle analysis): `@size-limit/file` measures the files
`next build` **already emitted**, so it gates the exact JS the app ships. The
bundler-based presets (`@size-limit/webpack` / `-esbuild`) would re-bundle the source
with a *different* bundler and report a number the app never serves.

**Why a byte budget, not Lighthouse-CI** — bundle bytes are **deterministic** (a commit
produces the same chunks → the same gzip size on any OS), so the gate can't flake. A
Lighthouse category/CWV gate depends on lab timings that swing run-to-run on shared CI
runners (the classic flaky perf gate), and its one deterministic part (resource-size
budgets) is what this byte budget already covers — without a booted app or headless
Chrome. That determinism is also why the budgets need **no per-OS baseline** (contrast
the `visual` job's platform-specific screenshots).

**In CI** this is the opt-in **`perf`** job (see [CI/CD](#cicd-github-actions)) — OFF by
default, enabled with `gh variable set ENABLE_PERF --body true`.

## Docker

Production Dockerfile is at `docker/Dockerfile`. Build from the **repo root** (the
Dockerfile lives in `docker/`, build context is `.`):

```bash
docker build -f docker/Dockerfile -t nwb-web .
# Runtime env comes from the host, never a baked .env:
docker run -p 3000:3000 --env-file .env nwb-web
```

Multi-stage build on `node:24-alpine` (corepack-pinned pnpm from `packageManager`):

1. **base** — `corepack enable` + `libc6-compat` (musl glibc shim).
2. **deps** — `pnpm fetch` (lockfile-only, cached) then `pnpm install --frozen-lockfile --offline`.
3. **builder** — `pnpm build` with `SKIP_ENV_VALIDATION=1`, `NEXT_TELEMETRY_DISABLED=1`,
   and **`BUILD_STANDALONE=1`** (see below). No real secrets are needed or baked in.
4. **runner** — minimal image; runs as the **non-root `nextjs`** user (uid 1001),
   `CMD ["node", "apps/web/server.js"]`, listens on `:3000` (`PORT`/`HOSTNAME=0.0.0.0`).
   The base image's bundled **`npm` CLI is removed** (`rm -rf …/node_modules/npm` +
   the `npm`/`npx` bins) — the runtime never invokes it, so this shrinks the image and
   drops npm's own vendored deps from the image-scan surface (see the `docker-image` CI
   job below). corepack/pnpm live only in the build stages, never the runner.

**Standalone output is opt-in via `BUILD_STANDALONE`.** `next.config.ts` only sets
`output: "standalone"` (+ `outputFileTracingRoot` = repo root) when `BUILD_STANDALONE`
is set, which **only the Docker build does**. Rationale: standalone is consumed *only*
by the Docker image (Vercel/`next start` don't need it), and its file-tracing step
recreates the pnpm symlink farm with `fs.symlink` — which fails with `EPERM` on Windows
dev machines without admin/Developer Mode. Gating it keeps local + CI `next build`
cross-platform, and lets `next start` (the Playwright E2E lane) run without the
"does not work with output: standalone" warning.

In this **monorepo** layout, standalone roots at the repo (via `outputFileTracingRoot`),
so the server lands at `.next/standalone/apps/web/server.js`. Static assets and `public/`
are **not** part of standalone — the Dockerfile copies them alongside the server
(`.next/static` → `apps/web/.next/static`, `public` → `apps/web/public`). `sharp`
(image optimization) is traced in; alpine/musl prebuilds work on `node:24-alpine`.

> **Turbo strict env mode:** Turborepo 2.x filters env vars not declared in
> `turbo.json`. `SKIP_ENV_VALIDATION` / `BUILD_STANDALONE` are in `globalPassThroughEnv`
> and the app's validated vars are in the `build` task's `env`, so they reach
> `next build` (whether set by the Docker `ENV`, a CI job env, or the host). Without
> this, `next build` never sees them — the failure is silent until the build errors on
> "missing" env. A root `.env` loaded by `dotenv-cli` sidesteps it locally (the file
> feeds `next build` directly), which is why it only bites ambient-env builds.

### Migrations (production)

The runtime image is intentionally minimal and has **no `drizzle-kit`**. Run migrations
**outside** the image — from CI or a one-off against the target database — before/while
rolling out:

```bash
DATABASE_URL=... pnpm --filter @repo/db db:migrate
```

(The `e2e` CI job already does exactly this against its Postgres service.)

### Backups & disaster recovery

**Take a backup before every production `db:migrate`** — migrations are forward-only, so a
pre-migration dump is your rollback for a destructive change. Configure your managed provider's
**automated backups + point-in-time recovery** and keep independent, off-provider `pg_dump`
logical dumps as a second copy. The full runbook — the local `db:backup` / `db:restore` scripts,
the production `pg_dump`/`pg_restore` recipe, per-provider PITR pointers (Neon / Supabase / RDS),
the restore-drill, and migration-rollback strategy — is in
[DATABASE.md](DATABASE.md#backup-restore--disaster-recovery).

## docker-compose (Local Dev)

`docker/docker-compose.yml` starts:
- PostgreSQL 16 on port 5432 (`nwb-postgres`)
- Meilisearch on port 7700 (`nwb-meilisearch`; `MEILI_MASTER_KEY` wired for local dev)

No pgAdmin — use `drizzle-kit studio` instead (`pnpm --filter @repo/db db:studio`).

## docker-compose (Production-ish)

`docker/docker-compose.prod.yml` runs the **built app image** alongside Postgres +
Meilisearch on one network — for self-hosted deploys, or to smoke-test the image locally:

```bash
docker compose -f docker/docker-compose.prod.yml up --build
```

- The `web` service builds from `docker/Dockerfile` (with `SKIP_ENV_VALIDATION=1` as a
  build arg) and publishes `:3000`.
- Runtime secrets load from the repo-root `.env` (`env_file`); the service-internal
  `DATABASE_URL` (`@postgres`) and `MEILISEARCH_HOST` (`http://meilisearch:7700`) override
  the `localhost` values in that file — containers reach each other by service name.
- Postgres/Meilisearch use distinct container names (`-prod`) so they don't collide with
  the dev compose. Migrations are **not** auto-run (see above) — apply them once the DB is up.
- The `web` service carries a `healthcheck` (see below); the `-prod` Postgres/Meilisearch
  keep the same `pg_isready` / `/health` checks as the dev compose.
- The **`worker` service** (D7 background jobs) runs the pg-boss worker as a **second
  process sharing the same Postgres** — see below.

### Background-jobs worker (D7)

The `@repo/jobs` worker is a **separate long-lived process**, not part of the web image's
`server.js`. The `prod` compose includes a **`worker` service** built from the Dockerfile's
**`worker` target**, sharing the DB by service-name `DATABASE_URL`. It comes up with `up --build`.

- **Slim image (esbuild-bundled, not `tsx`):** the image ships **no** TS transpiler and **no**
  `node_modules` tree. A `jobs-build` stage runs `pnpm --filter @repo/jobs build`, which
  esbuild-bundles `worker.ts` + everything it imports — the `@repo/db` / `@repo/email` workspace
  TS (JSX templates included) and their JS deps — into a single `dist/worker.js`; the final
  `worker` stage is just `node:24-alpine` + that one file (npm stripped like the runner, runs as
  the unprivileged `node` user via `node worker.js`). This cut the worker image from **~1.57 GB**
  (the old `FROM deps` stage — the full dev install + all source, needed only because `tsx` ran
  the TS at runtime) to **~169 MB** (base + a 4.4 MB bundle), with a Trivy-clean surface. See
  `packages/jobs/build.mjs`. Local dev still runs the TS directly (`pnpm --filter @repo/jobs
  start` → `tsx`), so there's no build step in the edit loop.
- **Run it anywhere** (not just compose): `pnpm --filter @repo/jobs start`. All it needs is
  `DATABASE_URL` (+ any env a job uses, e.g. `RESEND_API_KEY`/`EMAIL_FROM` for the welcome
  email). On a PaaS, add it as a second "worker"/background process type alongside `web`.
- **Optional & safe to omit:** the web app enqueues regardless (graceful no-op if the DB is
  down); if no worker runs, jobs accumulate in the `pgboss` schema and drain when one starts.
  Nothing about deploying `web` requires the worker.
- **Schema:** pg-boss creates + owns the `pgboss` schema itself — no Drizzle migration, no
  `db:migrate` step for it (see [DATABASE.md](DATABASE.md)).
- **Recurring jobs (A3):** the worker also registers a cron schedule on boot (the
  `cleanup-expired-verifications` housekeeping job — see [SERVICES.md](SERVICES.md)). Run **one**
  worker for scheduling: pg-boss's cron scheduler fires each tick once across all `supervise:true`
  workers (it's not per-instance), so multiple workers won't double-fire, but the schedule only
  advances while at least one worker is up.
- **Runtime cost (honest):** one extra Node process (~50–80 MB idle) polling Postgres on an
  interval + pg-boss's periodic maintenance, plus a small pg-boss pool on the web side
  (lazy, enqueue-only — no polling). This is the one D7 surface that adds real runtime cost.

## Realtime (SSE) & serverless caveat (Tier 4 · A22)

The realtime notifications example (`/api/notifications/stream`) is a **Server-Sent
Events** endpoint fed by Postgres **LISTEN/NOTIFY** — see
[API.md](API.md#realtime--server-sent-events-sse-tier-4--a22). It has two long-lived-
connection requirements, and both are satisfied on the target this repo actually ships —
a **long-running Node server** (the Docker image / `next start`), the same posture as the
background-jobs worker:

- **The HTTP response stays open** for the life of the client's `EventSource`.
- **A dedicated `pg` connection stays checked out** per instance to keep receiving
  `LISTEN` notifications (it can't come from the request pool).

**On serverless / edge platforms this does not hold as-is:**

- A function's max duration **caps the stream** (Vercel: streaming is allowed, but the
  invocation ends at `maxDuration`, so `EventSource` reconnect-churns). Edge runtimes
  can't run the `pg` LISTEN client at all (not Edge-safe).
- A **connection pooler in transaction mode** (PgBouncer, and many managed "pooled"
  Postgres URLs) **breaks `LISTEN`** — use a session-mode / direct connection for the
  listener if you keep this design.

**If you deploy serverless,** pick one: (a) accept short streams + **backfill on
(re)connect** — the client already does this (the feed invalidates `notification.list` on
every `EventSource` re-open, A23), safe because notifications are persisted, so churny
reconnects self-heal instead of going stale; (b) move the transport to a **hosted realtime
provider** (Ably / Pusher /
Supabase Realtime) behind the same `notify()` seam; or (c) **poll** the `notification.list`
query on an interval. The persisted `notifications` table means the realtime layer is an
enhancement you can swap or drop without losing data (the [ARCHITECTURE.md](ARCHITECTURE.md#demo--scaffold-routes-delete-these)
removal note covers stripping it).

## Health checks & probes (Step 22)

`GET /api/health` is the probe target for load balancers, container orchestrators, and
the Docker `HEALTHCHECK`. It's a **Route Handler** (not a tRPC procedure) precisely so a
probe gets a real HTTP status it can act on — tRPC resolves successful calls as 200 and
wraps failures in its own JSON-RPC envelope (a `TRPCError` maps to 500, never a clean
503), and would drag in superjson/context the probe shouldn't need.

It reports **both liveness and readiness** in one response:

- **Liveness** — if the handler runs at all, the process is up. The body always carries
  `uptime` + `timestamp`.
- **Readiness** — a `select 1` DB ping (bounded by a 2.5s timeout so a hung connection
  can't stall the probe). DB reachable → **HTTP 200** `{"status":"ok","checks":{"database":"up"}}`;
  unreachable/timed out → **HTTP 503** `{"status":"error","checks":{"database":"down"}}`.

```bash
curl -i http://localhost:3000/api/health     # 200 with the DB up, 503 with it down
```

Cache Components (D4) **bans the route-segment config API**, so the route no longer pins
`runtime`/`dynamic`. It relies on Next 16's **Node-by-default** route runtime (node-postgres
is not Edge-safe — ⚠️ never set a global edge default, or this and the Stripe webhook lose
Node) and calls `await connection()` so it never prerenders — the ping runs at request time,
never at build. Importing `@repo/db` is cheap (the pg `Pool` connects lazily), so the build is
green with the DB down and the route never throws at import.

**Liveness vs readiness, intentionally merged.** A strict liveness probe shouldn't depend
on the DB (a DB blip would make an orchestrator kill otherwise-healthy app instances),
while a readiness probe should (pull the instance from rotation until its dependency
returns). This single endpoint serves the **readiness** contract — which is what the
Docker `HEALTHCHECK`, compose `depends_on: condition: service_healthy`, and PaaS health
gates actually consume — and still exposes the liveness fields in the body. To split them
for Kubernetes, add a query branch (e.g. `?check=live` → 200 whenever the process is up,
skipping the DB ping) and point the `livenessProbe` at it while `readinessProbe` uses the
default; it's a few lines and the body already separates the two signals.

**Docker `HEALTHCHECK`.** `docker/Dockerfile` runs the probe with `node -e "fetch(...)"`
(checks `r.ok`), not `curl`/`wget`: the `node:24-alpine` runtime ships no `curl`, and
busybox `wget --spider` sends a HEAD the GET-only route would 405. `--start-period=40s`
covers Next's cold boot; a 503 (down dependency) flips the container to `unhealthy`.
`docker run` then reports `healthy`/`unhealthy`, and `docker/docker-compose.prod.yml`
declares the same check explicitly on the `web` service (visible/tunable there).

> **Why the dev `docker-compose.yml` has no web healthcheck:** it runs only the backing
> services (Postgres + Meilisearch) — local dev runs the app via `pnpm dev` on the host,
> not in a container, so there's no app container to probe. Adding a `web` service to the
> dev compose would change the dev workflow, so it's intentionally left out; its
> Postgres/Meilisearch healthchecks are unchanged. The Dockerfile + prod-compose checks
> cover every place the app actually runs in a container.

## Request telemetry (Step 22)

A tRPC timing/error middleware (`apps/web/src/server/trpc/trpc.ts`) is applied to the
**base procedure**, so every procedure — public, protected, rate-limited, admin —
emits one structured log line per call (`path`, `type`, `durationMs`, `ok`, and `code`
on failure). This is what makes the Step-13 observability stack carry real traffic signal.

- **BetterStack** (`@logtail/next` `log`): `info` on success, `warn` on expected client
  errors (UNAUTHORIZED / FORBIDDEN / TOO_MANY_REQUESTS / …), `error` on a server fault.
  Falls back to **console** when `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL`
  are unset, so it runs identically with or without BetterStack creds.
- **Sentry** (`@sentry/nextjs`): `captureException` **only** for `INTERNAL_SERVER_ERROR`
  (genuine faults, not expected auth/rate-limit rejections). This is the only path tRPC
  errors reach Sentry — tRPC catches them internally, so `instrumentation.ts`'s
  `onRequestError` never sees them. No-op without a DSN.
- **Flush (D4):** `log.flush()` is scheduled via **`next/after`** (`after(() => log.flush())`),
  not awaited inline — it runs *after* the response is sent, for **every** request (success +
  error), so a short-lived (serverless) runtime can't freeze before BetterStack's batched logs
  ship, and the flush adds no latency to the response. (`after` is Next's portable equivalent
  of the platform `waitUntil`; a platform log drain remains an alternative.)

## CI/CD (GitHub Actions)

`.github/workflows/ci.yml` has four always-on jobs (`verify`, `audit`, `e2e`,
`docker-image`) plus two variable-gated jobs — `visual` (`ENABLE_VISUAL`, **on in this
repo** since A28 committed the Linux baselines, 2026-07-12 — runs on every PR/push; a
fresh fork starts with it off) and the still-dormant `perf` (`ENABLE_PERF`); a separate
`.github/workflows/codeql.yml` runs static analysis (see
[Dependency & security automation](#dependency--security-automation-step-26)).
All workflow actions are **pinned to full commit SHAs** (P1-5) with the release
version in a trailing comment — a moved/retagged upstream ref can't change what
runs in CI; Renovate maintains the digests (see the Renovate section below).

**`verify`** — runs on every PR and push:

1. Install pnpm (`pnpm/action-setup`, version from `packageManager`) + deps (`--frozen-lockfile`).
2. Type-check (`pnpm type-check`)
3. Lint (`pnpm lint`)
4. Dep-consistency (`pnpm lint:deps` → `manypkg check`, A10) — fails if the same
   external dependency is pinned to **different versions across workspace packages**
   (`drizzle-orm` / `react-hook-form` / `lucide-react` are duplicated by hand), or if a
   package's peer dep is missing from its devDependencies. A static `package.json`
   check — no build/DB — so it sits in this lane; run it locally with the same
   `pnpm lint:deps` (auto-fix with `pnpm fix:deps`).
5. Dead code / unused deps (`pnpm knip`, A27) — resolves the real import graph
   across all workspaces (root `knip.jsonc`) and fails on **unused files, unused
   exports, and unused/phantom dependencies** — the orphan classes the manypkg
   consistency check can't see. Static analysis, no build/DB. When it flags a
   change: delete the orphan, or tag intentional-but-unconsumed API surface
   `@public` at the export site; `knip.jsonc` ignores are the last resort and
   every one carries its reason (see [CONVENTIONS.md → Exports](CONVENTIONS.md#exports)).
6. Dashboards-as-code validate (`pnpm --filter @repo/observability check`) — pure
   Zod parse of the checked-in monitor/heartbeat config, credential-free.
7. Test + coverage (`pnpm test:coverage` — Vitest, no DB needed; **enforces the
   per-package coverage thresholds**, see [TESTING.md](TESTING.md#coverage)).
8. Upload coverage — every `packages/*/coverage/` as a build artifact (always;
   `if-no-files-found: ignore`), and to **Codecov** when a `CODECOV_TOKEN` secret
   is set (skipped otherwise, so the pipeline is self-contained).
9. Build (`pnpm build`) with **`SKIP_ENV_VALIDATION: "1"`**.

**`audit`** — runs on every PR and push (parallel to `verify`): installs deps and
runs `pnpm audit --audit-level high --ignore-registry-errors`. It fails on
high/critical advisories; the known unfixable transitive advisories are
allowlisted in `pnpm-workspace.yaml` (see
[Supply chain](#dependency--security-automation-step-26)), so a **new**
high/critical advisory turns it red while the accepted status quo stays green.
`--ignore-registry-errors` keeps a flaky advisory API from failing the build.

There's no root `.env` in CI; the app's build script loads `../../.env` via
`dotenv-cli`, which no-ops when the file is absent. `next build` validates env at
import, so the build-only `verify` job sets `SKIP_ENV_VALIDATION=1` — honored by
`apps/web/src/env.ts` (`skipValidation: !!process.env.SKIP_ENV_VALIDATION`) **and
passed through Turbo's strict env filter** via `globalPassThroughEnv` in
`turbo.json` (without that, `turbo build` strips it before `next build` and the
build fails on "missing" `DATABASE_URL`/`BETTER_AUTH_SECRET`). The same passthrough
is why the `e2e` job's ambient `DATABASE_URL`/`BETTER_AUTH_SECRET` reach the build.
The alternative is to supply real values: `DATABASE_URL` **and `BETTER_AUTH_SECRET`**
(min 32 chars; `BETTER_AUTH_URL` has a dev default). All feature env
(Stripe/email/observability/uploads/search) is optional, so no other CI secret is
required — except **Sentry source-map upload**, which needs `SENTRY_AUTH_TOKEN`/
`SENTRY_ORG`/`SENTRY_PROJECT` and `@sentry/cli` flipped to `true` in `allowBuilds`.

**`e2e`** — the **DB-backed lane**, runs on **every PR and push to `main`** (so a
PR can't go green while breaking the core auth/posts flow — that gap used to surface
only after merge). Playwright needs a real build + server + DB, so it spins up a
`postgres:16` **service**, sets `DATABASE_URL` + `BETTER_AUTH_SECRET` (throwaway CI
values, not secrets), runs `pnpm --filter @repo/db db:migrate`, then the **DB
integration tests** (`pnpm --filter @repo/db test:integration`), installs the browser
(`playwright install --with-deps chromium`), and finally `pnpm test:e2e`. The
Playwright report is uploaded as an artifact. **Meilisearch is intentionally absent** —
`createPost` indexes best-effort, so the suite degrades gracefully without it (see
`e2e/posts.spec.ts`). Concurrency keeps PR runs (`refs/pull/N/merge`) and main runs
(`refs/heads/main`) in distinct groups, and `cancel-in-progress` collapses superseded
pushes on a PR, so broadening to PRs doesn't pile up.

**`docker-image`** — builds, smoke-tests, and vulnerability-scans the **production
image** on every PR and push (parallel to the other jobs; no `needs`). CI used to never
build `docker/Dockerfile`, so a Dockerfile regression only surfaced on a manual build.
The job:

1. Starts a throwaway `postgres:16-alpine` on a user-defined docker network (reachable
   as `pg`), so the image's `/api/health` probe can return a real **200** (DB up) — no
   migrations needed, the probe only runs `select 1`.
2. `docker build -f docker/Dockerfile -t nwb-web:ci .` — the documented build, self-
   contained (the Dockerfile hard-sets `SKIP_ENV_VALIDATION=1`). It **also** builds the
   `worker` target (`--target worker`) — the separate background-jobs image (its esbuild
   bundle + slim runtime stage) — so a broken worker Dockerfile/bundle is caught here too;
   build-only, as the worker exposes no HTTP surface to smoke-test and its bundled JS carries
   no OS/npm packages of its own to scan beyond the shared `node:alpine` base.
3. Runs the image on that network with the runtime env `env.ts` validates
   (`DATABASE_URL` + `BETTER_AUTH_SECRET`, throwaway CI values), publishing `:3000`.
4. **Smoke test** — polls `/api/health` from the runner host until it returns 200 with
   `"status":"ok"` + `"database":"up"` (dumps `docker logs` on failure). Proves the
   standalone image boots and node-postgres works under alpine/musl, not merely that the
   process starts.
5. **CycloneDX SBOM** — a second Trivy invocation (same SHA-pinned action, in SBOM mode:
   `format: cyclonedx`, no severity/`exit-code`, so it never gates) writes
   `trivy-sbom.cdx.json` — the supply-chain inventory of every OS + app package the image
   ships. Produced on **every** run and uploaded as the **`sbom-cyclonedx`** build
   artifact (alongside coverage / Playwright reports); in the opt-in publish path it also
   feeds the SBOM attestation below. Placed *before* the vuln gate so the inventory exists
   even for an image that later fails the scan.
6. **Trivy image scan** (`aquasecurity/trivy-action`, SHA-pinned) — fails on
   `HIGH,CRITICAL` that have a **fix available** (`ignore-unfixed: true`), matching the
   `pnpm audit --audit-level high` posture so unpatchable upstream base-image CVEs don't
   flake CI red. Accept a specific advisory by adding its ID (with a reason) to the
   repo-root **`.trivyignore`** (mirrors the `pnpm audit` `ignoreGhsas` allowlist).
   Results print as a table in the log — **no SARIF upload**, which would need
   GHAS/code-scanning (unavailable on a private repo, the same constraint as CodeQL).

**Opt-in GHCR publish.** A final step pushes the *same scanned image* to GitHub
Container Registry (`ghcr.io/<owner>/<repo>-web`, tagged with the commit SHA + `latest`).
It is **off by default** and runs only on push to `main` **and** when the
`ENABLE_GHCR_PUBLISH` repository variable is `"true"` — the same opt-in pattern as
`ENABLE_CODEQL`. Auth uses the workflow's `GITHUB_TOKEN` (the job grants
`packages: write`); no extra secret. To enable:

```bash
gh variable set ENABLE_GHCR_PUBLISH --body true
```

**SBOM + build-provenance attestation (opt-in, rides the publish).** When — and only
when — the GHCR publish runs, two further steps sign **[SLSA build-provenance](https://slsa.dev/)**
and **SBOM** attestations over the pushed image's immutable **digest** and attach them to
the GHCR package (keyless [Sigstore](https://www.sigstore.dev/) signing via the workflow's
OIDC token — the job also grants `id-token: write` + `attestations: write`). They use the
first-party `actions/attest-build-provenance` + `actions/attest-sbom` (SHA-pinned). Nothing
new to enable — they share the `ENABLE_GHCR_PUBLISH` + push-to-`main` gate, so a published
image always ships attested. A consumer can then verify *how it was built* and *what it
contains* before running it:

```bash
# both the provenance and SBOM attestations are stored with the package
gh attestation verify oci://ghcr.io/<owner>/<repo>-web:latest --owner <owner>
```

> The **SBOM artifact** (step 5) is produced and local-verifiable on every run; the
> **attestation** steps only exercise inside a real GHCR publish (they need an OIDC token
> and a registry push, so they can't run on a PR) — they are wired and gated, exercised
> the first time `ENABLE_GHCR_PUBLISH` is turned on.

**`perf`** *(opt-in, dormant)* — gates the production bundle against
`apps/web/.size-limit.json` (see [Performance budgets](#performance-budgets-opt-in)). It
installs deps, builds the app **keyless** (no PostHog key in CI → no `ConsentBanner` in
the measured bundle, matching what deploys ship), then runs `pnpm --filter web size`. No
DB, no booted app, no headless Chrome — just deterministic byte counts, so it can't
flake and needs no per-OS baseline. **Off by default**: runs only when the `ENABLE_PERF`
repository variable is `"true"` (the `ENABLE_CODEQL` / `ENABLE_GHCR_PUBLISH` pattern) —
`gh variable set ENABLE_PERF --body true`. The `@repo/ui` **`visual`** job is gated the
same way (`ENABLE_VISUAL`) but is **live in this repo** — A28 (2026-07-12) committed the
Linux baselines and set the variable (see [UI.md](UI.md)).

## Remote caching (Turborepo, opt-in)

Turborepo caches each task's output keyed by a hash of its declared `inputs` +
`env`. By default that cache is **local only** (`.turbo/`, gitignored). A *remote*
cache shares those artifacts across machines and CI runs, so a build/test someone
else (or a previous CI run) already did is downloaded instead of re-run.

**It is off by default and unwired** — the repo builds and CI passes with zero
config. Turn it on only when the time saved is worth the setup. The prerequisite
is already in place: every cacheable task in `turbo.json` declares its `inputs`/
`outputs` (and `build` its `env`), which is what makes a cross-machine hit
*correct* rather than stale. Adopting remote cache needs **no change to
`turbo.json`**.

### Vercel-hosted (zero infra)

```bash
pnpm turbo login    # opens a browser, auths your Vercel account
pnpm turbo link     # links this repo to a Vercel team + enables remote caching
```

`link` writes `.turbo/config.json` (gitignored). From then on local `turbo` runs
read/write the remote cache automatically.

### Self-hosted (no Vercel)

Point Turbo at any compatible cache server (e.g. an OSS
`turborepo-remote-cache`) and supply credentials via env — no `turbo link` needed:

```bash
export TURBO_API=https://your-cache.example.com   # custom cache endpoint
export TURBO_TOKEN=…                               # auth token
export TURBO_TEAM=…                                # team/namespace slug
```

(`--api` / `--token` / `--team` are the equivalent `turbo run` flags.)

### CI (still opt-in)

Add `TURBO_TOKEN` + `TURBO_TEAM` (and `TURBO_API` if self-hosted) as repo secrets/
variables and expose them as `env:` on the `verify`/`e2e` jobs. Turbo auto-detects
them — **no workflow logic changes**, the existing `pnpm build`/`pnpm test` calls
just start hitting the remote cache. Two flags worth knowing:

- `--remote-cache-read-only` — read but don't write the remote cache. Good for PR
  runs so untrusted branches can't populate the shared cache.
- `--remote-only` — ignore the local FS cache entirely (`remote:rw`); useful on
  ephemeral CI runners where the local cache is always cold anyway.

### Signing (recommended for a shared cache)

A shared cache is a code-execution supply-chain surface — a poisoned artifact runs
on every consumer. Enable HMAC artifact signing so Turbo rejects tampered
artifacts:

```bash
export TURBO_REMOTE_CACHE_SIGNATURE_KEY=…   # any high-entropy secret, shared by all consumers
```

This pairs with the repo's existing supply-chain discipline
([below](#dependency--security-automation-step-26)). Verified against `turbo`
**2.9.18** (`turbo login|link|run --help`).

## Dependency & security automation (Step 26)

The repo's supply-chain discipline (documented per-dependency in
[STACK.md](STACK.md)) is now enforced by automation, not only by hand.

### Renovate (`.github/renovate.json`)

Automated dependency updates tuned to the repo's posture:

- **`minimumReleaseAge: "7 days"`** — the headline. Renovate never *proposes* a
  release younger than a week, codifying the "let it age before taking it" rule
  every dependency note describes. `internalChecksFilter: "strict"` makes the age
  gate hold even when the registry is the only data source. **Security updates
  bypass it** (`vulnerabilityAlerts.minimumReleaseAge: null`) so fixes aren't delayed.
- **`rangeStrategy: "auto"`** preserves each dependency's existing style — bumps the
  exact-pinned ones (`stripe`, `@sentry/nextjs`, `posthog-*`, `lucide-react`,
  `lint-staged`, …) as new exact pins, widens the caret ranges in place — so the
  mixed pin/caret posture survives upgrades without re-encoding every pin.
- **`helpers:pinGitHubActionDigests`** (P1-5) — keeps the workflows' SHA-pinned
  `uses:` refs updated (digest + `# vX.Y.Z` comment) as new action releases age past
  the same 7-day gate; pins were seeded from the GitHub API at the newest ≥7-day-old
  release per major line (which put CodeQL one behind: v3.36.3 was published the day
  of pinning).
- `lockFileMaintenance` weekly (refresh transitive deps), `semanticCommits:
  "disabled"` (the repo's history is intentionally mixed-style — same reason the
  Step-25 `commit-msg` hook isn't a Conventional-Commits enforcer), a weekly
  schedule to batch PRs, `@types/*` grouped, and **major bumps gated behind
  Dependency-Dashboard approval**.
- **Setup:** Renovate runs via the **Renovate GitHub App** (install it on the repo
  from the GitHub Marketplace). Because this config file is already committed it
  skips the onboarding PR and goes straight to the "Dependency Dashboard" issue +
  scheduled update PRs (onboarding PRs only appear on repos with no Renovate
  config). Validate config changes locally with
  `pnpm dlx --package renovate renovate-config-validator .github/renovate.json`.

> **Two-layer release-age enforcement (A11).** The 7-day gate holds at both layers.
> Renovate (**update-time**) never *proposes* a release younger than a week. pnpm's
> install-time **`minimumReleaseAge: 10080`** (in `pnpm-workspace.yaml`, minutes) gates
> the **existing lockfile**: pnpm validates every entry against the age on each install
> (including `--frozen-lockfile`), so a too-fresh transitive can't enter the tree through
> a lockfile edit either. It was left commented while the repo was days old — a frozen
> install checks the whole lockfile, and the early deliberate pins + their fresh
> transitives would have failed — and **enabled 2026-07-08** once the tree aged past the
> window (a frozen install verified all lockfile entries clear the gate). The setting
> reads each version's *publish* time, not its lockfile-add date, so a recently-added but
> long-published package (e.g. `sonner`, `@manypkg/cli`) passes. Note it does **not**
> exempt security fixes (unlike Renovate's `vulnerabilityAlerts.minimumReleaseAge: null`);
> a fix younger than 7 days needs a manual `auditConfig`/override bypass.

### Supply-chain audit

`pnpm audit` runs in CI (the `audit` job above) and locally. Known **unfixable
transitive** advisories are explicitly acknowledged in `pnpm-workspace.yaml` under
`auditConfig.ignoreGhsas` — each with its dependency path and why it's low-risk for
this app — so the audit is green on the accepted status quo and goes **red the
moment a new advisory appears**. Currently allowlisted (deep transitives awaiting
upstream bumps): `effect` (via uploadthing), `esbuild` dev-server (via drizzle-kit,
never run here), `postcss` stringify (via next). Prune an entry once the upstream
fix lands in the lockfile — an ignore for an absent advisory is a harmless no-op.

```bash
pnpm audit                                  # full report (honors the allowlist)
pnpm audit --audit-level high               # what CI gates on
pnpm audit --fix                            # attempt overrides/updates for fixes
```

### CodeQL (`.github/workflows/codeql.yml`)

GitHub's static analysis, language `javascript-typescript`, `build-mode: none` (no
compile needed for JS/TS). Findings appear under the repo's **Security → Code
scanning** tab, which requires **GitHub Advanced Security** — free on **public** repos,
a paid add-on on private ones (not available on personal private repos). Without it the
`analyze` step **fails** with `Code scanning is not enabled for this repository`.

**So the job is opt-in.** It's gated on `if: ${{ vars.ENABLE_CODEQL == 'true' }}` and
skipped by default — the workflow run is then neutral (no false-red check). Turn it on
once the repo is public or GHAS is enabled:

```bash
gh variable set ENABLE_CODEQL --body true   # or Settings → Secrets and variables → Actions → Variables
```

It still triggers on push/PR to `main` and a weekly cron; the gate only controls
whether the analysis actually runs.

## Deployment Targets

The Docker image (built with `BUILD_STANDALONE=1`) runs the standalone server with
`node apps/web/server.js` — no platform-specific runtime needed. Don't forget to run
migrations (above) against the target database.

| Target | Command / notes |
| --- | --- |
| Vercel | Connect repo, set env vars — zero config for Next.js (ignores `output: standalone`; no `BUILD_STANDALONE` needed) |
| Railway | `docker/Dockerfile` deploy; add Postgres + Meilisearch as Railway services |
| Fly.io | Committed `fly.toml` + `docker/Dockerfile` + Fly Postgres — **worked runbook below** |
| Self-hosted | `docker/docker-compose.prod.yml` (app + Postgres + Meilisearch) on any VPS; Coolify recommended |

### Fly.io (worked runbook)

> ✅ **Verified end-to-end 2026-07-13** — this exact runbook deployed a test app to Fly
> (managed `fly postgres`): `/api/health` 200 `{"database":"up"}`, prod security headers,
> `fly status` 1/1 passing, and a real sign-up → session → user row in the managed Postgres. See
> [VERIFICATION.md](../VERIFICATION.md) Phase 6.

A committed **`fly.toml`** (repo root) deploys the web app from `docker/Dockerfile` — the
standalone `:3000` server with the `/api/health` readiness check wired in. It runs the **web
app only**; the jobs worker, Meilisearch, Stripe, email, and observability are optional and
graceful-degrade (see the follow-ups at the end). Prereqs: [`flyctl`](https://fly.io/docs/flyctl/install/)
and a Fly account.

First, set your own globally-unique `app` name and nearest `primary_region` in `fly.toml`
(the default is `nwb-web` / `iad`). Then:

```bash
fly auth login

# 1. Register the app (reads fly.toml; name must be globally unique).
fly apps create <your-app>

# 2. Managed Postgres, same region. SAVE the credentials it prints.
fly postgres create --name <your-app>-db --region <region>
# Attach → sets the app's DATABASE_URL secret to the DIRECT (session-mode) internal
# connection. That directness matters: pg-boss + the SSE LISTEN/NOTIFY listener need a
# session connection, not a transaction pooler (see Managed Postgres & pooling above).
fly postgres attach <your-app>-db -a <your-app>

# 3. Migrate from your machine — the runtime image has no drizzle-kit (see Migrations
#    above), so tunnel to the DB and run the migrator locally.
fly proxy 15432:5432 -a <your-app>-db          # leave running in one shell
#    …in another shell (creds from step 2 / `fly postgres connect`):
DATABASE_URL="postgres://postgres:<pw>@localhost:15432/<your-app>?sslmode=disable" \
  pnpm --filter @repo/db db:migrate

# 4. Required runtime secrets (everything else is optional / degrades gracefully).
fly secrets set \
  BETTER_AUTH_SECRET="$(openssl rand -base64 24)" \
  BETTER_AUTH_URL="https://<your-app>.fly.dev" \
  -a <your-app>
#    BETTER_AUTH_URL MUST equal the public origin — Better Auth checks the request
#    Origin against it, so a mismatch 403s every sign-in/POST.

# 5. Ship it (builds docker/Dockerfile, deploys, runs the health check).
fly deploy -a <your-app>
```

**Verify live:**

```bash
curl -i https://<your-app>.fly.dev/api/health     # → 200 {"status":"ok","checks":{"database":"up"}}
fly status -a <your-app>                          # machine + check = healthy
fly logs -a <your-app>                            # clean boot, no env/DB errors
```

Then in a browser: sign up → land on `/dashboard` (proves auth + a real DB write end-to-end
on the host).

**Notes & follow-ups:**

- **Single instance by default.** `fly.toml` pins `min_machines_running = 1` / autostop off
  (the SSE stream + LISTEN connection + DB health check need a live machine). The realtime
  bus already fans out **across** instances via Postgres `NOTIFY`, so scaling out works — but
  the **app-level rate limiter is in-memory per instance**; set `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` before running more than one machine (see SECURITY.md / AUTH.md).
- **Jobs worker (optional).** Deploy it as a **second Fly app** from the Dockerfile's `worker`
  target — `fly deploy --dockerfile docker/Dockerfile --build-target worker` in a small
  sibling `fly.toml` (no `[http_service]`; it exposes no HTTP), sharing the same `DATABASE_URL`.
  Until then, enqueued jobs simply wait in the `pgboss` schema (the app is unaffected — see
  Background-jobs worker above). Copy the BetterStack heartbeat URL into its
  `BETTER_STACK_HEARTBEAT_URL` if you want dead-worker paging.
- **Meilisearch (optional).** Search degrades gracefully when unset. To enable, run a
  Meilisearch machine (or a hosted plan) and set `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY`.
- **Feature secrets.** Add Stripe / Resend / Sentry / PostHog / Uploadthing / Turnstile via
  `fly secrets set` when you enable each (all optional in `env.ts`). Take a DB backup before
  every `db:migrate` (migrations are forward-only — see Backups & disaster recovery).
