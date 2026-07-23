# Dashboards-as-code (`@repo/observability`) — BetterStack

> When to load: working on BetterStack monitors/heartbeats as code (`@repo/observability`) — the canonical dashboards-as-code doc. Shared degradation conventions: [../SERVICES.md](../SERVICES.md).

The monitoring/alerting config that watches every service integration — checked into the
repo as code instead of living only in a vendor UI. Target is **BetterStack** (it already
carries this repo's logs via `@logtail/next`); its Uptime API gives HTTP *monitors* +
*heartbeats*. **Dev/CI-only — never imported by the app**, so zero build/bundle/CSP cost.

**What's defined** (`packages/observability/src/config.ts`, typed + Zod-validated by
`schema.ts`):
- **`app-health` monitor** — HTTP check on `${SITE_URL ?? BETTER_AUTH_URL}/api/health`
  expecting `200`; the probe returns `503` when the DB is unreachable (see the health
  route), so "alert on not-200" is exactly right.
- **`jobs-worker` heartbeat** — the pg-boss worker pings it on an interval; BetterStack
  alerts if the pings stop (a dead worker otherwise just silently queues jobs). See
  [jobs.md](jobs.md) → Liveness.

**Apply it** (graceful — mirrors `enqueue()` / `getStripe()`):
```bash
pnpm --filter @repo/observability check   # Zod-validate config — no creds (runs in CI)
pnpm --filter @repo/observability sync    # upsert to BetterStack — needs BETTER_STACK_API_TOKEN
```
`sync` is an idempotent upsert (match by name → PATCH else POST), so re-running converges
rather than duplicating. With the token unset it logs and no-ops, so a clone/CI never needs
credentials; a real API error throws (non-zero exit) — a manual sync should fail loudly.

**Why a script, not Terraform:** it stays in the existing pnpm/tsx toolchain (no new
binary or state model), degrades gracefully when unconfigured, and is Windows-safe (see
[../DECISIONS.md](../DECISIONS.md)). Config is typed TS (not YAML), so there's **no parser
dependency**. Trivially deletable — `packages/observability/README.md` lists the four steps.

**Key env vars** (both **optional**, script/worker-only — never in the app's `env.ts`):
- `BETTER_STACK_API_TOKEN` — read by `sync` only (a BetterStack Uptime API token).
- `BETTER_STACK_HEARTBEAT_URL` — read by the **worker** only; copy it from the
  `jobs-worker` heartbeat BetterStack returns after the first `sync`. Unset → no ping.

**Remove it:** trivially deletable — `packages/observability/README.md` lists the four steps
(delete `packages/observability/`, remove the heartbeat block from `packages/jobs/src/worker.ts`,
drop the two env vars, remove the `pnpm --filter @repo/observability check` step from
`.github/workflows/ci.yml`). Nothing in the app imports it, so there's zero app/bundle/CSP cost to
carrying it and zero risk to removing it. (This removes only the dashboards-as-code; the app's
`@logtail/next` log shipping is [betterstack.md](betterstack.md).)
