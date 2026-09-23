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
> the ninth compaction (2026-09-23: the 58 rows dated 2026-08-02 → 09-08 archived
> verbatim, five cluster rows remain); the append-log must not regrow.**
>
> The cap is **prospective — it binds new rows only, and never licenses rewriting a
> historical one.** Raised 200 → 250 on 2026-08-02: 200 was set before a one-row
> phase summary had to carry a migration number, a decision and its falsifier, and
> every row actually written under it needed a trim that cost real detail. 250 is the
> observed honest cost of one such row; anything longer is prose that belongs in the
> archive.

_Last updated: 2026-09-23 — `better-auth` 1.6.30 → 1.6.33 routine patch bump (passkey lockstep, all three schema surfaces diffed clean, full gate green); doc audit: the three post-09-22 commits reconciled (the `smol-toml` red closed via `knip` 6.35.1 and #61 auto-closed; `next` 16.3.6 taken as an RCE exception with ten age-exclude entries until 09-29; the B3 calendar long-tail batch signed and built); ninth compaction of the table below (58 rows → archive); STACK.md's `next`/`knip`/`vitest` rows, the invitations token-expiry claim and the archive index caught up; a "cut v1.3.0" B3 row filed ([BACKLOG](BACKLOG.md))._

## Where we are

- **PUBLIC — launched 2026-07-14.** This repo is now a public GitHub template at
  [github.com/jrittelmeyer/next-web-boilerplate](https://github.com/jrittelmeyer/next-web-boilerplate),
  published as a fresh single-commit history (the full pre-launch history is archived
  privately). Post-publish hardening is on: secret scanning + push protection,
  CodeQL, vulnerability alerts, and a `main` ruleset that blocks force-pushes and
  branch deletion. Donation link live 2026-07-15: `.github/FUNDING.yml` + README
  point at the owner's PayPal.Me.
- **Feature-complete; maintenance-only is the standing state** — since 2026-07-17, when the
  path-to-100 program was verified at 100.0/100 ([per-row analysis](archive/PATH_TO_100_2026-07-15.md)
  · [the verifying pass](archive/PROJECT_AUDIT_2026-07-17.md)). Phases 1–5, every Tier-4 row, the
  live-SaaS + Stripe verification (2026-07-05 → 13; provenance banners in
  [VERIFICATION.md](VERIFICATION.md)) and a proven Fly.io deploy (07-13) are all on `main`; the
  per-program table below is the record. The TS7 cutover stays outside maintenance — re-gated on
  TS 7.1: [MAINTENANCE.md → Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done).
- **Seventeen `/project-audit` passes: 93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 →
  100.0 → 100.0 → 99.65 → 99.65 → 99.9 → 98.6 → 99.3 → 99.3 → 99.4 → 99.3/100** — reports in
  `docs/archive/PROJECT_AUDIT_*.md`; latest
  [PROJECT_AUDIT_2026-09-01.md](archive/PROJECT_AUDIT_2026-09-01.md) (the 2026-09-02 rows below
  closed two of its three seeded rows; the standing deductions are B2/B3 rows plus Mend's
  unproven npm-manager/lockfile delivery class).
- **CI: every push lane green on `main` (`425e53e`, 2026-09-23 — CI + CodeQL).** The
  `smol-toml` HIGH that held the daily `security-audit` lane and the heartbeat red from
  2026-09-10 closed 2026-09-22 (`knip` 6.24.0 → 6.35.1; triage issue
  [#61](https://github.com/jrittelmeyer/next-web-boilerplate/issues/61) auto-closed 09-23) —
  the daily lane's next run is its green confirmation (its last run, 09-22, was still on the
  old head). Lanes: `verify` · `audit` · `e2e` · `csp-nonce` · `docker-image` ·
  `visual`, plus the variable-gated `perf` lane, deliberately unset here. **CodeQL is live** —
  `ENABLE_CODEQL` is set on the public repo (code scanning is free once public); the variable
  gate stays so private forks don't go false-red ([context/DEPLOYMENT.md](context/DEPLOYMENT.md)).
- **ai-dev-kit:** the repo's agentic-dev techniques are a portable skill library — the
  standalone [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit) (**kit 0.23.16**,
  installed here 2026-09-02 from a **tagged worktree** — the standing rule since that day:
  install from a tag, never a clone's working tree). This repo consumes the installed `.claude/`
  output (edit a clone, re-install — never the copies) and is **installer-route**
  ([CONVENTIONS.md → Agent tooling](context/CONVENTIONS.md#agent-tooling-claude)). Kit story:
  the kit repo's CHANGELOG + [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md).

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
[the archived build-progress table](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction);
the 58 rows dated 2026-08-02 → 09-08 →
[the 2026-09-23 section](archive/PHASE_HISTORY.md#archived-2026-09-23-ninth-compaction-project_status-rows-2026-08-02-to-09-08-and-the-backlog-shipped-row-sweep)):

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
| Calendar hardening — 2026-08-02 → 08-08 | 7 | Recurring-span grid fix (opt-in `overlaps`) · Phase 6 sliced: Band 1 done, Band 2 gated · audit F4–F8 fixed at their seams · B2 assertion sweep (spelling pins + 4 e2e sensors) · `deleteCalendar` + `/rsvp` limiters | [archived rows](archive/PHASE_HISTORY.md#archived-2026-09-23-ninth-compaction-project_status-rows-2026-08-02-to-09-08-and-the-backlog-shipped-row-sweep) |
| Maintenance — 2026-08-02 → 08-14 | 13 | `next` 16.2.12 · TS7 re-gated on 7.1 (no `tsserver`) · brace-expansion 5.0.9 age exception · e2e signup hang = pre-hydration click, lanes gain traces · batch #5 (9 advisories) · parks exited · kit 0.8.0 · `main` un-redded · better-auth 1.6.26 | [archived rows](archive/PHASE_HISTORY.md#archived-2026-09-23-ninth-compaction-project_status-rows-2026-08-02-to-09-08-and-the-backlog-shipped-row-sweep) |
| Audits — 2026-08-02 → 08-19 | 13 | Passes 13–16: **98.6** (calendar enters at 85) → 99.3 (calendar 95.5) → 99.3 → **99.4**; eight doc-audit rows (08-02 ×4, 08-03, 08-06, 08-12, 08-19 — ~50 drift fixes, showcase re-stamped each time) · guide ch. 12 written | [archived rows](archive/PHASE_HISTORY.md#archived-2026-09-23-ninth-compaction-project_status-rows-2026-08-02-to-09-08-and-the-backlog-shipped-row-sweep) |
| Maintenance — 2026-08-22 → 08-31 | 10 | `next` 16.3.1 taken-and-reverted (standalone boot crash) · better-auth 1.6.30 → exact-pin rule · `next` 16.3.3 security take · CVE-2026-14456 Docker `patched` stage · self-hosted `renovate.yml` · harness audit **93.9** · doc audits 08-26 ×2, 08-31 | [archived rows](archive/PHASE_HISTORY.md#archived-2026-09-23-ninth-compaction-project_status-rows-2026-08-02-to-09-08-and-the-backlog-shipped-row-sweep) |
| Maintenance — 2026-09-01 → 09-08 | 15 | Pass 17 **99.3** · kit 0.23.16 from a tag · settings.json least-privilege · Renovate = Mend, `renovate.yml` dormant · month-boundary e2e fix · `calendar.range` error state · releases published · predicate-sensor row closed · 6 advisory takes | [archived rows](archive/PHASE_HISTORY.md#archived-2026-09-23-ninth-compaction-project_status-rows-2026-08-02-to-09-08-and-the-backlog-shipped-row-sweep) |
| Doc audit — 2026-09-22 | 1 | Found the daily audit lane red 12 days (`smol-toml`, #61), the fast-uri park exit and the `next` 16.3.4 take overdue; ledger/override counts, the "open" Renovate decision and the archive index (+4 rows — its rule slipped a 4th time) fixed; showcase re-stamped; 4 memory repairs | [archive/README.md](archive/README.md) |
| Maintenance batch — 2026-09-22 | 1 | `knip` `6.24.0` → `6.35.1` closes the 12-day `smol-toml` red (issue #61) without an override — surfaced 2 pre-existing knip findings the older version missed, fixed with a documented `tailwindcss` ignore; `fast-uri` `<3.1.6` → `<3.1.7` promoted overdue, but the two parked GHSAs it was meant to close turned out to be unpublished IDs (404 on the GitHub Advisories API) — deleted rather than promoted; `pnpm audit` 0 after both | [CHANGELOG](../CHANGELOG.md) · [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Advisory — 2026-09-23 | 1 | `next` `16.3.3` → `16.3.6`, age-gate exception — GHSA-vcvr-r3jv-pc5j (RCE in `next/og`'s `ImageResponse`), live-exposed on three fully public, unauthenticated routes (`opengraph-image`, `icon`, `apple-icon`); took route (2) rather than wait for the 2026-09-29 gate. Full gate green; live-verified all four image routes 200 on a fresh `:3100` build; `pnpm audit` 0. Docker standalone boot check, AVIF-source `/_next/image` drive, and the `@next/eslint-plugin-next` lockstep bump carried forward, undone | [CHANGELOG](../CHANGELOG.md) · [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| B3 calendar long-tail correctness batch — 2026-09-23 | 1 | Signed off and built same session. All nine items: RFC 6868 param quoting + mailto percent-encoding, DATE-form `UNTIL` zone semantics, `seriesEndInstantMs` slack + `truncated` handling, DAILY+BYMONTHDAY honest refusal, one-off RSVP token expiry, `updateOccurrence` membership check, actor-self cancellation by-email exclusion, `loadRecipients` organizer filter (decision C resolved to (b), not the plan's recommended (a) — the verification trace found a real self-invite path). `packages/calendar` 100/100/100/100 (838 tests); new real-Postgres integration coverage for both DB-predicate items | [CHANGELOG](../CHANGELOG.md) · [plan](archive/calendar-long-tail-correctness-plan.md) |
| Maintenance batch — 2026-09-23 | 1 | `better-auth` `1.6.30` → `1.6.33` (`@better-auth/passkey` lockstep), routine patch, release-1.6 line. All three schema surfaces diffed per the leaf rule — no column changes; only runtime diff was additive Turnstile captcha failure logging. Full gate green | [CHANGELOG](../CHANGELOG.md) |
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
is canonical; the per-program rows above + [CHANGELOG](../CHANGELOG.md) carry each landed
item. Open now (as of the 2026-09-23 maintenance batch): **e2e month-boundary** (B2 — fix
merged 2026-09-03; removal condition open until the 2026-10-01 window passes green) ·
**`better-auth` 1.7.x** is a breaking minor — plan → sign-off, no advisory forces it ·
**`next` 16.3.6 take gaps** carried forward — Docker standalone boot check, an AVIF-source
`/_next/image` drive, and the `@next/eslint-plugin-next` lockstep bump (still resolves
16.2.12) are not done. Ledger: `ignoreGhsas` is `[]` (the `smol-toml` red closed via the
`knip` 6.24.0 → 6.35.1 bump, and the two `fast-uri` 3.1.7 parks turned out to be unpublished
GHSA IDs and were deleted rather than promoted — see [CHANGELOG](../CHANGELOG.md)),
`minimumReleaseAgeExclude` holds 10 dated entries for `next` 16.3.6 (RCE in `next/og`'s
`ImageResponse`, GHSA-vcvr-r3jv-pc5j — expires 2026-09-29), `pnpm audit` 0. The paragraph
this replaces is preserved in
[archive/WATCH_HISTORY.md](archive/WATCH_HISTORY.md#project_status-date-gated-watch-paragraph-as-of-2026-09-02).

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
