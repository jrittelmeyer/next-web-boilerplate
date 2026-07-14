# Project Audit — 2026-07-08 (100/100 scoring pass)

> The `/project-audit` skill's first run (`.claude/skills/project-audit/SKILL.md`).
> **Method:** read every doc (`PROJECT_STATUS` · `BACKLOG` · `VERIFICATION` · all 13
> `docs/context/*`), then swept the code — root configs, `apps/web/src` (env, next.config,
> proxy, tRPC core + route, webhook, rate-limit, org/rbac libs), every `packages/*` +
> `tooling/*`, CI workflows, Dockerfile/compose, all 12 E2E specs, vitest/coverage
> configs — spot-checking doc claims (file paths, counts, env-gating, matchers) against
> the source. Scores grade against **the best conceivable production starter today**,
> not against the repo's own history. Rubric per group: correctness & robustness (30) ·
> completeness vs. today's best practice (25) · security (15) · performance (10) ·
> testing (10) · docs & DX (10). Every deduction maps to a backlog item (A-numbers are
> new from this audit; named items are pre-existing `BACKLOG.md` rows) or an explicit
> won't-fix note.
>
> **Headline: overall 93/100.** No correctness bugs found. Doc ↔ code alignment is
> excellent — 7 drift points, all doc-side, all minor (stale counts/lists from the 2FA +
> Organizations ships), all **fixed in this pass**. The distance to 100 is dominated by
> (a) two externally-gated verifications (real-host deploy, Stripe live keys) and
> (b) a short list of table-stakes conveniences (toasts, subscription gating, cron
> example, pooling guidance) enumerated below.

## Score table

| # | Feature group | Score | Dominant deductions |
| --- | --- | --- | --- |
| 1 | Monorepo & tooling | **97** | A10 dep-consistency check (−2) · A11 flip pnpm release-age gate (−1) |
| 2 | Framework & app architecture | **94** | A6 next/image remotePatterns (−2) · A17 next/font recipe (−2) · perf budgets in CI, existing B3 (−2) |
| 3 | Database | **90** | Backup/restore/DR runbook, existing B2 (−5) · A4 pooling guidance (−3) · A15 transaction example (−2) |
| 4 | Auth & access control | **93** | Passkeys, existing B3 (−3) · A12 CAPTCHA recipe (−2) · A18 magic-link recipe (−1) · audit-log share, existing B2 (−1) |
| 5 | API layer (tRPC + Actions) | **96** | A16 user-keyed rate-limited procedure example (−2) · A7 fieldErrors convention share (−2) |
| 6 | UI & design system | **88** | Dialog tall-content bug, existing B3 (−4) · A1 toast primitive (−4) · A14 skeleton primitive (−2) · visual regression, existing B3 (−2) |
| 7 | State & data fetching | **97** | A21 URL-state pattern doc (−2) · `persist` unwired is deliberate — won't-fix (−1) |
| 8 | Forms & validation | **96** | A7 typed `fieldErrors` ActionResult convention (−4) |
| 9 | Email | **93** | Production domain/deliverability, existing B3 (−4) · A5 template render smoke tests (−3) |
| 10 | Payments (Stripe) | **84** | Live-verify Phase 5, existing B2, gated (−8) · A2 subscription-gating example (−4) · A13 cancel-on-delete (−2) · per-org billing, documented deferral (−2) |
| 11 | File uploads | **95** | A6 share: uploaded images bypass next/image optimization (−3) · UT prod-callback needs a public URL — platform property, won't-fix (−2) |
| 12 | Search | **97** | A8 settings on first index-creating write (−3) |
| 13 | Background jobs | **92** | A3 cron/scheduled job example (−4) · slim worker image, existing B3 (−2) · A20 failed-job observability note (−2) |
| 14 | Observability | **96** | Consent gate, existing B3 share (−3) · OTel excluded — see below (−1) |
| 15 | Security | **94** | Audit-log surface, existing B2 (−3) · A9 security.txt (−2) · static-CSP `'unsafe-inline'` default — deliberate, nonce recipe ships; residual (−1) |
| 16 | Testing & CI | **91** | Docker-image CI + Trivy, existing B2 (−4) · perf budgets, existing B3 (−3) · A5 share: `@repo/email` has zero tests (−2) |
| 17 | Deployment & ops | **89** | Real-host deploy never exercised, existing B1, gated (−8) · opt-in image-publish (GHCR) leg — folded into the Docker-image-CI row (−3) |
| 18 | Docs & DX | **96** | 7 drift points found, fixed this pass (−2) · A19 per-integration removal checklists (−2) |
| | **Overall (mean)** | **93** | |

