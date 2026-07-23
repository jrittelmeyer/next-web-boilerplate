# Deployment

> When to load: Docker, environment variables, CI/CD, infrastructure, going to production.

## Environment Variables

Validated at startup by `@t3-oss/env-nextjs`. The schema lives in `apps/web/src/env.ts`
(format logic for `EMAIL_FROM` / `AUTH_TRUSTED_ORIGINS` in `lib/env-schema.ts`, unit-tested).
If a required var is missing — or a set var is malformed (URL-shaped vars, `EMAIL_FROM`,
trusted-origin entries) — the app throws at startup with a clear error naming the var.

> **The committed root [`.env.example`](../../.env.example) is the var reference** — it
> carries every feature block with per-var comments; copy it and uncomment what you
> configure. Non-inferable notes beyond the file's own comments:
>
> - `BETTER_STACK_API_TOKEN` / `BETTER_STACK_HEARTBEAT_URL` are deliberately **absent**
>   from it — script/worker-only (dashboards-as-code `sync` / the jobs-worker heartbeat),
>   never read by the app, not in `env.ts`. See
>   [services/observability-dac.md](services/observability-dac.md).
> - `CSP_MODE` is **build-time**, like `NEXT_PUBLIC_*` — bake it in (`CSP_MODE=nonce pnpm
>   build` / docker `--build-arg`); a runtime value is ignored.
>   [SECURITY.md](SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch).
> - `DB_POOL_MAX` caps the app pool (unset → pg's default 10; set-but-invalid fails loud
>   at startup) — sizing rule below and in
>   [DATABASE.md](DATABASE.md#connection-pooling-managed-postgres--serverless).
> - `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`) is CI-only, for build-time
>   source-map upload — see [services/sentry.md](services/sentry.md).

