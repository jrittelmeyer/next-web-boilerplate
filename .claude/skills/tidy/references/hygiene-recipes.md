# Hygiene recipes — caches, processes, platform commands

## Contents
- Platform commands (disk, processes)
- JavaScript / web stacks
- Rust · Go · Python · JVM
- Game engines (Unity, Unreal, Godot)
- Containers

## Platform commands (disk, processes)

- Disk free: `df -h .` (POSIX shells; Git Bash on Windows accepts `df -h /c`).
  PowerShell: `Get-PSDrive C`.
- Tree-kill by PID: POSIX `kill -TERM -<pgid>` or `pkill -P <pid>`; Windows
  `taskkill /PID <pid> /T /F` (Git Bash doubles the slashes:
  `taskkill //PID <pid> //T //F`). Confirm the port released with a probe
  before rebinding.

## JavaScript / web stacks

- **Turborepo** `.turbo/cache` — the classic unbounded grower: each full build
  can add a multi-GB artifact that is never evicted, and package `clean`
  scripts don't touch it; it can reach 100 GB in days. Prune:
  `turbo prune` doesn't do it — cap by deleting oldest entries (the adapter's
  `cache.prune` script) or `rm -rf .turbo/cache` when stale.
- Package-manager stores are *bounded-ish* but grow: `pnpm store prune`,
  `npm cache verify`, `yarn cache clean` — safe, keep-recent operations.
- Framework caches: `.next/cache`, `.vite`, `.parcel-cache`, `node_modules/.cache`
  — safe to delete cold; the next build repays once.

## Rust · Go · Python · JVM

- **Rust** `target/` grows per-profile and per-dependency-version;
  `cargo clean` nukes it; `cargo-sweep`/`cargo cache -a` trim stale artifacts.
  The global `~/.cargo/registry` is shared — trim with `cargo cache` only.
- **Go**: `go clean -cache` (build cache), `go clean -modcache` (module cache —
  re-downloads everything; use only when corrupt or huge).
- **Python**: stale virtualenvs (`.venv` per abandoned branch/worktree), pip
  cache (`pip cache purge`), `__pycache__`/`.pytest_cache`/`.mypy_cache` —
  safe cold deletes.
- **JVM**: Gradle daemon + build cache (`gradle --stop`,
  `~/.gradle/caches/build-cache-*` prune), old wrapper distributions in
  `~/.gradle/wrapper/dists`.

## Game engines (Unity, Unreal, Godot)

- **Unity** `Library/` is the per-project import cache — multi-GB, safely
  regenerated (slow first reopen); `Logs/`, `Temp/`, `obj/` are cold deletes.
  The global GI/Accelerator caches live in Editor preferences (cap them there).
- **Unreal** `Intermediate/`, `Saved/` (autosaves + logs), and the
  **DerivedDataCache** (project + global `%LOCALAPPDATA%/UnrealEngine/Common/DerivedDataCache`)
  are the growers — safe to prune cold; shader/DDC rebuild repays once.
- **Godot** `.godot/` (4.x import cache; 3.x `.import/`) regenerates on open —
  safe cold delete when bloated by churned assets.

## Containers

- Dangling images + build layers: `docker image prune -f` +
  `docker builder prune -f` (BuildKit layer cache). `docker system df` sizes
  it first. **Never prune running/named-keep containers**
  (`hygiene.keepContainers`); volumes only with explicit user OK
  (`docker volume prune` deletes data).
