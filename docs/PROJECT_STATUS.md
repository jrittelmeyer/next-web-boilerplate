# Project Status & Handoff

> **Read first when resuming.** The lean "where we are / what's next" layer. Deeper
> material lives elsewhere so it isn't paid for on every resume:
>
> - Per-step rationale + verification → [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md)
>   (full Steps 1–29, Phase 3 C1–D11 + M1–M7, the audit-backlog P0–P3 detail, the
>   Phase-4 + Tier-4 upgrade-path prose, **and the archived build-progress rows**)
> - Cross-cutting decision log → [context/DECISIONS.md](context/DECISIONS.md) ·
>   Working agreements → [../AGENTS.md](../AGENTS.md) ·
>   Backlog → [BACKLOG.md](BACKLOG.md)
>
> **New shipped work: one ≤250-char row in the summary here; full prose goes to
> docs/archive/PHASE_HISTORY.md in the same commit. Never re-expand rows — this is
> the seventh compaction; the append-log must not regrow.**
>
> The cap is **prospective — it binds new rows only, and never licenses rewriting a
> historical one.** Raised 200 → 250 on 2026-08-02: 200 was set before a one-row
> phase summary had to carry a migration number, a decision and its falsifier, and
> every row actually written under it needed a trim that cost real detail. 250 is the
> observed honest cost of one such row; anything longer is prose that belongs in the
> archive.

_Last updated: 2026-08-02 (a recurring multi-day occurrence no longer vanishes from a month it overlaps)._

## Where we are

