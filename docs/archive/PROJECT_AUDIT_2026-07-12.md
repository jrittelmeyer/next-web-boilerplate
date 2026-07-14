# Project Audit — 2026-07-12 (second 100/100 scoring pass)

> The `/project-audit` skill's second run (the first, **93/100 on 2026-07-08**, is
> [PROJECT_AUDIT_2026-07-08.md](PROJECT_AUDIT_2026-07-08.md); it seeded A1–A22, all of
> which except A13 have since shipped). **Method:** read every doc (`PROJECT_STATUS` ·
> `BACKLOG` · `VERIFICATION` · all 14 `docs/context/*`), then swept the code — root
> configs (`package.json`, `turbo.json`, `pnpm-workspace.yaml`), `apps/web/src`
> (`env.ts`, `next.config.ts`, `proxy.ts`, tRPC core, the realtime A22 surface, `lib/*`),
> `packages/auth/src/auth.ts`, `@repo/db` (schema/migrations/listener/notify), CI
> workflows, Dockerfile, the E2E suite (19 specs), and the coverage configs —
> spot-checking doc claims (file paths, line refs, counts, env-gating, CSP directives,
> rate-limit rules, plugin order) against the source. Scores grade against **the best
> conceivable production starter today**, not the repo's own history. Rubric per group:
> correctness & robustness (30) · completeness vs. today's best practice (25) ·
> security (15) · performance (10) · testing (10) · docs & DX (10). Every deduction maps
> to a backlog item (A23+ are new from this audit; named items are existing `BACKLOG.md`
> rows) or an explicit won't-fix note.
>
> **Headline: overall 97.5/100 (up from 93).** No correctness bugs found. Doc ↔ code
> alignment is excellent — **2 drift points, both doc-side and trivial** (a stale line
> ref, an incomplete CI-step list), both **fixed in this pass**. The distance to 100 is
> now dominated by (a) the two externally-gated verifications (real-host deploy, Stripe
> live keys) and (b) a short tail of polish items on the newest surfaces (realtime
> reconnect backfill, a `Table` primitive, dead-code detection) enumerated below. The
> **maintenance-only stance stands** — nothing here is urgent; the new rows are
> available on real need.

## Score table

| # | Feature group | 07-08 | Now | Dominant deductions |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 97 | **98** | A27 dead-code/unused-dep detection (knip) (−2) |
| 2 | Framework & app architecture | 94 | **98** | A31 evaluate `typedRoutes` with next-intl (−2) |
| 3 | Database | 90 | **99** | A29 deploy-tunable pool `max` env knob (−1) |
| 4 | Auth & access control | 93 | **99** | Magic-link/email-OTP stays a recipe (A18 resolution) — won't-fix (−1) |
| 5 | API layer (tRPC + Actions) | 96 | **99** | `updatePost` keeps the pre-A7 first-issue error shape — deliberate opt-in convention, won't-fix (−1) |
| 6 | UI & design system | 88 | **98** | A26 `Table` primitive (−2) |
| 7 | State & data fetching | 97 | **99** | `persist` unwired is deliberate — won't-fix (−1) |
| 8 | Forms & validation | 96 | **100** | — |
| 9 | Email | 93 | **96** | Production domain/deliverability, existing B3, gated (−4) |
| 10 | Payments (Stripe) | 84 | **88** | Live-verify Phase 5, existing B2, gated (−8) · A13 cancel-on-delete, deferred (−2) · per-org billing, documented deferral (−2) |
| 11 | File uploads | 95 | **98** | UT prod-callback needs a public URL — platform property, won't-fix (−2) |
| 12 | Search | 97 | **99** | Signed-in-user reindex — documented P1-2 decision (admin-gate is the fork move), won't-fix (−1) |
| 13 | Background jobs | 92 | **99** | Dead-letter queue documented (A20) but not wired — recipe posture, won't-fix (−1) |
| 14 | Observability | 96 | **99** | OTel excluded — standing exclusion (−1) |
| 15 | Security | 94 | **99** | Static-CSP `'unsafe-inline'` default — deliberate, verified nonce recipe ships; residual (−1) |
| 16 | Testing & CI | 91 | **99** | A28 dormant `visual` lane has no Linux baselines committed (−1) |
| 17 | Deployment & ops | 89 | **92** | Real-host deploy never exercised, existing B1, gated (−8) |
| 18 | Docs & DX | 96 | **99** | 2 drift nits found, fixed this pass (−1) |
| 19 | Internationalization *(new group — shipped after the 07-08 audit)* | — | **97** | A30 worked next-intl formatting example (−2) · partial (primary-journey) coverage — deliberate, won't-fix (−1) |
| 20 | Realtime / SSE *(new group — A22)* | — | **96** | A23 reconnect backfill (−2) · A24 `unreadCount` unused + JS-count (−1) · A25 `notification.list` pagination (−1) |
| | **Overall (mean)** | **93** | **97.5** | |

