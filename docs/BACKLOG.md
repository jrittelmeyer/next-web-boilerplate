# Backlog — Forward (Watch + Tier 4 upgrade paths)

> **Forward-only backlog** (formerly `PHASE_3_IDEAS.md`). Phases 1–5 and every
> locally-buildable Tier-4 row are complete and pushed to main. Shipped-item detail is
> **not** kept here: the compact record is the per-program summary in
> [PROJECT_STATUS.md](PROJECT_STATUS.md) (also the only home of the audit score
> litany), and the full per-item prose is in
> [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md). The audits that seeded past
> backlogs live in [docs/archive/](archive/) (Phase B + the eleven `/project-audit`
> scoring passes). Everything below goes plan → sign-off → build. Don't reintroduce
> shipped-item entries here.

## Watch (no action now)

Full detail + removal conditions: [docs/MAINTENANCE.md](MAINTENANCE.md) (canonical).

- **TypeScript 7 cutover** — GA'd (`typescript@7.0.2`) but ships no JS Compiler API; blocked until TS7 support reaches a **stable** Next release (`useTypeScriptCli` — experimental in canary since 2026-07-10; TS 7.1 ~Q4 2026).
- **Maintenance-only (Tier 3 G)** — the standing state since 2026-07-17 (verified 100.0/100); Renovate scheduled-lane PR-delivery proof due at the next Monday window (2026-07-27).
- **e2e signup flake** — intermittent, absorbed by retries, not a code bug; harden only if it ever turns a lane red.
- **Temporary security overrides** — six pnpm `overrides:` (2026-07-15 + 2026-07-22 batches) + the `fast-uri` `ignoreGhsas` pair (ages out ~2026-07-26) + the `next`/`@next/*` age-exclude (remove 2026-07-28).
- **Ship a real derived product end-to-end** — owner-driven, in flight (via `/project-init`); unlocks the gated B1 intake-drop row and feeds the on-ramp rows with real lessons.

## Tier 4 — Future upgrade paths (documented, unscheduled)

> Each open row is a real direction, **opt-in / on real need** (the starter is
> feature-complete without them), and goes plan → sign-off → build. Shipped rows keep one
> strikethrough line in the table at the bottom — the record is the PROJECT_STATUS
> summary + the doc in "See"; don't re-expand them here.
>
> **The path-to-100 program** (2026-07-15, owner-directed) — 11 rows recovering the 13
> audit points locked behind won't-fix/deferred classifications (per-row re-analysis in
> [archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md)) — **shipped all
> 11 build rows 2026-07-16 → 17** (rows archived →
> [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md)), closed the last remainder
> (**#4b**, the one-time live Uploadthing tunnel proof, 2026-07-17), and was **VERIFIED
> at 100.0/100 by the 2026-07-17 scoring pass**
> ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md)). The
> **TypeScript 7 cutover** stays outside the program (externally gated, costs no
> points; see Watch). The 2026-07-22 pass scored **99.65** — the first drop since,
> and none of it code — and all four of its rows shipped same-day (rows archived
> likewise); the audit ledger is clear again
> ([archive/PROJECT_AUDIT_2026-07-22.md](archive/PROJECT_AUDIT_2026-07-22.md)).

### Open rows

| Band | Area | Upgrade | Documented in | Notes |
| --- | --- | --- | --- | --- |
| B4 | Toolchain | **TypeScript 7 cutover** (outside the program) | STACK.md | **Blocked on TS7 support reaching a stable Next release** (experimental in canary since 2026-07-10; TS 7.1 ~Q4 2026 restores the JS API for the rest of the toolchain) — full detail in Watch above. Costs no audit points. |
| B1 | On-ramp / kit | **Intake-drop convention for `/project-init`** — template half: seed a committed `docs/intake/` (README: drop planning docs here → run `/project-init`) + a GETTING_STARTED sentence + init-app kept-list mention; kit half: `init.intakeDir` adapter field (default `docs/intake/`), intake enumeration in project-init §1, raw docs → `docs/archive/product-intake/` in the inception commit after brief sign-off (prevents a second source of truth beside `PRODUCT.md`) | [GETTING_STARTED.md](GETTING_STARTED.md#starting-from-an-idea-run-project-init) | Direction owner-approved 2026-07-18; **build after the first real derived-project inception run (in flight) supplies lessons.** Kit half edits an ai-dev-kit clone → re-install (`--dest`), never the installed copies. Verified: init-app `--slim`'s delete list doesn't touch `docs/intake/`. Sibling convention shipped 2026-07-19: `intake/source/` (gitignored **code** drop for `/project-adopt`) stays separate — committed planning docs vs never-committed source. Plan → sign-off before building. |
| B3 | Docs / positioning | **README / tagline reframe around the agent-native workflow** (OWNER-DIRECTED) — lead with the real differentiator: the context-doc system + working agreements + verification culture + ai-dev-kit's two inception doors, not the wiring | README.md · AGENTS.md | Dozens of starters have the wiring; nothing else has the operating system around it, and today it's buried in AGENTS.md / the docs. This is framing/marketing judgment — needs an owner decision, not a mechanical build. Pairs with the visual surface + the derived-product proof. |
| B1 | Kit | **Second ai-dev-kit adapter (portability proof)** — author an adapter for a different stack to exercise the kit's stack-agnostic claim end-to-end | ai-dev-kit repo (`adapters/`) · [CLAUDE.md](../CLAUDE.md) | **Recommend waiting for a real second-stack project to pull it** — an adapter with no consuming repo is unverifiable. On real need. |

### Shipped (strikethrough record)

Shipped record: [PROJECT_STATUS.md](PROJECT_STATUS.md) summary · full rows:
[archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md#backlog-shipped-row-archive-moved-2026-07-23)
(archived 2026-07-23). Future shipped rows keep **one strikethrough line** here —
don't re-expand them — until the next archive sweep.

| Band | Upgrade | Shipped | See |
| --- | --- | --- | --- |