- **PUBLIC — launched 2026-07-14.** This repo is now a public GitHub template at
  [github.com/jrittelmeyer/next-web-boilerplate](https://github.com/jrittelmeyer/next-web-boilerplate),
  published as a fresh single-commit history (the full pre-launch history is archived
  privately). Post-publish hardening is on: secret scanning + push protection,
  CodeQL, vulnerability alerts, and a `main` ruleset that blocks force-pushes and
  branch deletion. Donation link live 2026-07-15: `.github/FUNDING.yml` + README
  point at the owner's PayPal.Me.
- **Phases 1–2 complete & verified** — full-stack breadth (Steps 1–16) hardened to the
  100/100 production bar (Steps 17–29); the read-only Phase B audit found **no must-fix
  correctness bugs** ([archive/PHASE_B_AUDIT.md](archive/PHASE_B_AUDIT.md)).
- **Phase 3 (feature depth) + the 100/100 audit backlog complete & on `main`** — Tier 0 ·
  C1–C4 · D1–D11 · M1–M7 · P0–P3 (one compact row per group below; full prose →
  [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md)).
- **Phase 4 (live SaaS) COMPLETE 2026-07-05 → 07** and **Stripe (Phase 5, test mode)
  COMPLETE 2026-07-13** — every integration in the starter is proven live against real
  creds; the per-section provenance banners in [VERIFICATION.md](VERIFICATION.md) are the
  record.
- **Every locally-buildable Tier-4 row SHIPPED (2026-07-07 → 13)**, incl. A23–A32 + A13.
  Twelve `/project-audit` passes: **93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 →
  100.0 → 100.0 → 99.65 → 99.65 → 99.9/100** — detail: `docs/archive/PROJECT_AUDIT_*.md`
  (latest: [PROJECT_AUDIT_2026-07-29.md](archive/PROJECT_AUDIT_2026-07-29.md); the
  07-22 findings F2–F4 verified closed; F1 — Renovate delivery, Mend-side — is the
  one open deduction, now a B1 diagnosis row in [BACKLOG.md](BACKLOG.md)).
- **Real host deploy PROVEN live on Fly.io 2026-07-13** and **production email domain +
  deliverability VERIFIED 2026-07-14** (hop-2 email-change delivery gap closed) —
  "Deploy / live-verify closes" summary row below.
- **CI is green** (`verify` · `audit` · `e2e` · `docker-image` · `visual` — the visual
  lane is live since A28). **CodeQL is live** — `ENABLE_CODEQL` is set on the public
  repo (code scanning is free once public); the variable gate stays so private forks
  don't go false-red ([context/DEPLOYMENT.md](context/DEPLOYMENT.md)).
- **The path-to-100 program (owner decision, 2026-07-15) is BUILD-COMPLETE and VERIFIED
  at 100.0/100** by the eighth audit pass — all 11 rows plus the #4b live Uploadthing
  tunnel proof, closed 2026-07-17. The 13 points behind the 99.35 plateau were all
  won't-fix/deferred classifications, re-litigated and all recoverable
  ([per-row analysis](archive/PATH_TO_100_2026-07-15.md) ·
  [the verifying pass](archive/PROJECT_AUDIT_2026-07-17.md)). **Maintenance-only is the
  standing state again** — 100 is a state to maintain, and later passes re-run the
  currency checks. The TS7 cutover stays outside it — its Next-side gate lifted
  2026-08-02 (`useTypeScriptCli` in stable `next@16.2.12`), but **TS 7 ships no
  `tsserver`**, so it was **re-gated the same day on TS 7.1** rather than on the
  cutover trial that gate had called for — a trial runs no editor, so it could never
  have licensed the change
  ([MAINTENANCE.md → Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)).
- **ai-dev-kit:** the repo's agentic-dev techniques are a portable skill library — the
  standalone [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit) (kit 0.7.1,
  the 2026-07-23 context-engineering release); this repo consumes the installed
  `.claude/` output (edit a clone, re-install — never the copies). Kit story: the kit
  repo's CHANGELOG + [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md).

## Build progress

All steps ✅ done and verified. The Steps 1–29 map stays below; every later program is
one summary row — the **full verbatim rows** (with their per-row "See" deep links) and
the exact verification each performed live in
[archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md), incl. the
[build-progress rows archived 2026-07-23, 7th compaction](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction).
Don't re-expand rows here — see the header protocol.

| Steps | Area |
| --- | --- |
| 1–2 | Scaffold (Turborepo/pnpm/tooling) · `apps/web` (Next 16, App Router, Tailwind v4, env) |
| 3–5 | `@repo/db` (Drizzle + Postgres) · Auth (Better Auth) · tRPC + Server Actions |
| 6–8 | UI (shadcn in `@repo/ui`) · Forms (RHF + Zod) · State (Zustand + TanStack Query) |
| 9–12 | Email (Resend) · Payments (Stripe) · Uploads (Uploadthing) · Search (Meilisearch) |
| 13–16 | Observability (Sentry/BetterStack/PostHog) · Testing (Vitest+Playwright+CI) · Docker · Docs |
| 17–20 | App Router resilience · Security headers + CSP · Auth hardening · App-level rate limiting |
| 21–24 | RBAC · Health endpoint + request telemetry · SEO/PWA scaffolding · Dark mode |
| 25–29 | Git hooks · Dependency/security automation · Community/editor files · Example entity (`posts`) · Testing depth |
| post-29 | CI fix: `test:e2e` turbo `passThroughEnv` (E2E lane green) · CodeQL gated opt-in |

Per-program summary (Rows = archived row count; full rows →
[the archived build-progress table](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction)):

| Program | Rows | Outcome | Full record |
| --- | --- | --- | --- |
| Phase 3 — feature depth (T0 · C1–C4 · D1–D11) | 2 | tests/CI/persistence hardening + 11 depth rows (posts pipeline → dashboards-as-code) | [Phase 3](archive/PHASE_HISTORY.md#phase-3--feature-depth-post-step-29) |
| Audit — M1–M7 + Tier 2 | 1 | audit fixes: OAuth UI · real `/account` · CSP-nonce recipe · two-hop email change + revoke-sessions | [archived rows](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction) |
| Audit backlog — P0–P3 | 4 | every P0–P3 row closed (open-redirect fix, DB indexes, sessions/deletion/uploads depth, a11y + e2e) — COMPLETE | [Audit backlog](archive/PHASE_HISTORY.md#audit-backlog--100100-pass-p0p3-2026-07-02--05--archived-record) |
| Phase 4 — live SaaS | 1 | every integration verified live 2026-07-05 → 07; provenance banners in [VERIFICATION.md](VERIFICATION.md) | [Tier 4 record](archive/PHASE_HISTORY.md#tier-4--upgrade-paths-phase-4--band-12-2026-07-05--08--archived-record) |
| Tier 4 — Bands 1–4 + A-rows | 37 | 2FA · passkeys · orgs · admin plugin · i18n · SSE · CAPTCHA · audit log · backup/DR · visual/perf/SBOM lanes · rate-limit storage · A1–A32 | [Tier 4](archive/PHASE_HISTORY.md#tier-4--upgrade-paths-phase-4--band-12-2026-07-05--08--archived-record) · [final rows](archive/PHASE_HISTORY.md#final-tier-4-rows--deploy--live-verify-closes-2026-07-12--14--archived-record) |
| Deploy / live-verify closes | 3 | Fly.io deploy proven live 07-13 · Stripe Phase-5 test-mode verify 07-13 · prod email domain + deliverability 07-14 | [final rows](archive/PHASE_HISTORY.md#final-tier-4-rows--deploy--live-verify-closes-2026-07-12--14--archived-record) |
| Launch — public template | 1 | PUBLISHED 2026-07-14: fresh single-commit history, hardening on, fresh-consumer proof; donation link 07-15 | [archived rows](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction) |
| Path-to-100 — #1–#11 | 11 | all 13 deferred audit points recovered; **VERIFIED 100.0/100** 2026-07-17 | [Path-to-100](archive/PHASE_HISTORY.md#path-to-100-program-2026-07-16--17--archived-per-row-record) |
| Maintenance — 2026-07-15 → 23 | 18 | advisory batches #1–#3 (incl. `next` 16.2.11) · security-triage pipeline · Renovate majors + schedule fix · kit programs/extraction · CI heartbeat · Pages Storybook · tagged releases · screenshot tour · image-opt e2e · init-app slim/tidy | [archived rows](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction) · [ai-dev-kit](archive/PHASE_HISTORY.md#ai-dev-kit-program-2026-07-17--18--archived-record) |
| Maintenance — 2026-07-27 | 2 | advisory batch #4 ([#12](https://github.com/jrittelmeyer/next-web-boilerplate/pull/12), closed [#10](https://github.com/jrittelmeyer/next-web-boilerplate/issues/10)): `better-auth` 1.6.23 (GHSA-qq9h-g4jm-xgf3 account takeover — **live-exposed on the default config**, verified by driving the attack) + migration 0018 for the 2FA-lockout columns 1.6.23 requires · postcss key retargeted · fast-uri override · brace-expansion deferred · **ci.yml audit gate now fails closed on an advisory-endpoint outage** (a 07-26 false green had hidden all three for a day). `contrarian` review subagent + policy + sign-off nudge ([#11](https://github.com/jrittelmeyer/next-web-boilerplate/pull/11)) — see Watch: shipped unevaluated | [MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Calendar — Phases 0–3 | 5 | `@repo/calendar` time core + `user_preferences` (0019) · calendars/events (0020) with a stored-offset derived-instant CHECK, split read surface, `/calendar` month grid, ACL, docs · **recurrence (0021)**: `RRULE` engine at 100/100/100/100 against a frozen 528-rule `rrule` oracle, per-occurrence overrides behind a composite self-FK, a 131×-faster PARTIAL suppression index, the three edit scopes, and a locale-safe recurrence builder · **3A typed notifications (0022)**: the union extended in `@repo/db` + `@repo/validators` in ONE commit (the bus's `safeParse` fails closed and silent otherwise) behind a parity test, a two-slot `body`/`title` contract rendered on both feed paths, a same-origin `link` CHECK spelled with `left()` — `NOT LIKE '/\%'` accepts `/\evil.com` — and one persist-then-publish path · **3B attendees + RSVP (0023)**: email-as-identity with a `lower()` CHECK and a measured PARTIAL `user_id` index, overrides *inherit* attendees, `getEventAccess` as a second authority that exposes no role and no `canWriteEvent`, series-level `respondToEvent` authorized by the attendee row, and invitations claimed by **verified** email with `user_id` stamped on the first claim | [context/calendar/](context/calendar/model.md) · [recurrence](context/calendar/recurrence.md) · [attendees](context/calendar/attendees.md) |
| Calendar — Phase 4 | 1 | **Emailed invitations, `.ics` and external RSVP.** `METHOD:PUBLISH` with **no `ATTENDEE`** (owner call 2026-08-01; also RFC 5546 §3.2.1's MUST NOT) — Gmail's native Yes/No/Maybe emit a `METHOD:REPLY` nothing here reads, so the token link is the only path · serializer in `@repo/calendar` at 100/100/100/100 (75-**octet** folding over code points, `RECURRENCE-ID` siblings + `EXDATE`s for deleted overrides, bare `TZID` with the non-conformance stated, `DTSTAMP` a parameter) · a **stateless HMAC token with no `.`** — `proxy.ts` excludes dotted paths, so a separator would have 404'd every invitation — exchanged for an httpOnly cookie so it never reaches PostHog/Sentry/`Referer`/history · **`reask_at` (0024)**: re-asking is a derived `responded_at < reask_at`, so a guest's answer and comment survive a reschedule · a three-boolean change classifier (bump / resend / re-ask) wired through **all six** writers · one self-contained pg-boss job per recipient | [context/calendar/invitations.md](context/calendar/invitations.md) |
| Calendar — Phase 5 | 1 | **Reminders** (`0025`): a `*/5` sweeper over live rows, deduped by occurrence **instant**; claim-then-compensate; `start` anchor only. Decisions: DECISIONS.md | [context/calendar/reminders.md](context/calendar/reminders.md) |
| Maintenance — 2026-08-02 | 1 | next + eslint-plugin 16.2.12; `@/*` verified prod + dev; Phase 4 inbox check CLOSED | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Doc audit — 2026-08-02 (1/4) | 1 | TS7 gate LIFTED (now a trial); docs:sanity guards init-app anchors; Phase 6 filed | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Doc audit — 2026-08-02 (2/4) | 1 | remove-it's 9 stale counts; calendar routes in ARCHITECTURE; DATABASE 0024/0025; 2 leaves; both doc indexes | [remove-it](context/calendar/remove-it.md) |
| Doc audit — 2026-08-02 (3/4) | 1 | Reminders' three accepted limits + the i18n `now` deferral filed in Watch; row cap 200 → 250; boundary narrative archived, not deleted | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Doc audit — 2026-08-02 (4/4) | 1 | Showcase: 26 stale claims across guide, deck and FEATURES (99.65→99.9 over 12 passes, migrations 18→26, a11y 7→8); deck chart gained a 12th point; FEATURES stamped | [guide](plain-english-guide/README.md) |
| TS7 re-gate — 2026-08-02 | 1 | TS 7 ships no `tsserver`, so a cutover trial could never license it; re-gated on 7.1. Also 10 specifiers not 9, next-intl a false positive | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Calendar grid fix — 2026-08-02 | 1 | Expansion selected by START while both SQL layers used overlap, so a recurring multi-day occurrence straddling the window vanished. Opt-in `match: "overlaps"` (exact end instant); `suppressionBounds` widened too, else a moved occurrence paints twice | [api.md](context/calendar/api.md) |
| Context-engineering — 2026-07-23 | 8 | kit 0.7.0 (hunt 7 · three-strikes · context-guard hook · budgets) · stable prefix + 7th compaction + provenance split · `auth/`+`services/` splits · 5 leaf AGENTS.md · memory −35% · docs-sanity CI lane | [program record](archive/PHASE_HISTORY.md#context-engineering-overhaul-2026-07-23--archived-program-record) |

**The calendar is feature-complete through Phase 5; Phase 6 (sharing · org calendars ·
ICS feed/import · per-occurrence RSVP · guest permissions · inbound iTIP · `VTIMEZONE`)
is a live row in [BACKLOG.md](BACKLOG.md).** An external guest with no account is already
a first-class case — emailed a `METHOD:PUBLISH` `.ics` plus a token link, answering at
`/rsvp` signed out; Phase 4's real-inbox verification closed and passed 2026-08-02. The
deliberate cuts and *why* each was cut — including why invitations are a list at
`/calendar/invites` rather than rows on the invitee's month grid — are preserved in
[archive/PHASE_HISTORY.md → Calendar boundary narrative](archive/PHASE_HISTORY.md#calendar-boundary-narrative--archived-from-project_statusmd-2026-08-02-doc-audit-2c).
Current model, ACL and API: [context/calendar/](context/calendar/model.md).

**Date-gated watch** — [MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)
is canonical; the only item still open is **Renovate PR delivery FAILED** (the 2026-07-27
window passed with zero `renovate/*` branches ever opened — a Mend-side diagnosis job,
tracked as B1). Everything else that was pending here has closed: the `next`/`@next/*`
age-exclude, `brace-expansion` → 5.0.8, `better-auth` → 1.6.25, and `next` 16.2.12.

## Fresh project on-ramp (clone → build a real app)

- **Verify what's actually working** — [VERIFICATION.md](VERIFICATION.md) is a phased,
  hands-on checklist (free/no-account phases first) to prove every feature end-to-end and to
  finish the setup for the env-gated integrations. Phases 0–3 are dry-run-verified on Windows;
  Phases 4–6 carry dated live-verified banners (all COMPLETE in this repo).
- **Delete the demo/scaffold routes** as real features replace them — the "Demo /
  scaffold routes" table in [context/ARCHITECTURE.md](context/ARCHITECTURE.md) marks
  which routes are throwaway, which is the copy-me template (`/posts`), and which
  surfaces are real (the `/` landing page, the `(auth)` + `(dashboard)` shells, `/account`).
- **Copy the worked persistence examples** (Stripe webhook → `subscriptions`,
  Uploadthing → `uploads`) — see [context/DATABASE.md](context/DATABASE.md).
- **Deploy for real** — the worked Fly.io runbook is
  [context/DEPLOYMENT.md → Fly.io](context/DEPLOYMENT.md#flyio-worked-runbook)
  (proven live 2026-07-13); Vercel/Railway/VPS paths remain authored (unexercised).

## Resume / re-verify (from repo root)

```bash
docker compose -f docker/docker-compose.yml up -d   # start Postgres (+ Meilisearch)
pnpm install
pnpm --filter @repo/db db:migrate                   # apply any new migrations
pnpm lint && pnpm type-check && pnpm build          # full gate (all must pass)
```

To watch CI: `gh run watch <id>`, then confirm with `gh run view <id> --json
status,conclusion` — `watch --exit-status` alone has reported success on failed runs
(the `gh` CLI is installed + authed).

## Known non-issues (don't chase these)

- `engines.node >=24` is advisory (no `engine-strict`); older Node only warns on install.
- `drizzle-kit` pulls a deprecated transitive `@esbuild-kit/*` loader — benign, works
  fine; its vulnerable `esbuild` child is pinned by the 2026-07-15 override
  ([MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)).
- npm flags `@react-email/components` (+ ~21 subdeps) "deprecated" with a generic
  message — it is the canonical package per Resend/React Email docs and renders fine
  (verified via `email export`); the warning is cosmetic.
- Toolchain gotchas (pnpm `allowBuilds`, TS 6, Biome 2.5 config, drizzle
  `import.meta.dirname`) are documented in STACK.md / CONVENTIONS.md / UI.md.
- The committed `.claude/` directory holds **three layers with different owners** — kit
  install output (never edit the copies), repo-owned `agents/` + top-level `hooks/*.mjs`
  (edit directly), and a user-owned `settings.json` that is merged, not regenerated.
  Getting this wrong deletes hook wiring, so the rules are canonical in one place:
  [context/CONVENTIONS.md → Agent tooling](context/CONVENTIONS.md#agent-tooling-claude)
  — ownership, the `"${CLAUDE_PROJECT_DIR}/…"` anchored-command contract, and **why a
  valid agent file may still not register** (surface-dependent; reloading does not fix it).
