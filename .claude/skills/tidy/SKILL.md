---
name: tidy
description: Local dev-machine hygiene for this repo — prune the unbounded Turbo cache to its size cap, report disk + cache size, then surface (not auto-run) the judgment-required cleanups (orphaned :3000/:3100 dev servers, stale @example.com e2e users, dangling Docker images). Use at a checkpoint boundary, when disk is low, or when ".turbo is huge" / "clean up the machine".
---

# tidy

Reclaim local disk and keep the working machine healthy. The one thing here that
grows without bound is the **Turbo cache** — it has no native TTL or size cap, and
each `web:build` writes a ~3.5 GB `.next` artifact that is never evicted (it reached
100 GB in three days). `pnpm clean` does NOT touch it (that runs each package's
`clean` task, never the root `.turbo/cache`). So this skill's core job is pruning
that cache; the rest it *surfaces* rather than runs, because those need judgment.

## 1. Prune the Turbo cache (safe, automatic)

- Report first: `pnpm cache:size` (prints `.turbo/cache` total + entry count).
- Prune to the cap: `pnpm cache:prune` (deletes oldest entries until under the
  ceiling — default 20 GB, keeps ~5 recent builds so cache-hits still work; override
  with `--max-gb <n>` or `TURBO_CACHE_MAX_GB`). Use `--dry-run` to preview.
- Report reclaimed space and current disk free (`df -h /c` on a Windows box).

This same prune runs automatically at two points (so it rarely has much to do here):
the **/checkpoint** cadence during active build sessions, and a **husky pre-push**
backstop. This skill is the on-demand / deeper pass.

## 2. Surface the judgment-required cleanups (do NOT auto-run)

Report each with its reclaim potential and the exact command, then let the user pick:

- **Orphaned dev servers** on ports 3000 / 3100 — a stopped background task can leave
  `next`/`node` holding the port. Tree-kill by PID (`taskkill //PID <pid> //T //F`),
  **keep Docker and Chrome**.
- **Stale e2e users** — signup e2e specs accumulate throwaway `@example.com` rows in
  the shared local DB; past ~500 rows `admin-pagination.spec.ts` fails locally. Cleanup:
  `DELETE FROM "user" WHERE email LIKE '%@example.com'` via
  `docker exec -i nwb-postgres psql -U postgres -d appdb`. **Needs explicit user
  OK** — a mass DELETE always does. Keep any real (non-`@example.com`) accounts.
- **Dangling Docker images / build cache** — the `docker-image` CI work leaves large
  layers. `docker image prune -f` + `docker builder prune -f` reclaim them; keep the
  running `nwb-postgres` / `nwb-meilisearch` containers.

## 3. Report

One short summary: disk free before → after, cache size before → after, and which
surfaced items (if any) the user chose to run. Don't silently perform step-2 actions.