## Doc ↔ code drift (all fixed in this pass)

All seven are doc-side staleness from the 2026-07-08 2FA + Organizations ships; **no
code gaps** (nothing a doc promises is missing from the code):

1. **AUTH.md → Protected Routes** listed `/dashboard/*, /account/*, /admin/*` — the
   proxy also gates `/organization/*` (`apps/web/src/proxy.ts` PROTECTED_PREFIXES +
   matcher). Fixed.
2. **SECURITY.md → Where the headers live** — same matcher list missing `/organization`. Fixed.
3. **VERIFICATION.md Phase 2** expected-spec list omitted `organization.spec.ts` +
   `two-factor.spec.ts` (the suite is 12 specs). Fixed.
4. **VERIFICATION.md Phase 1** email export said "7 HTML files" — 8 templates now
   (`organization-invitation` added). Fixed.
5. **SERVICES.md → Resend structure block** — missing `sendOrganizationInvitationEmail`
   + `templates/organization-invitation.tsx`. Fixed.
6. **AUTH.md → Package Structure** — `config.ts` helper list showed 4 of 6 (missing
   `invitationAcceptUrl`, `twoFactorIssuer`); "22 hermetic unit tests" → 28 now. Fixed.
7. **TESTING.md → Coverage table** — web coverage `include` said "twelve as of P3-5";
   it's sixteen modules now (adds `actions/avatar.ts`, `lib/avatar.ts`,
   `lib/organization.ts`, `lib/slugify.ts`). Fixed.

## New backlog items (A1–A22)

