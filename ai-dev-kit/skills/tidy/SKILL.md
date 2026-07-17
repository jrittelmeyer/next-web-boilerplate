---
name: tidy
description: Local dev-machine hygiene — prune the project's unbounded build cache to its size cap, report disk + cache size, then surface (not auto-run) the judgment-required cleanups (orphaned dev servers, stale e2e test users, dangling Docker images). Use at a checkpoint boundary, when disk is low, or when the build cache "is huge" / "clean up the machine".
---

# tidy

Reclaim local disk and keep the working machine healthy. The classic unbounded grower
is a local build cache with no native TTL or size cap (e.g. Turborepo's
`.turbo/cache`: each full build can add a multi-GB artifact that is never evicted,
and package `clean` scripts don't touch it — it can reach 100 GB in days). So this
skill's core job is pruning that cache; the rest it *surfaces* rather than runs,
because those need judgment.

Project parameters come from the adapter config `.claude/ai-dev-kit.config.json`
(`cache`, `hygiene`); where a field is absent, ask or skip that section.

## 1. Prune the build cache (safe, automatic)

- Report first: run the adapter's `cache.size` command.
- Prune to the cap: run `cache.prune` (typically deletes oldest entries until under a
  ceiling while keeping enough recent builds for cache-hits; prefer a `--dry-run`
  preview when the command offers one).
- Report reclaimed space and current disk free (`df -h /c` from Git Bash on a
  Windows box).

This same prune often runs automatically at two points (so it rarely has much to do
here): the **/checkpoint** cadence during active build sessions, and a git pre-push
backstop. This skill is the on-demand / deeper pass.

## 2. Surface the judgment-required cleanups (do NOT auto-run)

Report each with its reclaim potential and the exact command, then let the user pick:

- **Orphaned dev servers** on the adapter's `hygiene.devPorts` — a stopped background
  task can leave the framework's dev/prod server (or a bare `node`) holding the port.
  Tree-kill by PID (Windows Git Bash: `taskkill //PID <pid> //T //F`); **keep Docker
  and the browser**.
- **Stale e2e users** — signup specs accumulate throwaway rows matching the adapter's
  `hygiene.e2eUserPattern` in the shared local DB; enough rows will break
  pagination-dependent tests. A mass DELETE **always needs explicit user OK**; keep
  every real account that doesn't match the pattern.
- **Dangling Docker images / build cache** — CI image work leaves large layers.
  `docker image prune -f` + `docker builder prune -f` reclaim them; **keep the
  running containers** named in `hygiene.keepContainers`.

## 3. Report

One short summary: disk free before → after, cache size before → after, and which
surfaced items (if any) the user chose to run. Don't silently perform step-2 actions.
