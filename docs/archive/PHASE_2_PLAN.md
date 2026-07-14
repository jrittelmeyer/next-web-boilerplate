# Phase 2 Plan — Production-Hardening to 100/100

> **Status: ✅ complete — all 13 steps (17–29) done.** This is the Phase 2 build
> plan, written in the same shape as the Phase 1 work tracked in
> [PROJECT_STATUS.md](../PROJECT_STATUS.md). Phase 1 (Steps 1–16) delivered full-stack
> feature breadth. Phase 2 (Steps 17–29) closed the gaps that don't show up in a
> feature-by-feature build but matter the first time you ship: security, App Router
> resilience, and repo hygiene. See the [tracking table](#tracking) and
> PROJECT_STATUS.md for the per-step notes.
>
> Same working agreements as Phase 1: **gate every step on user sign-off**
> (present detailed plan → wait → build), **verify by building/running** (not by
> assuming), and **version-check every dependency against the npm registry**
> before adding it.

_Created: 2026-06-23 · against impl `cf58558` (end of Phase 1)._

## Why a Phase 2

Phase 1 scored ~**85/100** on an honest "production-ready" bar. The breadth is
complete and the supply-chain discipline is exceptional, but several gaps remain
that a true 100/100 boilerplate ships out of the box. Notably, three of them
deliver on promises the repo already makes:

- **RBAC** is routed from `CLAUDE.md` → `AUTH.md`, but no role model exists.
- The **`.dark` design tokens** ship (slate theme, `@custom-variant dark`), but
  there's no theme provider or toggle — the feature is half-built.
- **`sendWelcomeEmail`** (Step 9) is unwired; email verification / password reset
  is the flow that connects `@repo/email` to auth.

## Gap analysis

| # | Gap | Severity | Notes |
| --- | --- | --- | --- |
| 1 | No `error.tsx` / `global-error.tsx` / `not-found.tsx` / `loading.tsx` | High | Unhandled errors & 404s hit Next's default pages. `global-error.tsx` is also where Sentry catches render errors — its absence partially undermines Step 13. |
| 2 | No HTTP security headers / CSP | High | No `headers()` in `next.config.ts`: missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. A CSP compatible with PostHog/Sentry/Stripe/Uploadthing is exactly what a boilerplate should solve once. |
| 3 | Auth hardening unwired | High | No email verification, no password reset, no `trustedOrigins`/cookie-cache config. Step 9's `sendWelcomeEmail` is still a dangling thread. |
| 4 | RBAC promised, not delivered | Med-High | `CLAUDE.md` routes "RBAC" to `AUTH.md`, but there's no `role` column, no `adminProcedure`, no example. |
| 5 | No rate limiting (app-level) | Medium | Better Auth has defaults, but webhook / Server Actions / tRPC have none, and it's neither configured nor documented. |
| 6 | No SEO/PWA scaffolding | Medium | No `robots.ts`, `sitemap.ts`, `manifest.ts`, `metadataBase`, OG/Twitter defaults, `opengraph-image`, or favicons. Layout metadata is two lines. |
| 7 | No health endpoint / Docker HEALTHCHECK | Medium | No `/api/health` (DB ping); Dockerfile and compose have no `HEALTHCHECK`. Needed for the Docker/PaaS deploy story Step 15 sells. |
| 8 | No pre-commit hooks | Medium | Quality gate runs only in CI. No lefthook/husky + lint-staged running Biome/type-check on staged files. |
| 9 | No dependency/security automation | Medium | No Dependabot/Renovate, no CodeQL, no `pnpm audit` CI step — surprising given the project's supply-chain focus. |
| 10 | No community/editor files | Low | No `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, PR/issue templates, `.editorconfig`, or `.vscode/` recommendations. |
| 11 | Dark mode shipped but inert | Low-Med | `.dark` tokens + `@custom-variant` exist, but no `next-themes` provider or toggle. |
| 12 | Thin test depth + no a11y | Medium | 1 home smoke + 2 trivial unit tests. No auth-flow E2E, no DB integration test, no axe accessibility check, no enforced coverage. |
| 13 | No example domain entity / seed | Medium | Only table is auth; search indexes hardcoded docs. A boilerplate usually ships one entity end-to-end as the copy-me template. |

### Explicitly out of scope (by design)

- **i18n / localization** — left off intentionally; add a one-line decision note
  rather than a framework.
- RBAC (Step 21) and the example domain entity (Step 28) are the most
  opinionated additions; everything else is closer to table-stakes.

## Build plan (Steps 17–29)

Each step lists **scope**, **why**, and **verification**. "Full gate" =
`pnpm lint && pnpm type-check && pnpm build` all green, plus a live check where
the change is observable.

### Phase A — Production hardening

#### Step 17 — App Router resilience files

- **Scope:** add `apps/web/src/app/error.tsx` (client error boundary with reset),
  `global-error.tsx` (wired to `Sentry.captureException`, ships its own `<html>`),
  `not-found.tsx`, and a route-level `loading.tsx`. Add a shared error/empty-state
  UI primitive to `@repo/ui`.
- **Why:** without these, runtime errors and 404s render Next's defaults, and
  client render errors never reach Sentry — closing a hole left by Step 13.
- **Verify:** full gate; live — throw in a demo route → styled boundary + Sentry
  capture path exercised; hit an unknown path → custom 404.

#### Step 18 — HTTP security headers + CSP

- **Scope:** `headers()` (or proxy-applied) security headers — CSP, HSTS,
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`. CSP allowlists the wired SaaS (PostHog `/ingest`, Sentry,
  Stripe, Uploadthing). New `docs/context/SECURITY.md`; link from `CLAUDE.md`.
- **Why:** the single highest-value missing production control. The
  multi-origin CSP is precisely the kind of thing a boilerplate solves once.
- **Verify:** full gate; live — response headers present on `/`; CSP doesn't break
  PostHog proxy / Stripe redirect / Uploadthing; check against an online header
  scanner locally (`curl -I`).

#### Step 19 — Auth hardening

- **Scope:** enable email verification + password reset in Better Auth, wiring
  `sendVerificationEmail` / `sendResetPassword` to `@repo/email` (closes the
  `sendWelcomeEmail` thread). Add `trustedOrigins`, session cookie cache, and an
  explicit (documented) Better Auth `rateLimit` config. Update `AUTH.md`.
- **Why:** verification/reset are baseline for any real auth, and this is what
  finally connects the email package to a real flow.
- **Verify:** full gate; live — sign-up triggers a verification email render
  (preview or Resend test); reset flow round-trips; gate runs with email env unset.

#### Step 20 — Rate limiting (app-level)

- **Scope:** a shared limiter utility (in-memory default; optional Upstash/Redis
  driver via env) applied to the Stripe webhook, one sample Server Action, and a
  tRPC middleware. Document in `SECURITY.md` / `API.md`.
- **Why:** webhook and mutation endpoints are unprotected; a reusable limiter is
  the boilerplate-shaped solution.
- **Verify:** full gate; live — rapid calls past the limit return 429 / typed
  error; degrades to no-op (or in-memory) when Redis env is unset.

#### Step 21 — RBAC

- **Scope:** `role` column on `user` (migration), an `adminProcedure` in tRPC, a
  role-aware Server Action example, and the `proxy`/page guard pattern for an
  admin area. Deliver on the `AUTH.md` RBAC promise.
- **Why:** the docs route users here for RBAC; nothing implements it.
- **Verify:** full gate + migration applied; live — non-admin hits
  `adminProcedure` → `FORBIDDEN`; admin succeeds. Row roles confirmed in Postgres.

### Phase B — Observability & ops

#### Step 22 — Health endpoint + request telemetry

- **Scope:** `/api/health` (liveness + a DB ping for readiness), `HEALTHCHECK` in
  `docker/Dockerfile` and both compose files, and a tRPC timing/error-logging
  middleware that feeds BetterStack/Sentry. Update `DEPLOYMENT.md`.
- **Why:** the Docker/PaaS deploy story needs a probe target; request telemetry
  makes the Step 13 observability stack actually carry traffic signal.
- **Verify:** full gate; live — `/api/health` 200 with DB up, 503 with DB down;
  `docker run` reports `healthy`; a tRPC call emits a structured log line.

### Phase C — SEO & UX polish

#### Step 23 — SEO / PWA scaffolding

- **Scope:** `metadataBase`, OpenGraph + Twitter card defaults, a title template
  in the root layout; `robots.ts`, `sitemap.ts`, `manifest.ts`, a dynamic
  `opengraph-image`, and favicon/apple-icon set.
- **Why:** standard for a modern app; the current metadata is two lines.
- **Verify:** full gate; live — `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`
  serve; OG image renders; `<head>` carries the card tags.

#### Step 24 — Dark mode

- **Scope:** `next-themes` provider (no SSR flash; `suppressHydrationWarning`) and
  a theme toggle component in `@repo/ui`, consuming the already-shipped `.dark`
  tokens. Update `UI.md` / `STATE.md` (theme is client UI state).
- **Why:** the design tokens already ship; the toggle is the missing half.
- **Verify:** full gate; live — toggle flips `.dark` on `<html>`, tokens recolor,
  no hydration warning, choice persists.

### Phase D — Repo hygiene & supply chain

#### Step 25 — Git hooks

- **Scope:** lefthook (or husky) + lint-staged: Biome check + `tsc` on staged
  files pre-commit; optional commit-message convention. Document in `CONVENTIONS.md`.
- **Why:** the quality gate only runs in CI today; catch issues before push.
- **Verify:** full gate; live — a staged lint violation blocks the commit; a clean
  staged change passes.

#### Step 26 — Dependency & security automation

- **Scope:** Renovate (or Dependabot) config tuned to the repo's
  `minimumReleaseAge`/pinning policy; a CodeQL workflow; a `pnpm audit` /
  supply-chain CI step; coverage upload + enforced thresholds. Update
  `DEPLOYMENT.md` / `TESTING.md`.
- **Why:** the repo obsesses over dependency provenance but has no CI enforcement
  or automated update path — the most on-brand gap to close.
- **Verify:** CI green with new jobs; a deliberately stale/vulnerable dep is
  flagged; coverage gate fails below threshold.

#### Step 27 — Community & editor files

- **Scope:** `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `.github/PULL_REQUEST_TEMPLATE.md` + issue templates, `.editorconfig`, and
  `.vscode/extensions.json` + `settings.json` (Biome default formatter, Tailwind
  IntelliSense, Playwright, markdownlint).
- **Why:** standard OSS/clone-ready hygiene; the `.vscode` recommendations make
  the Biome/Tailwind/markdownlint toolchain work on first open.
- **Verify:** files present and valid; `.editorconfig` doesn't fight Biome; gate
  stays green.

### Phase E — Depth & the copy-me template

#### Step 28 — Example domain entity (end-to-end)

- **Scope:** one real entity (e.g. `post`) end-to-end: schema + migration → tRPC
  query (`publicProcedure`) → Server Action mutation → UI page → Meilisearch
  indexing on write (replacing the hardcoded `EXAMPLE_DOCUMENTS`) → a `db:seed`
  script. Document the pattern in `ARCHITECTURE.md` / `DATABASE.md`.
- **Why:** turns the scattered demos into one coherent copy-me template and proves
  the read/write split on real rows.
- **Verify:** full gate + migration + seed; live — create via action → appears in
  query + search; `pnpm --filter @repo/db db:seed` populates rows.

#### Step 29 — Testing depth

- **Scope:** an auth-flow E2E (sign-up → verify → protected route), a DB-backed
  integration test for a Server Action / tRPC procedure, an axe accessibility
  check in Playwright, and enforced `coverage.thresholds`. Update `TESTING.md`.
- **Why:** current tests are a smoke + two trivial units; the patterns a team
  copies should be demonstrated.
- **Verify:** `pnpm test` + `pnpm test:e2e` green including the new specs; axe
  reports no critical violations; coverage gate enforced.

## Sequencing notes

- **A → B first.** Steps 17–22 are correctness/security and unblock confidence in
  everything downstream. C/D/E can reorder freely.
- **Step 28 before 29** if you want the new tests to target a real entity rather
  than the demo scaffold.
- Each step keeps the "scaffold + example, graceful when unconfigured" posture and
  the cross-platform (Windows-safe) build constraints established in Phase 1.

## Tracking

Update [PROJECT_STATUS.md](../PROJECT_STATUS.md) at the end of every step exactly as
Phase 1 did (build-progress row + a "Step N notes / carry-overs" block), and check
each step off the table below.

| Step | Area | Status |
| --- | --- | --- |
| 17 | App Router resilience files | ✅ done |
| 18 | Security headers + CSP | ✅ done |
| 19 | Auth hardening (verify/reset/limits) | ✅ done |
| 20 | Rate limiting | ✅ done |
| 21 | RBAC | ✅ done |
| 22 | Health endpoint + request telemetry | ✅ done |
| 23 | SEO / PWA scaffolding | ✅ done |
| 24 | Dark mode | ✅ done |
| 25 | Git hooks | ✅ done |
| 26 | Dependency & security automation | ✅ done |
| 27 | Community & editor files | ✅ done |
| 28 | Example domain entity (end-to-end) | ✅ done |
| 29 | Testing depth | ✅ done |