Inclusion policy applied (owner's standing rule): majority-benefit + low-risk →
included; greatly-beneficial + moderate-cost → included unless advised against
(see the excluded list). **Prioritized by value to the widest variety of downstream
projects** — breadth first, then depth, then effort as tiebreak — and mapped onto the
repo's band convention (B1 do-next … B4 pivot-only) so it merges into `BACKLOG.md`
without a second scheme.

| Id | Band | Area | Item | What it fixes / adds | Lifts | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | B1 | UI | **Toast primitive (`sonner`)** in `@repo/ui` + wire the existing inline-status surfaces (e.g. avatar removed, role changed) | Every app needs transient notifications; today every surface uses inline status text | UI +4 | S | none (version-check dep) |
| A2 | B1 | Payments | **Subscription-gating helper + worked gated surface** — `hasActiveSubscription(userId)` reading the local `subscriptions` table + one gated example component/route | The C4 table is written but never *used*; the #1 thing a SaaS fork does | Payments +4 | S | none (no Stripe creds needed; unit-testable) |
| A3 | B1 | Jobs | **Scheduled/cron job worked example** (pg-boss `schedule()` — e.g. a nightly cleanup) | Most apps need periodic tasks; the queue only demonstrates event-driven jobs | Jobs +4 | S | none |
| A4 | B1 | DB | **Serverless/managed-Postgres pooling guidance** — pool sizing, PgBouncer/Neon/Supabase pooler notes, Vercel-serverless caveats for `pg.Pool` | Most real deploys hit managed PG + pooling on day one; undocumented today | DB +3 | S (docs) | none |
| A5 | B1 | Email | **Template render smoke tests** in `@repo/email` — render all 8 templates (HTML + plain-text) in Vitest | The only package with zero tests; render breakage currently surfaces only via manual `email export` | Email +3 · CI +2 | S | none |
| A6 | B1 | Framework | **`next/image` `remotePatterns`** for `*.ufs.sh` + one worked remote-image usage | First fork using `next/image` on an uploaded file hits the unconfigured-host error; uploads/avatars currently render unoptimized `<img>` | Framework +2 · Uploads +3 | S | none |
| A7 | B1 | Forms | **Typed `fieldErrors` ActionResult convention** — extend `{ error }` with per-field errors + one worked form mapping them to RHF `setError` | Actions currently surface only the first Zod issue as one string | Forms +4 · API +2 | M | small churn in existing actions |
| A8 | B1 | Search | **Apply `POSTS_INDEX_SETTINGS` on the first index-creating write** (cached once-per-process ensure), closing the documented "defaults until first reindex" gap | Fresh index born from `createPost` currently has `id` searchable + drifting defaults | Search +3 | S | one settings roundtrip, once |
| A9 | B1 | Security | **`/.well-known/security.txt`** (RFC 9116) with a placeholder contact | Table-stakes prod hygiene; zero risk | Security +2 | S | none |
| A10 | B1 | Tooling | **Workspace dependency-consistency check** in CI (`syncpack`/`manypkg`) | Duplicated pins (drizzle-orm, react-hook-form, lucide-react) are hand-synced today | Tooling +2 | S | none |
| A11 | B1 | Tooling | **Enable pnpm install-time `minimumReleaseAge`** (the commented block in `pnpm-workspace.yaml`) — the tree has aged past the 7-day window its note was waiting on | Closes the install-time half of the supply-chain gate | Tooling +1 | S | verify no <7-day pin first; CI breaks if one remains |
| A12 | B2 | Auth | **Opt-in CAPTCHA recipe** — Better Auth `captcha()` plugin + Cloudflare Turnstile, env-gated like every integration | Bot signups; IP rate-limiting alone doesn't stop distributed registration abuse | Auth +2 | M | UX friction — opt-in, off by default |
| A13 | B2 | Payments | **Cancel Stripe subscription in `deleteUser.beforeDelete`** (gated on `isStripeConfigured()`), implementing the documented caveat | Account deletion currently leaves Stripe billing a deleted user | Payments +2 | S | cancellation policy is a product choice — implement the safe default (cancel at period end), document alternatives |
| A14 | B2 | UI | **`Skeleton` primitive** + one per-component loading example | Standard shadcn primitive; `loading.tsx` covers routes but not component-level loading | UI +2 | S | none |
| A15 | B2 | DB | **Worked `db.transaction` example** in the copy-me entity (multi-statement write) | The template never demonstrates transactional writes | DB +2 | S | none |
| A16 | B2 | API | **User-keyed protected + rate-limited procedure** worked example (the variant trpc.ts's comment describes but nothing implements) | Copy-me for authenticated abusable reads | API +2 | S | none |
| A17 | B3 | Framework | **`next/font` self-hosted font recipe** (opt-in; system stack stays the default) | Most real projects add a brand font; the CSP/font-src notes exist but no wiring recipe | Framework +2 | S | none |
| A18 | B3 | Auth | **Magic-link / email-OTP recipe** (docs — Better Auth plugin pointers, degradation posture) | Popular auth mode; currently unmentioned in Available Plugins | Auth +1 | S (docs) | none |
| A19 | B3 | Docs | **Per-integration removal checklists** ("delete Stripe / search / uploads entirely" — files, deps, env, CSP entries) | The majority of forks won't use every integration; only `@repo/observability` has removal steps today | Docs +2 | M (docs) | none |
| A20 | B3 | Jobs | **Failed-job observability note** — pg-boss retry limits, where failed jobs land, how to inspect/requeue | Silent-failure story is undocumented past "throws → retries" | Jobs +2 | S (docs) | none |
| A21 | B3 | State | **"State in the URL" pattern doc** (native `searchParams`/`useSearchParams`, when it beats Zustand) | Filter/tab/pagination state belongs in the URL; STATE.md doesn't cover it | State +2 | S (docs) | none |
| A22 | B4 | Realtime | **SSE / realtime notifications worked example** (route-handler SSE, optionally Postgres LISTEN/NOTIFY) | Many apps eventually need live updates; big new surface with serverless caveats | new capability | L | serverless/platform-dependent — pivot-only |

**Existing backlog rows this audit re-affirms as score-lifting** (no new rows needed;
lift noted here): Real host deploy (B1 — Deployment +8) · DB backup/DR (B2 — DB +5) ·
Stripe live-verify (B2 — Payments +8) · Audit-log surface (B2 — Security +3, Auth +1) ·
Docker-image CI + Trivy (B2 — CI +4, Deployment +3; **extend with an opt-in
image-publish (GHCR) leg**) · Passkeys (B3 — Auth +3) · Consent + GDPR export (B3 —
Observability +3) · Perf budgets (B3 — CI +3, Framework +2) · Email domain (B3 —
Email +4) · Slim worker (B3 — Jobs +2) · Visual regression (B3 — UI +2) · Dialog fix
(B3 — UI +4).

## Considered and excluded (visible decisions)

- **OpenTelemetry migration** — Sentry already provides tracing; OTel adds a config
  surface most forks won't use. Revisit only on a concrete vendor-neutrality need.
- **Local dev mailbox (Mailpit) + SMTP fallback** — a new infra service for a path the
  console-logged action links already cover. The Resend-only posture is the stack choice.
- **nuqs (URL-state dependency)** — pattern documented instead (A21); no dep needed.
- **Soft-delete pattern** — product-decision-specific, not majority-beneficial.
- **tRPC → OpenAPI/REST generation** — niche; the API surface is app-internal.
- **Second app in the monorepo (docs/marketing site)** — real value but permanent
  maintenance weight on every fork; the structure already demonstrates the wiring.
- **COEP/CORP headers** — already deliberate omissions with documented rationale (SECURITY.md).
- **Per-account lockout (beyond IP rate limits + HIBP)** — marginal over the existing
  5/min sign-in cap; revisit with the audit-log item, which is the prerequisite.
- **Admin CRUD generator** — out of scope for a starter; the `/admin` pattern is the template.

## Won't-fix notes (deductions without backlog items)

- **Zustand `persist` unwired** — deliberate: SSR-hydration-safe opt-in recipe is the
  right default (STATE.md).
- **Uploadthing prod-callback on localhost** — platform property (inbound callback
  needs a public URL); documented with the dev-mode verification path (VERIFICATION.md ⚠️).
- **Static CSP `'unsafe-inline'` default** — deliberate tradeoff with a verified nonce
  upgrade recipe in-repo (SECURITY.md / DECISIONS.md); residual −1 acknowledges the
  weaker default without re-litigating the decision.
- **Scaffold demo routes** (`/state`, `/billing`, `/search`, …) — by design; the
  delete-me table in ARCHITECTURE.md governs them.

## Prioritization statement

Order of work for the biggest-variety-of-projects value: **A1 → A2 → A3 → A4 → A5 →
A6 → A7 → A8 → A9 → A10 → A11** (all local, low-risk, each lifting a group most forks
touch), then the externally-gated B1s (real-host deploy · CodeQL) whenever unblocked,
then B2 (existing DB-backup/Stripe/audit-log/Docker-CI rows + A12–A16), then B3
(recipes/docs + existing rows), then B4 (pivot-only). Bands in `BACKLOG.md` are the
single source of truth going forward; this report is the scoring record.
