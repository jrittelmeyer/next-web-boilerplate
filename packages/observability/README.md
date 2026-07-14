# @repo/observability — dashboards-as-code

Checked-in **BetterStack** monitoring/alerting config + a graceful sync helper. This
is the versioned answer to "what alerts should exist?" — declarative definitions you
can `git diff`, review, extend, or delete.

**Dev/CI-only.** Nothing here is imported by the app — it adds zero app/bundle/CSP
surface. Composes with the existing observability stack (logs already ship to
BetterStack via `@logtail/next`); no new vendor.

## What's defined ([`src/config.ts`](src/config.ts))

| Resource | Watches | Alerts when |
| --- | --- | --- |
| `app-health` **monitor** | `${SITE_URL ?? BETTER_AUTH_URL}/api/health` | the probe isn't `200` (the route returns `503` when the DB is unreachable) |
| `jobs-worker` **heartbeat** | the pg-boss worker (D7) | the worker stops pinging (it otherwise dies silently — jobs just queue) |

Edit the typed declarations in `config.ts`; [`src/schema.ts`](src/schema.ts) (Zod)
validates them and maps to BetterStack's API attributes.

## Commands

```bash
# Validate config — no credentials needed (runs in CI's verify lane)
pnpm --filter @repo/observability check

# Push config to BetterStack — idempotent upsert by name (PATCH if present else POST)
pnpm --filter @repo/observability sync
```

## Env (both optional, script/worker-only — never in the app's `env.ts`)

- `BETTER_STACK_API_TOKEN` — used by `sync` only. Unset → `sync` logs and **no-ops**
  (a clone/CI never needs it). Create a BetterStack Uptime API token (Settings → API).
- `BETTER_STACK_HEARTBEAT_URL` — used by the **worker** only
  ([`packages/jobs/src/worker.ts`](../jobs/src/worker.ts)). Copy it from the
  `jobs-worker` heartbeat BetterStack returns after the first `sync`; unset → the
  worker doesn't ping (no-op, no error).

## To remove (clone → don't want it)

Trivially deletable — it stands alone:

1. delete this directory (`packages/observability/`),
2. remove the heartbeat block from `packages/jobs/src/worker.ts`,
3. drop the two env vars from `.env`/docs,
4. remove the `@repo/observability check` step from `.github/workflows/ci.yml`.
