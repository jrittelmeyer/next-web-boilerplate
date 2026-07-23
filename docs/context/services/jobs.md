# Background jobs (`@repo/jobs` / pg-boss) — D7

> When to load: working on background jobs — `@repo/jobs`, pg-boss queues/handlers, retries, the cron schedule, or the dead-letter queue. Shared degradation conventions: [../SERVICES.md](../SERVICES.md).

Postgres-backed durable job queue. **No new infra service** — pg-boss reuses the
app's Postgres (the same `DATABASE_URL`); the only runtime cost is one extra
long-lived process (the worker). Library: `pg-boss` (exact-pinned — it publishes
very frequently; see [../DECISIONS.md](../DECISIONS.md)).

**Two halves, split by process:**
- **Producer (web app):** `enqueue(JOBS.x, payload)` from `@repo/jobs`. This is the
  only surface the app imports; it's a single INSERT into the `pgboss` schema. It's
  **graceful by design** — if `DATABASE_URL` is unset, the DB is down, or the schema
  can't be created, it logs and no-ops, so it NEVER breaks the request that triggered
  it. `enqueue.ts` carries the `server-only` guard, so pg-boss never reaches a client
  bundle.
- **Consumer (worker):** a standalone process — `pnpm --filter @repo/jobs start` (or
  the `worker` Docker service). It owns the `pgboss` schema + maintenance loop and
  runs the `boss.work()` handlers. **Optional:** if it's down, jobs harmlessly queue
  in `pgboss.job` until it's back. Nothing about running the app requires it.

**The example job — `welcome-email`:** `@repo/auth`'s `afterEmailVerification` used to
send the welcome email inline; it now `enqueue(JOBS.welcomeEmail, …)` and the worker's
handler calls `@repo/email`'s `sendWelcomeEmail` out-of-band. The handler completes the
job on success or an unconfigured-email no-op, and **throws on a real provider error so
pg-boss retries** (at-least-once delivery). To add a job: add its name + Zod payload to
`src/queues.ts`, a handler in `src/handlers/`, and register it in `src/worker.ts`.

**The recurring example — `cleanup-expired-verifications`:** the two jobs above are
*event-driven* (the web app `enqueue`s them in response to something). This one is
**scheduled** — the worked example for cron/housekeeping. `worker.ts` calls
`boss.schedule(JOBS.cleanupExpiredVerifications, "0 3 * * *", {}, { tz: "UTC" })` on boot and
its handler deletes Better Auth `verification` rows past their `expiresAt` (dead email-verify /
password-reset tokens that would otherwise accumulate). pg-boss's cron scheduler runs only
because the worker is `supervise:true` (see `boss.ts`), and it **persists the schedule in the
`pgboss.schedule` table** — so re-registering on every boot is an idempotent upsert (keyed by
queue name) and the schedule survives restarts. Inspect it with `boss.getSchedules()` or
`SELECT * FROM pgboss.schedule;`, change it with another `schedule()` call, remove it with
`boss.unschedule(name)`. It's **at-least-once, not exactly-once**: a tick missed while the
worker is down runs late, and the delete is idempotent so a retry is safe. To fire it on demand
(no waiting for 03:00), `send` the queue directly: `boss.send(JOBS.cleanupExpiredVerifications,
{})` — the running worker picks it up.

**Run it / see it work (deterministic, no email needed):**
```bash
docker compose -f docker/docker-compose.yml up -d        # Postgres
pnpm --filter @repo/jobs start                           # worker (one shell)
pnpm --filter @repo/jobs enqueue:demo you@example.com    # enqueue (another shell)
# → the worker stdout logs the welcome-email outcome (a real send if RESEND_* is set,
#   else the "skipped — email not configured" line) — proving it crossed processes.
```

**Schema ownership:** pg-boss creates + migrates its own tables under the `pgboss`
schema — Drizzle does not manage them and there is no conflict; the canonical detail
lives in [../DATABASE.md](../DATABASE.md) → Background-jobs schema.
**Env:** none new — it reuses `DATABASE_URL`
(plus whatever a given job needs, e.g. `RESEND_API_KEY`/`EMAIL_FROM` for the welcome
email). **Deploy:** run the worker as a second process — see [../DEPLOYMENT.md](../DEPLOYMENT.md).

**Liveness (optional):** the worker pings a BetterStack heartbeat on an interval when
`BETTER_STACK_HEARTBEAT_URL` is set (fire-and-forget; no-op + never disturbs jobs when
unset — `packages/jobs/src/heartbeat.ts`), so a crashed worker pages you instead of
silently letting jobs pile up. The heartbeat itself is defined as code in
`@repo/observability` (see [observability-dac.md](observability-dac.md)).

