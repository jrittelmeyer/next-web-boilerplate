---
name: tidy
description: Local dev-machine hygiene — prune the project's unbounded build/engine cache to its size cap, report disk + cache size, then surface (not auto-run) the judgment-required cleanups (orphaned dev processes, stale test data, dangling container images). Use at a checkpoint boundary, when disk is low, or when the build cache "is huge" / "clean up the machine".
---

# tidy

Reclaim local disk and keep the working machine healthy. Most stacks have at
least one **unbounded grower** — a build or engine cache with no native TTL or
size cap that quietly accumulates gigabytes. This skill's core job is pruning
that cache; the rest it *surfaces* rather than runs, because those need
judgment.

Adapter: `.claude/ai-dev-kit.config.json` (`cache`, `hygiene`); a missing
field → ask or skip that section. Per-stack cache locations, growth patterns,
and platform commands: [references/hygiene-recipes.md](references/hygiene-recipes.md).

## 1. Prune the build cache (safe, automatic)

- Report first: run the adapter's `cache.size` command.
- Prune to the cap: run `cache.prune` (typically deletes oldest entries until
  under a ceiling while keeping recent builds for cache hits; prefer a
  `--dry-run` preview when the command offers one).
- Report reclaimed space and current disk free (platform commands in the
  recipes file).

This same prune often runs automatically at two points (so it rarely has much
to do here): the **checkpoint** cadence during active build sessions, and any
pre-push backstop the repo wires. This skill is the on-demand / deeper pass.

## 2. Surface the judgment-required cleanups (do NOT auto-run)

Report each with its reclaim potential and the exact command, then let the
user pick:

- **Orphaned dev processes** on the adapter's `hygiene.devPorts` (or the
  stack's equivalent: dev servers, watchers, emulators, editor daemons) — a
  stopped background task can leave a process holding a port or lock.
  Tree-kill by PID; **keep containers and the browser**.
- **Stale test data** matching the adapter's `hygiene.e2eUserPattern` (or the
  project's seeded-data convention) — accumulated throwaway rows eventually
  break pagination- and count-dependent tests. A mass DELETE **always needs
  explicit user OK**; keep everything that doesn't match the pattern.
- **Dangling container images / build layers** — CI image work leaves large
  layers; prune commands are in the recipes file. **Keep the running
  containers** named in `hygiene.keepContainers`.
- **Stack-specific growers** the recipes file lists for this project type
  (engine import caches, dependency caches, old toolchain versions) — surface
  only what the repo actually uses.

## 3. Report

One short summary: disk free before → after, cache size before → after, and
which surfaced items (if any) the user chose to run. Don't silently perform
step-2 actions.
