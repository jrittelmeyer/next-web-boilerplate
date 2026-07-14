# Project Audit — 2026-07-12B (third scoring pass, post-A23–A31 close)

> The `/project-audit` skill's third run, hours after the second
> ([PROJECT_AUDIT_2026-07-12.md](PROJECT_AUDIT_2026-07-12.md), **97.5/100**) and after
> every row it seeded (A23–A31) closed. **Method:** with the second audit's byte-level
> verification only one day old, this pass (a) re-read the resume docs + the prior
> reports, (b) **verified every A23–A31 close in the code** (not the docs' word for it),
> (c) reviewed the full `docs/context/*` **delta diff against the audited base**
> (`a96bc2a..HEAD` — equivalent to re-verifying the whole set, since the base was
> checked byte-for-byte), and (d) swept the changed code surface with fresh eyes
> (notifications feed/router/actions, `Table`, knip config + CI step, Linux baselines,
> `DB_POOL_MAX`, proxy, env, next.config, E2E suite). Same rubric and calibration as
> before: correctness & robustness (30) · completeness (25) · security (15) ·
> performance (10) · testing (10) · docs & DX (10); graded against the best
> conceivable production starter today.
>
> **Headline: overall 98.2/100 (up from 97.5).** No correctness bugs. All nine A23–A31
> closes are real in code, each with a worked consumer and test coverage where it
> matters (A23's forced-reconnect two-context E2E; A26's stories + both-platform
> baselines + `/admin/audit` consumer; A27 live-gating in `verify` with six `@public`
> tags at real export sites; A28's 56 Linux baselines + `ENABLE_VISUAL=true` confirmed
> via `gh variable list`). **One drift point found and fixed** (a workflow comment
> mis-dating A28 to 2026-07-13). **One new local backlog row (A32)** — the only
> fresh-eyes finding of substance. The remaining distance to 100 is now almost entirely
> the externally-gated verifications (real-host deploy −8, Stripe −12, email domain −4)
> plus standing won't-fix notes. **Maintenance-only stands.**

## A23–A31 close verification (code, not docs)

| Row | Verified in code |
| --- | --- |
| A23 | `notifications-feed.tsx` — closure-scoped `hasConnected`; every `onopen` after the first invalidates **both** `notification.list` and `unreadCount`. E2E: `notifications.spec.ts` holds the reconnect open at the network edge, sends in the gap, releases, asserts the row arrives push-free. |
| A24 | `notification.unreadCount` is a SQL `count()` (single aggregate row) and is the badge's source, reconciled at every cache mutation (push / backfill / fallback invalidate; direct `{count: 0}` on mark-all-read). |
| A25 | `notification.list` keyset-paginates with the `(createdAt, id)` cursor, `limit + 1` probe, and **`z.uuid()` cursor id**; the client is `useInfiniteQuery` with prepend-into-`pages[0]` + dedupe-across-all-pages; en/es catalogs hold the same 14 `Notifications` keys. |
| A26 | `packages/ui/src/components/table.tsx` — zero-dep 8-part shadcn family, self-wrapping `overflow-x-auto`; stories + win32/linux baselines; `/admin/audit` converted to the worked consumer. |
| A27 | `knip.jsonc` (every ignore carries its reason) + `pnpm knip` as a `verify`-lane step; six `@public` JSDoc tags at real export sites (`queues.ts` ×2, `i18n/navigation.ts`, `trpc.ts` ×2, `uploadthing-client.ts`). |
| A28 | 56 `…-linux.png` baselines committed; the `visual` job runs **inside** `mcr.microsoft.com/playwright:v1.61.0-noble` (`container:` in ci.yml); `ENABLE_VISUAL=true` set 2026-07-12T06:31Z (confirmed live via `gh variable list`). |
| A29 | `packages/db/src/client.ts` — `DB_POOL_MAX` unset/empty → pg default; positive int → `poolConfig.max`; set-but-invalid throws at module load. In `.env.example` + DATABASE/DEPLOYMENT docs. |
| A30 | I18N.md → "Formatting dates, numbers & currency" — `useFormatter`/`getFormatter`, named formats from `getRequestConfig`, ICU-embedded skeletons, the `timeZone`/`now` `ENVIRONMENT_FALLBACK` gotcha. Docs-only by design (see A32 below for the consumer half this audit now asks for). |
| A31 | DECISIONS.md — full evaluated-→-NOT-adopted record (vacuous-or-wrong checking under `[locale]` + `as-needed`; next-intl's flattened nav typing out of reach; the tsconfig `exclude: [".next"]` silent-no-op side finding). Treated as a resolved decision, not a missing feature. |

## Score table

| # | Feature group | 07-12 | Now | Dominant deductions |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 98 | **100** | — (A27 closed it) |
| 2 | Framework & app architecture | 98 | **100** | A31 resolved: typedRoutes would be vacuous-or-wrong here; next-intl `pathnames` is the named tool if typed hrefs are ever wanted — won't-fix |
| 3 | Database | 99 | **100** | — (A29 closed it) |
| 4 | Auth & access control | 99 | **99** | Magic-link/email-OTP stays a recipe — won't-fix (−1) |
| 5 | API layer (tRPC + Actions) | 99 | **98** | `updatePost` first-issue error shape — won't-fix (−1) · `post.list`/`listMine` cursor id still `z.string()` while `posts.id` is uuid — the exact gap A25 closed for notifications; **existing B2 backlog row** (−1) |
| 6 | UI & design system | 98 | **100** | — (A26 closed it) |
| 7 | State & data fetching | 99 | **99** | `persist` unwired is deliberate — won't-fix (−1) |
| 8 | Forms & validation | 100 | **100** | — |
| 9 | Email | 96 | **96** | Production domain/deliverability — existing B3, gated (−4) |
| 10 | Payments (Stripe) | 88 | **88** | Live-verify Phase 5 — gated (−8) · A13 cancel-on-delete — deferred (−2) · per-org billing — documented deferral (−2) |
| 11 | File uploads | 98 | **98** | UT prod-callback needs a public URL — platform property, won't-fix (−2) |
| 12 | Search | 99 | **99** | Signed-in-user reindex — documented P1-2 decision, won't-fix (−1) |
| 13 | Background jobs | 99 | **99** | DLQ documented (A20) but not wired — recipe posture, won't-fix (−1) |
| 14 | Observability | 99 | **99** | OTel — standing exclusion (−1) |
| 15 | Security | 99 | **99** | Static-CSP `'unsafe-inline'` default — deliberate, verified nonce recipe ships (−1) |
| 16 | Testing & CI | 99 | **100** | — (A28 made the visual lane live; `perf` staying variable-gated-off is the documented default posture, not a gap) |
| 17 | Deployment & ops | 92 | **92** | Real-host deploy never exercised — existing B1, gated (−8) |
| 18 | Docs & DX | 99 | **99** | 1 drift nit this pass (ci.yml comment mis-dated A28 "2026-07-13"), fixed (−1) |
| 19 | Internationalization | 97 | **98** | A30 closed (+2) · partial (primary-journey) coverage — deliberate, won't-fix (−1) · **A32 (new):** value formatting still bypasses the negotiated locale at every date call site (−1) |
| 20 | Realtime / SSE | 96 | **100** | — (A23/A24/A25 closed it) |
| | **Overall (mean)** | **97.5** | **98.2** | |

## Doc ↔ code drift (found this pass)

1. **`ci.yml` → `visual` job comment** dated A28's baseline commit + variable flip
   "2026-07-13" — the commits, the docs (UI.md / DEPLOYMENT.md / PROJECT_STATUS), and
   the variable's own timestamp (`2026-07-12T06:31Z`) all say **2026-07-12**. The
   doc-audit pass corrected the docs but missed the workflow comment. **Fixed**
   (comment-only edit — no behavior change).

Everything else in the changed surface checked clean, including: the TESTING.md
`@repo/ui` threshold rewrite (11/10/27/11 ↔ `packages/ui/vitest.config.ts`
byte-for-byte), the 25-module web coverage `include`, the six-package unit-test table
(email + jobs rows ↔ their vitest configs), the 19-spec E2E list, `DB_POOL_MAX` in
`.env.example` + both docs, the knip step's position in the DEPLOYMENT.md `verify`
list (now 9 steps, renumbered correctly), the A30 snippets' claims about 4.13.1
provider inheritance, and the en/es catalog parity for the A25 keys.

## New backlog item (A32)

| Id | Band | Area | Item | What it fixes / adds | Lifts | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A32 | B3 | i18n / UI | **Locale-aware value formatting at the date call sites** — wire `useFormatter().dateTime()` (+ a `formats`/`timeZone` block in `request.ts`) where the app renders dates; minimally the i18n-covered notifications feed | Seven `toLocale*()` call sites render dates in SSR-hydrated client components (`notifications-feed`, `post-item`, `uploads-list`, `sessions-card`, `passkeys-card`, `pending-invitations`, `/billing`). Two costs: they **bypass the negotiated locale** (an `/es` visitor gets browser-default formatting on an otherwise-localized page), and they carry the **SSR/client timezone hydration-mismatch risk** I18N.md's own A30 section warns about (`ENVIRONMENT_FALLBACK`) — invisible on a dev box where server TZ = browser TZ, real on a UTC production server (React recovers by re-rendering, but it's console noise + a re-render on every date-bearing page). The A30 recipe is the fix; this is its consumer half. | i18n +1 (and closes the report's one robustness nit on the realtime/UI surfaces) | S/M | none — display-only change |

**Existing backlog rows this audit re-affirms as score-lifting** (no new rows needed):
Real host deploy (B1 — Deployment +8) · Enable CodeQL (B1 — gated) · Stripe
live-verify (B2 — Payments +8) · A13 cancel-on-delete (B2 — Payments +2) ·
`post.list`/`listMine` uuid-cursor hardening (B2 — API +1) · Production email domain
(B3 — Email +4) · TS7 cutover (B4 — watch).

## Considered and excluded (visible decisions)

- **All eight exclusions from the 2026-07-12 report re-affirmed unchanged** (hosted
  realtime; notification preferences/digests; TanStack Table; OTel; per-account
  lockout; locale-routed authed sitemap/RTL/locale cookies; Stryker; blur
  placeholders/OG theming). Nothing in the A23–A31 closes changes their calculus.
- **A console-error assertion lane in Playwright** (fail a spec on unexpected browser
  console errors — would have surfaced A32's hydration risk mechanically). Considered
  and excluded: high false-positive rate (third-party SDK noise, React dev-only
  warnings differ per env) for one class of finding; A32 fixes the underlying issue
  directly.
- **Rate-limiting `markAllRead`** — an idempotent, self-scoped UPDATE with no fan-out;
  the send action (insert + NOTIFY broadcast) is the abusable one and is already
  limited 10/min/user. Adding a limit here would be cargo-cult.

## Won't-fix notes (deductions without backlog items)

Carried forward verbatim from the 2026-07-12 report (all re-checked, all still the
right call): magic-link recipe (Auth −1) · `updatePost` error shape (API −1) ·
`persist` unwired (State −1) · UT prod-callback (Uploads −2) · signed-in reindex
(Search −1) · DLQ recipe posture (Jobs −1) · static CSP (Security −1) · partial i18n
coverage (i18n −1) · OTel (Observability −1). New this pass: **typedRoutes NOT
adopted** (Framework −0 — a resolved decision with the alternative named is not a
missing feature).

## Prioritization statement

**Maintenance-only stands** — nothing here reopens feature work on its own. The local,
unblocked tail is now exactly two small rows, in value order: **the B2 uuid-cursor
hardening** (correctness-adjacent, trivial) → **A32** (locale-correct dates +
hydration hygiene). Both are S-effort and available whenever a maintenance window or a
fork's need picks them up. The externally-gated B1/B2 rows (real host deploy · CodeQL ·
Stripe test keys · email domain) remain the only items that move whole points, and
they move the moment their prerequisites appear. Bands in `BACKLOG.md` stay the single
source of truth; this report is the scoring record.