**Failed jobs, retries & where they land.** A handler that **throws** signals failure;
pg-boss retries it per the queue's retry policy. These queues use the **default retry
policy** (`worker.ts` sets only `deadLetter` — see below) — verified against
`pg-boss@12.20.0`:
- `retryLimit: 2` → **3 attempts total** before a job is given up on. This is why the handlers
  throw **only on a real error**: `welcome-email` / `delete-uploads` return (complete) on the
  unconfigured no-op so nothing retries, and throw on a genuine provider failure so pg-boss does.
- `retryDelay: 0`, `retryBackoff: false` → retries fire immediately. For a flaky external call,
  pass `{ retryDelay: 60, retryBackoff: true }` to that queue's `boss.createQueue(...)`.
- `expireInSeconds: 900` → a handler still running after 15 min is killed and counts as a failed
  attempt.

**Lifecycle / where they land:** `created → active → completed` on success; a throw goes to
`retry` (attempts left) then **`failed`** (exhausted) — and, since the DLQ wiring below, an
exhausted job is also **copied to the `failed-jobs` dead-letter queue**. Failed jobs are
**not deleted** — they stay in `pgboss.job` (rolling into `pgboss.archive` after the ~14-day
retention), so a failure is inspectable, never silent:
```sql
-- recent failures (the worker console shows handler errors live; this is the durable record)
SELECT name, state, retry_count, created_on, completed_on, output
FROM pgboss.job WHERE state = 'failed' ORDER BY created_on DESC LIMIT 50;
-- older ones roll into pgboss.archive (same columns)
```
`boss.getJobById(queue, id)` fetches one job's row/state programmatically.

**Dead-letter queue — wired.** pg-boss does
**not** auto-retry a job once it's `failed`, and nothing used to *watch* for exhausted jobs.
Now the worker creates every job queue with `deadLetter: DEAD_LETTER_QUEUE` (`"failed-jobs"`,
exported from `queues.ts` — deliberately NOT in `ALL_QUEUES`, so it can't dead-letter into
itself), and watches the DLQ with `handlers/dead-letter.ts`: every arrival is
`console.error`'d (the always-on sink Docker/BetterStack tail) and, when
**`NEXT_PUBLIC_SENTRY_DSN`** is set, captured to Sentry via `@sentry/node` (the worker reuses
the app's DSN — a DSN is not a secret, and reuse means zero new env surface; unset = exactly
the old behavior). What a dead-lettered job carries: the **original payload in `data`**, the
**final failure in `output`** (the consumer works with `includeMetadata: true`); the source
queue name is *not* copied by pg-boss's dead-letter insert. Two convergence subtleties,
verified against the installed `pg-boss@12.20.0` and live against a pre-existing database:
`createQueue` is create-if-absent (`ON CONFLICT DO NOTHING`), so the worker **also calls
`updateQueue(queue, { deadLetter })`** — that's what stamps the DLQ onto queues that existed
before this wiring. The integration test (`__tests__/integration/dead-letter.test.ts`) proves
the exhausted-job → DLQ round trip on real Postgres. To **reprocess** a dead-lettered job,
`enqueue(JOBS.x, payload)` a fresh job with the payload from the DLQ row. Note the
`boss.on("error", …)` handler and the BetterStack heartbeat cover the **worker process**
(crashes / maintenance failures); the DLQ covers **individual exhausted jobs**.

**Remove it** (drop the package + unhook the producers):
1. Delete `packages/jobs/` and remove the `@repo/jobs` dependency from **both**
   `apps/web/package.json` and `packages/auth/package.json`.
2. Unhook the producers in `packages/auth/src/auth.ts`: the `enqueue(JOBS.welcomeEmail, …)` in
   `afterEmailVerification` (revert to an inline `sendWelcomeEmail`, or drop it) and the
   `enqueue(JOBS.deleteUploads, …)` in the `deleteUser.afterDelete` hook.
3. Remove the CI step `pnpm --filter @repo/jobs test:integration` from `.github/workflows/ci.yml`
   (e2e lane).
4. Remove the `worker` service (+ its heartbeat env) from `docker/docker-compose.prod.yml`.
5. Optionally `DROP SCHEMA pgboss CASCADE` in your database (pg-boss created it). No env vars to
   remove — it reused `DATABASE_URL`.
6. **Trade-off:** the welcome email + upload cleanup become **inline/synchronous** again — simpler,
   but you lose retries and the "never block an auth flow on an external service" decoupling. Keep
   the worker if either matters.