**Managed Postgres & pooling.** On a managed provider (Neon / Supabase / RDS) or **any
serverless** target, point `DATABASE_URL` at a **pooled** connection string, cap the app pool
(`DB_POOL_MAX`), and give the **pg-boss worker** + the SSE listener a *direct/session-mode*
connection. Canonical guidance (sizing rule, pooler ports, the transaction-mode caveat):
[DATABASE.md](DATABASE.md#connection-pooling-managed-postgres--serverless).

**IP-based rate limiting needs a trusted proxy.** The app derives the client IP from
`x-forwarded-for` / `x-real-ip`, which Vercel / Fly / Railway / Render / Cloudflare /
nginx-style proxies set for you — so it works out of the box on a real PaaS. If you
expose the Node server **directly** to the internet, those headers are client-spoofable
and IP limiting becomes meaningless; put a proxy in front that overwrites them with the
real peer IP. Full platform table + the per-surface IP-less behavior (incl. the webhook
`noip` bucket) are in [SECURITY.md](SECURITY.md#client-ip-resolution--trusted-proxies-d10).

**Observability is all-optional.** The app builds and runs with every
Sentry/BetterStack/PostHog var unset (verified: `pnpm lint`+`type-check`+`build` with
them unset). Two deployment-specific notes:

- **PostHog `/ingest` proxy:** `next.config.ts` rewrites `/ingest/*` to the regional
  ingestion host derived from `NEXT_PUBLIC_POSTHOG_HOST` (default US). It's same-origin,
  so no CORS/ad-blocker config is needed; just set the env var for your region.
- **Sentry source-map upload** is build-time (`SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`,
  plus flipping `@sentry/cli` to `true` in `pnpm-workspace.yaml` `allowBuilds`) and is
  supported under the **Turbopack** build — details: [services/sentry.md](services/sentry.md).
- **Dashboards-as-code** (`@repo/observability`): BetterStack monitors/heartbeats checked
  in as TS — CI validates it credential-free; `pnpm --filter @repo/observability sync`
  (with `BETTER_STACK_API_TOKEN`) applies it idempotently. After the first sync, copy the
  `jobs-worker` heartbeat's ping URL into the worker's `BETTER_STACK_HEARTBEAT_URL` so a
  dead worker pages you. Canonical:
  [services/observability-dac.md](services/observability-dac.md).

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
this repo's Turbopack build you'd be analyzing a webpack bundle the app never ships.
Both `analyze` scripts wrap `dotenv -e ../../.env` so the internal compile passes env
validation; the CLI is flagged **experimental**, so the `experimental-analyze`
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

**Why a byte budget, not Lighthouse-CI** — bundle bytes are **deterministic** (same
commit → same gzip size on any OS), so the gate can't flake and needs no per-OS
baseline. A Lighthouse category/CWV gate rests on lab timings that swing run-to-run on
shared CI runners, and its one deterministic part (resource-size budgets) is what this
byte budget already covers — without a booted app or headless Chrome.

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

Multi-stage build on `node:24-alpine` (corepack-pinned pnpm from `packageManager`);
stages: see the Dockerfile. The non-inferable choices: the **builder** stage builds
with `SKIP_ENV_VALIDATION=1` + **`BUILD_STANDALONE=1`** (see below) — no real secrets
are needed or baked in — and the CSP mode is chosen here too (`docker build
--build-arg CSP_MODE=nonce …` bakes the nonce-CSP build into the image; see
[SECURITY.md](SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch)). The
**runner** is minimal, runs as the **non-root `nextjs`** user (uid 1001,
`node apps/web/server.js` on `:3000`), and the base image's bundled **`npm` CLI is
removed** — the runtime never invokes it, so this shrinks the image and drops npm's
own vendored deps from the image-scan surface (see the `docker-image` CI job below);
corepack/pnpm live only in the build stages, never the runner.

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
> and the app's validated vars (incl. `CSP_MODE`, which must also key the build's
> cache — a static and a nonce build are different artifacts) are in the `build`
> task's `env`, so they reach
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
- PostgreSQL 18 on port 5432 (`nwb-postgres`; 18+ images require the volume mounted
  at `/var/lib/postgresql`, not the old `/data` suffix — a volume created by ≤17
  needs a dump/reload or recreate)
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
- The **`worker` service** runs the pg-boss background-jobs worker as a **second
  process sharing the same Postgres** — see below.

### Background-jobs worker (D7)

The `@repo/jobs` worker is a **separate long-lived process**, not part of the web image's
`server.js`. The `prod` compose includes a **`worker` service** built from the Dockerfile's
**`worker` target**, sharing the DB by service-name `DATABASE_URL`. It comes up with `up --build`.

- **Slim image (esbuild-bundled, not `tsx`):** the image ships **no** TS transpiler and **no**
  `node_modules` tree — a `jobs-build` stage esbuild-bundles `worker.ts` + everything it
  imports (the `@repo/db` / `@repo/email` workspace TS, JSX templates included) into one
  `dist/worker.js`; the final stage is `node:24-alpine` + that file (npm stripped like the
  runner, unprivileged `node` user). ~169 MB vs ~1.57 GB for the old tsx-at-runtime approach;
  see `packages/jobs/build.mjs`. Local dev still runs the TS directly (`pnpm --filter
  @repo/jobs start` → `tsx`), so there's no build step in the edit loop.
- **Run it anywhere** (not just compose): `pnpm --filter @repo/jobs start`. All it needs is
  `DATABASE_URL` (+ any env a job uses, e.g. `RESEND_API_KEY`/`EMAIL_FROM` for the welcome
  email). On a PaaS, add it as a second "worker"/background process type alongside `web`.
- **Optional & safe to omit:** the web app enqueues regardless (graceful no-op if the DB is
  down); if no worker runs, jobs accumulate in the `pgboss` schema and drain when one starts.
  Nothing about deploying `web` requires the worker.
- **Schema:** pg-boss creates + owns the `pgboss` schema itself — no Drizzle migration, no
  `db:migrate` step for it (see [DATABASE.md](DATABASE.md)).
- **Recurring jobs:** the worker also registers a cron schedule on boot (the
  `cleanup-expired-verifications` housekeeping job — see [services/jobs.md](services/jobs.md)). Run **one**
  worker for scheduling: pg-boss's cron scheduler fires each tick once across all `supervise:true`
  workers (it's not per-instance), so multiple workers won't double-fire, but the schedule only
  advances while at least one worker is up.
- **Runtime cost (honest):** one extra Node process (~50–80 MB idle) polling Postgres on an
  interval + pg-boss's periodic maintenance, plus a small pg-boss pool on the web side
  (lazy, enqueue-only — no polling). This is the one jobs surface that adds real runtime cost.

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
- A **transaction-mode pooler breaks `LISTEN`** — the listener needs a direct/session
  connection: [DATABASE.md](DATABASE.md#connection-pooling-managed-postgres--serverless).

**If you deploy serverless,** pick one: (a) accept short streams + **backfill on
(re)connect** — the client already does this (it invalidates `notification.list` on every
`EventSource` re-open), so churny reconnects self-heal; (b) move the transport to a
**hosted realtime provider** (Ably / Pusher / Supabase Realtime) behind the same
`notify()` seam; or (c) **poll** `notification.list` on an interval. The persisted
`notifications` table means the realtime layer is an enhancement you can swap or drop
without losing data (the
[ARCHITECTURE.md](ARCHITECTURE.md#demo--scaffold-routes-delete-these) removal note
covers stripping it).

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

Cache Components **bans the route-segment config API**, so the route no longer pins
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
for Kubernetes, add a `?check=live` branch (200 whenever the process is up, skipping the
DB ping) for the `livenessProbe` — the body already separates the two signals.

**Docker `HEALTHCHECK`.** `docker/Dockerfile` runs the probe with `node -e "fetch(...)"`
(checks `r.ok`), not `curl`/`wget`: the `node:24-alpine` runtime ships no `curl`, and
busybox `wget --spider` sends a HEAD the GET-only route would 405. `--start-period=40s`
covers Next's cold boot; a 503 (down dependency) flips the container to `unhealthy`.
`docker run` then reports `healthy`/`unhealthy`, and `docker/docker-compose.prod.yml`
declares the same check explicitly on the `web` service (visible/tunable there).

> **The dev `docker-compose.yml` has no web healthcheck** because it runs only the
> backing services — local dev runs the app via `pnpm dev` on the host, so there's no
> app container to probe; the Dockerfile + prod-compose checks cover every place the
> app actually runs in a container.

## Request telemetry (Step 22)

A tRPC timing/error middleware (`apps/web/src/server/trpc/trpc.ts`) is applied to the
**base procedure**, so every procedure — public, protected, rate-limited, admin —
emits one structured log line per call (`path`, `type`, `durationMs`, `ok`, and `code`
on failure). This is what makes the observability stack carry real traffic signal.

- **BetterStack** (`@logtail/next` `log`): `info` on success, `warn` on expected client
  errors (UNAUTHORIZED / FORBIDDEN / TOO_MANY_REQUESTS / …), `error` on a server fault.
  Falls back to **console** when `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL`
  are unset, so it runs identically with or without BetterStack creds.
- **Sentry** (`@sentry/nextjs`): `captureException` **only** for `INTERNAL_SERVER_ERROR`
  (genuine faults, not expected auth/rate-limit rejections). This is the only path tRPC
  errors reach Sentry — tRPC catches them internally, so `instrumentation.ts`'s
  `onRequestError` never sees them. No-op without a DSN.
- **Flush:** `log.flush()` is scheduled via **`next/after`** (`after(() => log.flush())`),
  not awaited inline — it runs *after* the response is sent, for **every** request (success +
  error), so a short-lived (serverless) runtime can't freeze before BetterStack's batched logs
  ship, and the flush adds no latency to the response. (`after` is Next's portable equivalent
  of the platform `waitUntil`; a platform log drain remains an alternative.)

## CI/CD (GitHub Actions)

`.github/workflows/ci.yml` has four always-on jobs (`verify`, `audit`, `e2e`,
`docker-image`) plus three variable-gated jobs — `visual` (`ENABLE_VISUAL`, **on in
this repo**), `csp-nonce` (`ENABLE_CSP_NONCE`, **on in this repo**; a fork that never
uses nonce mode leaves it unset) and the still-dormant `perf` (`ENABLE_PERF`). A
separate `.github/workflows/codeql.yml` runs static analysis (see
[Dependency & security automation](#dependency--security-automation-step-26)) and
`.github/workflows/security-audit.yml` is the daily advisory watch lane (below).
**Job steps: see `.github/workflows/ci.yml`** — this section keeps only the rationale
the YAML can't tell you. All workflow actions are **pinned to full commit SHAs** with
the release version in a trailing comment — a moved/retagged upstream ref can't
change what runs in CI; Renovate maintains the digests (see the Renovate section
below).

**Triggers.** PRs, pushes to `main`, a **weekly `schedule`** (Thursdays 04:30 UTC)
and **`workflow_dispatch`**. The schedule is a **heartbeat**: in maintenance mode a
push is otherwise the only thing exercising CI, so a weekly full run keeps "green"
honest against world-drift between merges; it's offset from CodeQL's Monday cron,
and repo activity keeps GitHub's 60-day auto-disable of scheduled workflows from
tripping. Schedule/dispatch runs behave exactly like a push to `main` — only the
`push`-gated GHCR publish/attest steps stay skipped.

**`verify`** — the static lane (no DB): type-check, lint, dep-consistency
(`manypkg`), dead code / unused deps (`knip` — delete the orphan or tag intentional
surface `@public`; see [CONVENTIONS.md → Exports](CONVENTIONS.md#exports)),
dashboards-as-code validate, **docs-sanity** (`node scripts/docs-sanity.mjs` — every
relative doc link resolves and AGENTS.md's Commands section matches root
`package.json` scripts), test + coverage (per-package thresholds, see
[TESTING.md](TESTING.md#coverage); Codecov only when a `CODECOV_TOKEN` secret is
set), then a `SKIP_ENV_VALIDATION=1` build.

**`audit`** — parallel lane: `pnpm audit --audit-level high
--ignore-registry-errors` (a flaky advisory API can't fail the build). Known
unfixable transitives are allowlisted in `pnpm-workspace.yaml` (see
[Supply chain](#dependency--security-automation-step-26)), so a **new** high/critical
advisory turns it red while the accepted status quo stays green. On non-PR runs on
`main` a follow-up step re-audits at **moderate+** and syncs the rolling
`security-triage` issue via `.github/scripts/security-triage-issue.sh`.

**`security-audit.yml`** (separate workflow) — the **daily** advisory watch lane
(cron 05:00 UTC): moderate+ audit, a best-effort Dependabot-alerts cross-check, the
same issue sync. Advisories publish against the world, not this repo's commits — a
green tree can wake up red, and the weekly heartbeat alone leaves up to a 6-day
blind window. The `security-triage` issue (assigned to the repo owner) is the
machine guarantee a finding lands in the backlog; triage:
[MAINTENANCE.md → Security response runbook](../MAINTENANCE.md#security-response-runbook).

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

**`e2e`** — the **DB-backed lane**, on **every PR and push to `main`** (so a PR
can't go green while breaking the core auth/posts flow — that gap used to surface
only after merge): a `postgres:18` service (throwaway env values, not secrets),
migrations, the DB integration tests, then Playwright. **Meilisearch is
intentionally absent** — `createPost` indexes best-effort, so the suite degrades
gracefully without it (see `e2e/posts.spec.ts`). Concurrency groups +
`cancel-in-progress` keep PR runs from piling up.

**`csp-nonce`** — the nonce-mode twin of `e2e` (`ENABLE_CSP_NONCE`, **on in this
repo**): `CSP_MODE: nonce` in the job env builds the app **in nonce mode** (a
distinct Turbo cache key) and `playwright.config.ts` scopes the run to the nonce
matrix (`e2e/csp-nonce.spec.ts`) plus the mode-agnostic `security-headers.spec.ts`.
`CSP_MODE` is **build-time**, which is why this is a separate lane with its own
build rather than extra specs in the `e2e` lane — which keeps proving the static
default. See
[SECURITY.md → CSP strategy](SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch).

**`docker-image`** — builds, smoke-tests, and vulnerability-scans the **production
image** on every PR and push (CI used to never build `docker/Dockerfile`, so a
Dockerfile regression only surfaced on a manual build). Non-inferable parts: the
**smoke test** polls the running image's `/api/health` against a throwaway Postgres
until it returns 200 with `"database":"up"` — proving the standalone image boots and
node-postgres works under alpine/musl, not merely that the process starts. The
**`worker` target is built too, build-only** (no HTTP surface to smoke-test; its
bundled JS adds nothing to scan beyond the shared `node:alpine` base). A **CycloneDX
SBOM** (Trivy in SBOM mode — never gates) is produced on **every** run and uploaded
as the `sbom-cyclonedx` artifact, placed *before* the vuln gate so the inventory
exists even for an image that fails the scan. The **Trivy vuln gate** fails on
`HIGH,CRITICAL` with a **fix available** (`ignore-unfixed: true`), matching the
`pnpm audit --audit-level high` posture so unpatchable base-image CVEs don't flake
CI red; accept a specific advisory (with a reason) in the repo-root `.trivyignore`.
Results print as a log table — **no SARIF upload**, which would need
GHAS/code-scanning (unavailable on a private repo, the same constraint as CodeQL).

**Opt-in GHCR publish + attestations.** A final step pushes the *same scanned image*
to `ghcr.io/<owner>/<repo>-web` — only on push to `main` **and** when the
`ENABLE_GHCR_PUBLISH` variable is `"true"` (`gh variable set ENABLE_GHCR_PUBLISH
--body true`); auth is the workflow's `GITHUB_TOKEN`, no extra secret. When — and
only when — the publish runs, **[SLSA build-provenance](https://slsa.dev/)** and
**SBOM** attestations are signed over the pushed image's immutable **digest** and
attached to the GHCR package (keyless [Sigstore](https://www.sigstore.dev/) signing
via the workflow's OIDC token). They share the publish gate, so a published image
always ships attested — and they can't exercise on a PR (they need an OIDC token +
a registry push), so they are wired and gated, exercised the first time the variable
is turned on. Verify:
`gh attestation verify oci://ghcr.io/<owner>/<repo>-web:latest --owner <owner>`.

**`perf`** *(opt-in, dormant)* — gates the production bundle against
`apps/web/.size-limit.json` (see [Performance budgets](#performance-budgets-opt-in)).
It builds the app **keyless** (no PostHog key → no `ConsentBanner` in the measured
bundle, matching what deploys ship) — no DB, no booted app, no headless Chrome, so
deterministic byte counts that can't flake and need no per-OS baseline. Enable with
`gh variable set ENABLE_PERF --body true`. The `@repo/ui` **`visual`** job is gated
the same way (`ENABLE_VISUAL`) but is **live in this repo** — the Linux baselines
are committed (see [UI.md](UI.md)).

## Storybook on GitHub Pages (component gallery)

`.github/workflows/pages.yml` publishes the `@repo/ui` **Storybook** gallery (the
static export — see [UI.md → Component gallery](UI.md#component-gallery-storybook)) to
**GitHub Pages** — browsable at
**<https://jrittelmeyer.github.io/next-web-boilerplate/>** without cloning (steps: see
the workflow; actions SHA-pinned under the same Renovate digest preset as `ci.yml`).
It runs on a push to `main` that touches `packages/ui/**` (or the workflow itself) and
on `workflow_dispatch` — a docs- or app-only push doesn't rebuild the site.

- **Enable Pages once (out-of-band)** — the Actions `GITHUB_TOKEN` can't *create* the
  Pages site (`Resource not accessible by integration`), so this is one-time setup the
  workflow can't bootstrap: flip **Settings → Pages → Source: "GitHub Actions"**, or
  with a user/PAT token:
  `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow`. (Done for this repo.)
- **Subpath-safe** — the static export uses only relative asset paths, so it serves
  correctly under the project `/<repo>/` subpath with no `base` config.
- **Derived apps** — the workflow is generic (only the published URL differs). Pages is
  free on **public** repos; on a **private** repo it needs a paid plan, so a private
  fork can delete `pages.yml` or leave it dormant.

## Remote caching (Turborepo, opt-in)

A remote cache shares Turbo task artifacts across machines and CI runs. **It is off
by default and unwired** — the repo builds and CI passes with zero config. The
prerequisite is already in place: every cacheable task in `turbo.json` declares its
`inputs`/`outputs` (and `build` its `env`), which is what makes a cross-machine hit
*correct* rather than stale — adopting remote cache needs **no change to
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
variables and expose them as `env:` on the `verify`/`e2e` jobs — Turbo auto-detects
them, **no workflow logic changes**. Use `--remote-cache-read-only` on PR runs so
untrusted branches can't populate the shared cache; `--remote-only` suits ephemeral
runners whose local cache is always cold.

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
- **`helpers:pinGitHubActionDigests`** — keeps the workflows' SHA-pinned
  `uses:` refs updated (digest + `# vX.Y.Z` comment) as new action releases age past
  the same 7-day gate.
- `lockFileMaintenance` weekly (refresh transitive deps), `semanticCommits:
  "disabled"` (the repo's history is intentionally mixed-style — same reason the
  `commit-msg` hook isn't a Conventional-Commits enforcer), a weekly
  schedule to batch PRs, `@types/*` grouped, and **major bumps gated behind
  Dependency-Dashboard approval**.
- **Setup:** Renovate runs via the **Renovate GitHub App** (install it on the repo
  from the GitHub Marketplace). Because this config file is already committed it
  skips the onboarding PR and goes straight to the "Dependency Dashboard" issue +
  scheduled update PRs (onboarding PRs only appear on repos with no Renovate
  config). Validate config changes locally with
  `pnpm dlx --package renovate renovate-config-validator .github/renovate.json`.

> **Two-layer release-age enforcement.** The 7-day gate holds at both layers.
> Renovate (**update-time**) never *proposes* a release younger than a week. pnpm's
> install-time **`minimumReleaseAge: 10080`** (in `pnpm-workspace.yaml`, minutes) gates
> the **existing lockfile**: pnpm validates every entry on each install (including
> `--frozen-lockfile`), so a too-fresh transitive can't enter the tree through a
> lockfile edit either. It reads each version's *publish* time, not its lockfile-add
> date, so a recently-added but long-published package passes. Note it does **not**
> exempt security fixes (unlike Renovate's `vulnerabilityAlerts.minimumReleaseAge:
> null`); a fix younger than 7 days needs a manual `auditConfig`/override bypass.

### Supply-chain audit

`pnpm audit` runs in CI (the `audit` job above) and locally. Known **unfixable
transitive** advisories are explicitly acknowledged in `pnpm-workspace.yaml` under
`auditConfig.ignoreGhsas` — each with its dependency path and why it's low-risk for
this app — so the audit is green on the accepted status quo and goes **red the
moment a new advisory appears**. The allowlist is currently **empty**: the
long-standing entries were remediated with temporary scoped `overrides:` in the same
file — removal conditions in
[MAINTENANCE.md → Watch items](../MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)
— so the audit now guards those overrides live. When a future advisory has no fix
path at all, allowlist it with its reason and prune the entry once the upstream fix
lands in the lockfile — an ignore for an absent advisory is a harmless no-op.

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

> ✅ **Verified end-to-end** — record: [VERIFICATION.md](../VERIFICATION.md) Phase 6 /
> [docs/archive/](../archive/).

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
# connection — required by pg-boss + the SSE listener (DATABASE.md → Connection pooling).
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
