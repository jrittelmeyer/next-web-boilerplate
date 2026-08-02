# Backlog — Forward (Watch + Tier 4 upgrade paths)

> **Forward-only backlog** (formerly `PHASE_3_IDEAS.md`). Phases 1–5 and every
> locally-buildable Tier-4 row are complete and pushed to main. Shipped-item detail is
> **not** kept here: the compact record is the per-program summary in
> [PROJECT_STATUS.md](PROJECT_STATUS.md) (also the only home of the audit score
> litany), and the full per-item prose is in
> [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md). The audits that seeded past
> backlogs live in [docs/archive/](archive/) (Phase B + the twelve `/project-audit`
> scoring passes). Everything below goes plan → sign-off → build. Don't reintroduce
> shipped-item entries here.

## Watch (no action now)

Full detail + removal conditions: [docs/MAINTENANCE.md](MAINTENANCE.md) (canonical).

- **TypeScript 7 cutover** — GA'd (`typescript@7.0.2`) but ships no JS Compiler API. **The Next-side gate LIFTED 2026-08-02** — `experimental.useTypeScriptCli` is in stable `next@16.2.12` (opt-in, and it type-checks co-located tests too). Now blocked on one named in-tree dep, `react-docgen-typescript` via Storybook, which gates the *visual* lane only. Next step is a cutover **trial**, not a wait.
- **Calendar Phase 6 — sharing & interop** — the calendar's next program. Not started, and until 2026-08-02 not tracked anywhere despite ~30 in-code and in-doc "Phase 6" commitments; see the B2 row below.
- **Maintenance-only (Tier 3 G)** — the standing state since 2026-07-17 (verified 100.0/100). **Renovate's scheduled-lane PR-delivery proof FAILED** — the 2026-07-27 window passed with zero `renovate/*` branches ever; diagnosing the Mend side is now an open job (owner's call).
- **e2e signup flake** — intermittent, absorbed by retries, not a code bug; harden only if it ever turns a lane red.
- **Temporary security overrides** — seven pnpm `overrides:` (2026-07-15 · 07-22 · 07-27 batches; `fast-uri: 3.1.4` graduated from a deferral to a real override on 07-27) + the `brace-expansion` `GHSA-mh99-v99m-4gvg` ignore (raise to 5.0.8 and drop it ≥ 2026-07-30) + `better-auth`/`@better-auth/passkey` → 1.6.25 (≥ 2026-07-30). The `next`/`@next/*` age-exclude was removed on schedule 2026-07-28 (16.2.12 becomes admissible 2026-08-01).
- **`contrarian` subagent — evaluated 2026-07-28, kept** — it cleared its acceptance bar twice (incl. catching its own `Bash` grant contradicting a "read-only" description). Kill criterion committed: three consecutive merged ALWAYS-path PRs with no `## Contrarian disposition` PR-body section ⇒ the policy is dead. Registration is **surface-dependent** (a reload does not fix it) — fallback recipe: [CONVENTIONS.md → Agent tooling](context/CONVENTIONS.md#agent-tooling-claude).
- **`main` has no branch protection** — `gh api …/branches/main/protection` → 404, so no status check is actually required. Every merge-ordering discipline is self-imposed. Owner decision, not a build row.
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
> ([archive/PROJECT_AUDIT_2026-07-22.md](archive/PROJECT_AUDIT_2026-07-22.md)). The
> twelfth pass (2026-07-29) verified F2–F4 closed and scored **99.9** — F1 (Renovate
> delivery) is the sole open deduction; its diagnosis row is in Open rows
> ([archive/PROJECT_AUDIT_2026-07-29.md](archive/PROJECT_AUDIT_2026-07-29.md)).

### Open rows

| Band | Area | Upgrade | Documented in | Notes |
| --- | --- | --- | --- | --- |
| B4 | Toolchain | **TypeScript 7 cutover** (outside the program) | STACK.md | **Next-side gate LIFTED 2026-08-02** — `experimental.useTypeScriptCli` shipped in stable `next@16.2.12` (verified in the installed artifact). Remaining blocker is **one named in-tree dep**, `react-docgen-typescript@2.4.0` via `@storybook/react-vite`, gating the **visual-regression lane only** — not `next build`. Two costs to plan around: the flag is opt-in (no auto-detect) and it type-checks the whole tsconfig project **including co-located tests**. **Re-gate on a cutover trial, not a dependency count.** Full detail + the enumeration's method-limit in Watch above. Costs no audit points. |
| B2 | Calendar | **Phase 6 — sharing & interop** — calendar sharing + org calendars, ICS feed/import, per-occurrence RSVP, guest permissions, inbound iTIP `REPLY` ingestion, `VTIMEZONE` synthesis, and invitations appearing on the invitee's month grid | [context/calendar/](context/calendar/model.md) · master plan (local) | Phases 0–5 shipped 2026-07-30 → 08-02. **Filed 2026-08-02 by the doc audit**: ~30 "Phase 6" commitments exist across `docs/context/calendar/*`, `DECISIONS.md`, `packages/db/src/schema/*`, `packages/validators`, and the tRPC calendar router, and **none of them had a tracked home** — an agent reading this forward-only backlog concluded the calendar was finished. `MAINTENANCE.md`'s cascade-moved-override Watch item even sets its *removal condition* on Phase 6 landing. Inherits Phase 5's three recorded debts (end-anchored reminders, guest reminders, reader-zone email rendering) — see the Watch entries. ⚠️ Read **`ACL`** first: `calendar.range`'s owner-scoped `WHERE` must move behind `getCalendarRole` in the same change as any share resolver, or shared calendars authorize on the write path and **silently return nothing** on the read path. Plan → sign-off before build. |
| B1 | Tooling / deps | **Restore Renovate PR delivery** — owner half: diagnose at developer.mend.io (org mode Silent vs Interactive, per-repo run logs); fallback half, agent-buildable if Mend won't cooperate: self-hosted Renovate via `renovatebot/github-action` on a weekly cron reusing the committed `.github/renovate.json` (removes the app dependency entirely) | [MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) · [audit report](archive/PROJECT_AUDIT_2026-07-29.md) | Config exonerated — the widening shipped 2026-07-22 as specified and the 07-27 window still delivered zero `renovate/*` branches, ever. The stall is growing (48 dashboard entries · 50 outdated) and override retirements (dompurify, fast-uri) queue behind it. Recovers the audit's last open deduction (Monorepo & tooling +2). Plan → sign-off before the fallback build. |
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
