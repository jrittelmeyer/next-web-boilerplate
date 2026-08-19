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

_Last updated: 2026-08-19 (doc audit: showcase caught up to the fifteenth pass; the watch narrative compacted — detail in MAINTENANCE + the archive)._

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
  Fifteen `/project-audit` passes: **93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 →
  100.0 → 100.0 → 99.65 → 99.65 → 99.9 → 98.6 → 99.3 → 99.3/100** — detail: `docs/archive/PROJECT_AUDIT_*.md`
  (latest: [PROJECT_AUDIT_2026-08-13.md](archive/PROJECT_AUDIT_2026-08-13.md) — the
  fifteenth pass verified the 08-08 closures genuine (API layer → **100**, the F2
  sensors red-proven) and found the week's two pipeline events: `main` red on the
  un-gated kit-0.13.0 push, and the nanoid advisory widened out from under the
  08-12 exit; F1 — Renovate delivery, Mend-side — remains the standing tooling
  deduction).
- **Real host deploy PROVEN live on Fly.io 2026-07-13** and **production email domain +
  deliverability VERIFIED 2026-07-14** (hop-2 email-change delivery gap closed) —
  "Deploy / live-verify closes" summary row below.
- **CI is green** (`verify` · `audit` · `e2e` · `csp-nonce` · `docker-image` · `visual`,
  plus the variable-gated `perf` lane, deliberately unset here — the visual
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
  currency checks. The TS7 cutover stays outside it — **re-gated 2026-08-02 on TS 7.1**
  (TS 7 ships no `tsserver`, and a cutover trial runs no editor, so it could never have
  licensed the change):
  [MAINTENANCE.md → Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done).
- **ai-dev-kit:** the repo's agentic-dev techniques are a portable skill library — the
  standalone [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit) (kit 0.13.0 —
  the 2026-07-23 context-engineering release, two patches, and the 2026-08-08
  project-adopt selective-merge release, then the 0.9–0.13 line, reinstalled here 2026-08-12); this repo consumes the installed
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
| Phase 6 sliced — 2026-08-02 | 1 | B2 was the deferral bucket of Phases 3–5 (~100 commitments, 41 files), not a phase. Band 1 (already-true claims) discharged; Band 2 gated. Inbound iTIP + guest reminders closed as extension points; `private` unenforced, audit gap named | [BACKLOG.md](BACKLOG.md) |
| Advisory — 2026-08-03 | 1 | GHSA-rgw5-rvv9-x895 (high): nested arrays **bypass** the CVE-2026-14257 mitigation `brace-expansion` 5.0.8 was taken for, so that fix wasn't one. → 5.0.9, taken 4 days old under a dated `minimumReleaseAgeExclude` — **deleted on schedule 08-06** | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| a11y scan fix — 2026-08-03 | 1 | Uploadthing's avatar button stays `data-state="readying"` with UPLOADTHING_TOKEN unset, painting white on #60a5fa (2.54:1) — axe caught it on `/account` across every branch. Excluded by that STATE only, so the `ready` button is still scanned | [a11y.spec.ts](../apps/web/e2e/a11y.spec.ts) |
| E2E signup flake fixed — 2026-08-03 | 1 | The helper clicked **before hydration**, so no request was issued and `waitForURL` hung on a form that had submitted nothing (8/8 at 6× CPU throttle; CI's hung attempts left no server-side signup line). Router-race and limiter hypotheses ruled out | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| E2E diagnosability — 2026-08-03 | 1 | All 3 Playwright lanes ran a report-less reporter while CI uploaded a never-created dir (`if-no-files-found` defaulted to warn); `on-first-retry` traced neither the first attempt nor the last. The one "signup flake" row was two defects | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Guide ch. 12 — 2026-08-03 | 1 | The guide's standing promise ("being rewritten for the calendar") delivered as **ch. 12**, glossary → 13 + 7 terms. Appended, not inserted at 9: `docs:sanity` cannot see a "Chapter N" label naming the wrong file. Deck: links only, its gap filed | [ch. 12](plain-english-guide/12-the-calendar.md) |
| Doc audit — 2026-08-03 | 1 | Five drift fixes: the superseded flake row deleted; reminders' Phase-6 sentence caught up with the shipped exact test; jobs coverage include names `sweep.ts`; one anchor; kit 0.7.2. The adapter's broken `prodVerify.start` filed as B1 | [BACKLOG.md](BACKLOG.md) |
| Audit — 2026-08-04 | 1 | Thirteenth pass, first to score the calendar: **98.6**; calendar enters at 85 — F4 external-guest cancellations (HIGH), F5 series-delete footgun, F6 verified-email seams, F7/F8 silent recurrence edges. 14 rows → BACKLOG; drift fixed in 6 docs | [report](archive/PROJECT_AUDIT_2026-08-04.md) |
| Advisory batch #5 — 2026-08-04 | 1 | 9 advisories (4 high) closed #41, two against our own pins (fast-uri 3.1.4, postcss 8.5.20). Ranged overrides undici 7.29.0 (×5) + socket.io-parser 4.2.7; postcss key → 8.5.23; fast-uri park → promoted to 3.1.5 on schedule 08-07. All tooling paths | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| Calendar F4+F5 — 2026-08-05 | 1 | F4: `ne(userId, actor)` NULL-dropped externals from cancellations — fixed `or(isNull, ne)`; real-PG test proves both spellings, the mocked fixture had asserted what SQL contradicted. F5: delete now runs `scopePairIssues`; first scope-pair tests | [audit 08-04](archive/PROJECT_AUDIT_2026-08-04.md) |
| Calendar F6 — 2026-08-05 | 1 | The verified-email conjunct reached only the read path: invite-time resolution stamped any account — a durable claim no read re-checks — and the unbounded respond UPDATE let an address move capture a co-invitee's row. Legacy stamps kept, stated | [attendees.md](context/calendar/attendees.md) |
| Calendar F7+F8 — 2026-08-06 | 1 | F7: the `overlaps` seek reaches back a full occurrence span — straddlers ≥2 periods out never generated. F8: `YEARLY;BYMONTHDAY` sans `BYMONTH` expands every month (corpus +40 append-only; COUNT/BYSETPOS rows re-identify — census-gated: zero) | [audit 08-04](archive/PROJECT_AUDIT_2026-08-04.md) |
| Doc audit — 2026-08-06 | 1 | 16 drift fixes — calendar absent from TESTING/ARCHITECTURE/I18N/STACK tables, api.md's limiter truth (per-procedure buckets), corpus 528→568; showcase re-stamped at 98.6/thirteen; archive index row restored; 2 backlog rows; 4 rows re-capped | [BACKLOG.md](BACKLOG.md) |
| Audit — 2026-08-06 | 1 | Fourteenth pass: **99.3** (calendar 85→95.5). F4–F8 adversarially re-verified at their seams; live surface fully green (heartbeat + security lanes same day). New find: the F4/F6-respond fixes lack revert sensors — B2 sweep row sharpened, now first in band | [report](archive/PROJECT_AUDIT_2026-08-06.md) |
| Advisory — 2026-08-07 | 1 | Two parks: dompurify GHSA-55q2 (moderate — the 3.4.12 pin fell in turn) + nanoid GHSA-2v37 (HIGH — postcss calls plain nanoid(6); vulnerable fns never invoked). Both audit-edge only; **exited 2026-08-12** (due 08-10): ranged keys + the fast-uri conversion, allowlist `[]` | [Watch](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| B2 sweep — 2026-08-08 | 1 | F2 closed both sides: spelling pins over the captured WHEREs (PgDialect, red-proven both reverts) beside the standing planted defects; 4 e2e sensors — cancel fan-out set, respond-capture victim row, invites read twin, range ownership gate. Long tail → B3 | [TESTING.md](context/TESTING.md) |
| Kit 0.8.0 adopt-merge — 2026-08-08 | 1 | project-adopt 0.3.0: two-tiered meaningful-improvement bar (surface defaults keep-theirs; foundation keeps template presumption), recorded comparisons, incoming agentic layer surveyed, parity → pending-spec map, model routing; reinstalled | [kit CHANGELOG](https://github.com/jrittelmeyer/ai-dev-kit/blob/main/CHANGELOG.md) |
| Rate-limit completeness — 2026-08-08 | 1 | B2: `deleteCalendar` gains the contract's missing limiter (10/min); `/rsvp` DB read capped 60/min per invitation on `loadRsvpView` (contrarian moved it off the no-DB route handler); null-on-denial keeps the 200-page invariant | [invitations.md](context/calendar/invitations.md) |
| Doc audit — 2026-08-12 | 1 | Three drift fixes (BACKLOG's fused row unhid the reminder-email row; STATUS date; api.md 20/min) + the deck learns the fourteenth pass (99.3, 14th chart point); showcase re-stamped; doc-map memory repaired. Zero new backlog rows | [deck](plain-english-guide/slide-deck.html) |
| Audit — 2026-08-13 | 1 | Fifteenth pass: **99.3** flat — 08-08 closures verified (API 100, sensors red-proven by reconstruction); found `main` red (un-gated kit-0.13.0 push fails Biome — B1 row), nanoid advisory re-widened (dated take 08-14), bare brace-expansion key (rider) | [report](archive/PROJECT_AUDIT_2026-08-13.md) |
| Bundled fix — 2026-08-14 | 1 | `main` un-reds: Biome format on kit-0.13.0's `.claude/settings.json` output; nanoid GHSA-2v37 re-parked (route 1, 3.3.18 ~2.5h short of the age gate); brace-expansion → ranged key (F5); kit 0.13.0 update documented retroactively | [CHANGELOG](../CHANGELOG.md) |
| `next` 16.3.0 superseded — 2026-08-14 | 1 | Contrarian caught a live `next/image`/`next/og` sharp SVG-blocking regression in 16.3.0 hitting this repo's OG/icon routes (verified against `vercel/next.js#96733`); taking 16.3.1 instead once it ages in 08-20 | [MAINTENANCE](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done) |
| `better-auth` 1.6.26 — 2026-08-14 | 1 | Routine bump, no advisory; schema-diffed clean across the full surface (auth leaf rule's blind spot — `@better-auth/core`/passkey — found by contrarian and fixed same session); live-verified: 2FA challenge, org invite/accept, admin ban, session cleanup on delete (4/4 sessions gone) | [CHANGELOG](../CHANGELOG.md) |
| `nanoid` 3.3.18 taken — 2026-08-14 | 1 | Mechanical, spec pre-signed: 3.3.18 aged in ~17:08 UTC; override promoted `<3.3.17` → `<3.3.18`, `ignoreGhsas` back to `[]`, `pnpm audit` zero vulnerabilities/zero ignored | [CHANGELOG](../CHANGELOG.md) |
| Doc audit — 2026-08-19 | 1 | Showcase caught up to the fifteenth pass (ch. 1 was three passes stale; deck 15th chart point); kit 0.13.0 + Renovate-still-zero currency; STATUS watch + BACKLOG overrides compacted, verbatim → archive; 2 memory repairs | [deck](plain-english-guide/slide-deck.html) |
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
is canonical; the per-program rows above + [CHANGELOG](../CHANGELOG.md) carry each
landed item. Open now, and nothing else: **Renovate PR delivery FAILED** (zero
`renovate/*` branches ever — re-checked 2026-08-19, every Monday window through 08-17
empty; the Mend-side diagnosis is BACKLOG B1) · the **`next` 16.3.1 dated take**
(16.3.0 superseded 2026-08-14 over a live `sharp`/SVG regression; 16.3.1 ages in
~2026-08-20T22:45 UTC — plan, riders and the order-dependent verification live in
MAINTENANCE → Dated dependency takes). Ledger clear as of 2026-08-14: `nanoid` 3.3.18
+ `better-auth` 1.6.26 taken, `main` green, `auditConfig.ignoreGhsas` `[]`,
`pnpm audit` zero vulnerabilities / zero ignored. The verbatim history this paragraph
used to carry:
[archive/PHASE_HISTORY.md → Archived 2026-08-19](archive/PHASE_HISTORY.md#archived-2026-08-19-status-watch-and-overrides-history).

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