## Doc ↔ code drift (all fixed in this pass)

Both are doc-side staleness; **no code gaps** (nothing a doc promises is missing from
the code):

1. **VERIFICATION.md → Upstash blockquote** cited the tRPC rate-limited procedure at
   `trpc.ts:103` — the file grew with A16's `userRateLimitedProcedure`;
   `rateLimitedProcedure` now sits at `trpc.ts:118`. Fixed (line ref updated).
2. **DEPLOYMENT.md → CI/CD → `verify`** — the numbered step list omitted the
   `pnpm --filter @repo/observability check` step that runs between the dep-consistency
   check and tests (the dashboards-as-code section does mention it; the list didn't).
   Fixed.

Everything else checked clean, including: the 25-module coverage `include` list
(TESTING.md ↔ `apps/web/vitest.config.ts`), the 19-spec E2E suite, migrations
0000–0015, the full CSP directive set (SECURITY.md ↔ `next.config.ts`, byte-for-byte),
`images.remotePatterns`, the proxy's `METADATA_SEGMENTS` guard + locale-stripped gate,
every Better Auth `customRules` entry and the plugin order (conditional `captcha()`
last before `nextCookies()`), the Dockerfile stages (npm-stripped runner + slim
worker), all six CI jobs and their gates, `pnpm-workspace.yaml`
(allowBuilds/`minimumReleaseAge`/audit allowlist), the Turnstile env pair in
`.env.example`, the `Notifications` namespace in both catalogs, and the A22 pieces
(`notify()` parameterized `pg_notify`, `createPgListener`'s `SAFE_CHANNEL` guard,
session-gated SSE route with heartbeat + double cleanup, `globalThis` bus singleton
with timer reconnect).

## New backlog items (A23–A31 — the A-series continues)

Inclusion policy applied (owner's standing rule): majority-benefit + low-risk →
included; greatly-beneficial + moderate-cost → included with the risk named. All are
**B3 (situational)** except A31 (**B4**, investigate-first) — none reopens the
maintenance-only stance on its own; they're available when a real need (or a fork)
picks them up. Ordered by value to the widest variety of downstream projects.

| Id | Band | Area | Item | What it fixes / adds | Lifts | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A23 | B3 | Realtime | **SSE reconnect backfill** — on an `EventSource` re-open *after* a drop, `invalidateQueries` the `notification.list` cache so notifications missed in the reconnect gap appear without a manual reload | Implements the backfill DEPLOYMENT.md's own serverless guidance describes; today `onopen` only flips the status badge back to "Live" | Realtime +2 | S | none |
| A26 | B3 | UI | **`Table` primitive** in `@repo/ui` (the canonical shadcn table) | The one standard shadcn data primitive still absent; every app lists tabular data eventually (the `/admin` + `/admin/audit` lists chose `<ul>` rows — fine, but forks reaching for a table have nothing to copy) | UI +2 | S | none (zero-dep primitive, the Skeleton precedent) |
| A27 | B3 | Tooling | **Dead-code / unused-dependency detection** (`knip`) in the CI `verify` lane | Nothing today catches an orphaned export, an unused file, or a dep no longer imported (e.g. the A24 finding); manypkg checks version consistency only | Tooling +2 | M | initial config churn; knip needs tuning to avoid false positives on Next/monorepo entry points |
| A29 | B3 | DB | **Deploy-tunable pool sizing** — optional `DB_POOL_MAX` env → `Pool({ max })` in `@repo/db` `client.ts` (validated, default unchanged) | DATABASE.md's pooling guidance says "thread it from an env var if you want it deploy-tunable" — make that the shipped affordance instead of a code edit | DB +1 | S | none (unset = today's behavior) |
| A28 | B3 | Testing | **Commit Linux visual baselines + enable the `visual` lane** — generate via the pinned Playwright Docker image (the UI.md recipe), commit `…-linux.png`, `gh variable set ENABLE_VISUAL --body true` | The visual-regression harness is built and verified but the CI lane is dormant for want of baselines; this makes it actually guard PRs | Testing +1 | S | baseline PNGs add repo weight; needs local Docker |
| A24 | B3 | Realtime | **Fix + wire `notification.unreadCount`** — use SQL `count()` (today it fetches every unread row and counts in JS), and either consume it (e.g. a header badge) or delete it (the feed derives its badge from the loaded page) | An unused procedure that also models the wrong query shape for the thing it demonstrates | Realtime +1 | S | none |
| A25 | B3 | Realtime | **Keyset-paginate `notification.list`** + "Load more" (reuse the posts cursor pattern / `lib/keyset-cursor`) | The feed caps at 50 with no pagination; a real notifications surface pages | Realtime +1 | S/M | none |
| A30 | B3 | i18n | **Worked next-intl formatting example** (docs + one usage) — `useFormatter`/`format.dateTime`/`format.number` for locale-aware dates/numbers/currency in I18N.md | The catalogs demonstrate messages + ICU plurals but not value formatting — the second thing every i18n fork needs | i18n +2 | S | none |
| A31 | B4 | Framework | **Evaluate `typedRoutes: true`** alongside next-intl's `createNavigation` typing | Statically-typed `<Link href>` is a modern-starter default; unverified interaction with the i18n navigation wrappers makes this investigate-first | Framework +2 | M | may conflict with next-intl's own href typing — prototype before adopting |

**Existing backlog rows this audit re-affirms as score-lifting** (no new rows needed):
Real host deploy (B1 — Deployment +8) · Enable CodeQL (B1 — gated) · Stripe
live-verify (B2 — Payments +8) · A13 cancel-on-delete (B2 — Payments +2) · Production
email domain (B3 — Email +4) · TS7 cutover (B4 — watch).

## Considered and excluded (visible decisions)

- **WebSockets / hosted realtime (Ably, Pusher, Supabase Realtime)** — SSE +
  LISTEN/NOTIFY was the deliberate no-new-infra choice (DECISIONS.md); the `notify()`
  seam is the documented swap point. Nothing to add until a fork needs bidirectional.
- **Notification preferences / digests / read-per-item UI** — product-specific depth on
  a demo entity; the persisted table + actions are the template.
- **TanStack Table / data-table component** — A26 ships the plain primitive instead; a
  full data-table (sorting/filtering/virtualization) is app-specific weight.
- **OpenTelemetry** — re-affirmed exclusion (Sentry carries tracing; config surface
  most forks won't use).
- **Per-account lockout** — re-affirmed exclusion (IP limits + HIBP + CAPTCHA now
  cover the abuse surface; the audit log enables a fork to add it).
- **Locale-routed sitemap for authed/demo routes, RTL support, locale cookies** —
  niche for a 2-locale starter; the add-a-locale recipe covers growth.
- **Mutation testing (Stryker)** — heavy CI cost for a starter; the coverage floors +
  E2E breadth are the right guardrails at this scale.
- **`next/image` blur placeholders, OG-image theming** — cosmetic polish below the
  deduction threshold.

## Won't-fix notes (deductions without backlog items)

- **Magic link / email OTP stays a recipe** (Auth −1) — A18's resolution: docs-only by
  design; wiring it ships an opinion most forks would rewrite.
- **`updatePost` keeps the first-issue error shape** (API −1) — A7 is explicitly
  opt-in per action; the contrast is itself documentation.
- **Zustand `persist` unwired** (State −1) — standing decision (STATE.md).
- **UT prod-callback on localhost** (Uploads −2) — platform property (VERIFICATION ⚠️).
- **Signed-in-user `reindexPosts`** (Search −1) — documented P1-2 decision with the
  admin-gate swap spelled out in SERVICES.md.
- **DLQ documented, not wired** (Jobs −1) — A20 ships the recipe; a default DLQ queue
  nobody watches is worse than the documented `state='failed'` query.
- **Static CSP default** (Security −1) — deliberate, with the i18n-aware nonce recipe
  re-verified 2026-07-12.
- **Partial i18n coverage** (i18n −1) — primary-journey-only is the locked decision;
  un-wired pages render their literals safely.

## Prioritization statement

Nothing here reopens feature work on its own — **maintenance-only stands**. When a
row is picked (real need or a fork's request), the order for
biggest-variety-of-projects value is: **A23 → A26 → A24 → A25 → A29 → A28 → A27 →
A30 → A31** (A23 first as the one item that closes a gap between shipped behavior and
the repo's own documented posture; then breadth), with the externally-gated B1/B2 rows
(real host deploy · CodeQL · Stripe) still the highest-value unlocks whenever their
prerequisites appear. Bands in `BACKLOG.md` remain the single source of truth; this
report is the scoring record.
