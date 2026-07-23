# What's included — and why

This is the full inventory of what the boilerplate ships and the reasoning behind each
choice. Treat it as two things at once: a pitch (what you get by starting here instead
of `create-next-app`) and a decision record (why each piece is the right default in
2026, so you can re-evaluate honestly as the ecosystem moves).

Every claim below is backed by a deeper doc — each section links to the
[`docs/context/`](context/) file that holds the implementation detail, and
[`VERIFICATION.md`](VERIFICATION.md) holds the dated, hands-on proof that each feature
works end-to-end.

## The 30-second pitch

- **It boots with exactly two env vars** — `DATABASE_URL` and `BETTER_AUTH_SECRET`,
  both pre-filled in `.env.example` with working local values. Every one of the ~12
  third-party integrations is optional and **degrades gracefully when unconfigured**:
  the app builds, runs, and tests green with zero API keys.
- **Every integration has been verified live**, not just wired: real Resend sends,
  real Stripe checkouts (including dunning via test clocks), real OAuth logins, a real
  Fly.io deploy with a managed Postgres. The dated proof is in
  [`VERIFICATION.md`](VERIFICATION.md).
- **Every architectural decision is written down** — including the ones that were
  evaluated and *rejected* (see [What's deliberately not included](#whats-deliberately-not-included)).
  When you disagree with a choice, you'll find its rationale, not a shrug.
- **It's built for agent-assisted development**: [`AGENTS.md`](../AGENTS.md) plus 14
  focused context docs give a coding agent (or a new human teammate) exactly the
  context it needs per task, without loading everything at once.

## See it

The public landing (light **and** dark) and the gated app shell, captured from a real
keyless run — the same two-env-var setup you get on `git clone`, no third-party keys:

<table>
  <tr>
    <td width="50%"><img src="assets/landing-light.png" alt="Landing page in light mode"><br><sub>Landing · light</sub></td>
    <td width="50%"><img src="assets/landing-dark.png" alt="Landing page in dark mode"><br><sub>Landing · dark</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/dashboard.png" alt="Signed-in dashboard shell"><br><sub>Signed-in dashboard shell</sub></td>
    <td width="50%"><img src="assets/account.png" alt="Account profile and security settings"><br><sub>Account · profile &amp; security</sub></td>
  </tr>
</table>

The shared UI primitives also have a live [Storybook gallery](https://jrittelmeyer.github.io/next-web-boilerplate/).

## Core platform

| What | Choice |
| --- | --- |
| Framework | Next.js 16 — App Router, React 19 |
| Compiler defaults | **React Compiler ON** (auto-memoization) · **Cache Components / PPR ON** (`"use cache"`, static shells + streamed dynamic holes) |
| Language | TypeScript 6, `strict` |
| Runtime | Node.js 24 (Active LTS) |
| Monorepo | Turborepo 2.x + pnpm 11 workspaces |

**Why:** a 2026 boilerplate should *demonstrate* the modern Next.js rendering model,
not just list it. React Compiler and Cache Components are on by default with worked
examples (`/posts` renders a static shell while a `"use cache"` post-count, the
session-aware composer, and the paginated feed each stream in), so the out-of-the-box
posture is the current one — manual `useMemo` and route-segment `dynamic` exports are
the exception, not the rule. TS 6 rather than TS 7 is deliberate: TS 7's Go compiler
GA'd without the JS Compiler API that `next build` needs (tracked in
[`BACKLOG.md`](BACKLOG.md)). → [`context/STACK.md`](context/STACK.md)

## Database & data safety

- PostgreSQL + **Drizzle ORM** (node-postgres `Pool`), schema + committed SQL
  migrations in `@repo/db` — `db:migrate` works on a fresh clone with no codegen step.
- A **copy-me example entity (`posts`)** demonstrating the full stack of patterns:
  keyset (cursor) pagination, composite + FK indexes, optimistic UI, an atomic
  multi-table transaction (`post_revisions`), org-scoping, and search indexing.
- **Backup / restore / disaster-recovery runbook** with `db:backup` / `db:restore`
  scripts (`-Fc` dumps), PITR pointers, and a rehearsed restore drill.
- Idempotent seed script, connection-pooling guidance, and a `DB_POOL_MAX` deploy knob.

**Why Drizzle over Prisma:** smaller bundle, no codegen step (works cleanly with
Turbopack), closer to SQL, edge-native. Prisma 7 closed much of the performance gap,
but Drizzle remains the leaner default for a starter you'll build on top of.
→ [`context/DATABASE.md`](context/DATABASE.md)

## Authentication & authorization

Better Auth, self-hosted in your own Postgres, with the full hardening ladder already
climbed:

- Email/password with **email verification**, password reset, and a
  **compromised-password (HIBP) check**.
- **OAuth** (GitHub + Google) — env-gated: each provider registers only when its
  key pair is present — and **magic-link sign-in**, env-gated on email config so the
  affordance and endpoints appear/disappear together.
- **Two-factor auth** (TOTP + backup codes, inline enroll + sign-in challenge,
  trust-device opt-in) and **passkeys / WebAuthn** (no new env vars, no CSP changes).
- **Organizations / multi-tenancy** — teams, per-org roles, invitations with a
  graceful no-email fallback, and an org-scoped `posts` example (NULL = personal
  workspace, so zero-org installs behave exactly as before).
- **RBAC done authoritatively**: role checks read fresh from Postgres at the boundary,
  not from the cookie-cached session — a demotion bites immediately.
- **Admin surface**: user management with ban + impersonation (Better Auth's `admin()`
  plugin adopted to *augment* the hand-rolled RBAC, not replace it), plus a
  **persisted audit log** with a keyset-paginated `/admin/audit` viewer.
- **Account page**: sessions list + revoke, two-hop email change with session
  revocation, avatar upload, danger-zone deletion (which also cancels the user's
  Stripe subscription via a background job).
- Opt-in **CAPTCHA** (Cloudflare Turnstile) and **database-backed rate-limit storage**
  so auth rate limits survive multi-instance deploys.

**Why Better Auth over Clerk / NextAuth:** self-hosted (no vendor lock-in, no MAU
pricing), your user data stays in your Postgres, and a clean plugin architecture
covers 2FA/passkeys/orgs/admin without third-party services. Auth.js remains a
legitimate alternative; the trade-offs are documented honestly.
→ [`context/AUTH.md`](context/AUTH.md)

## API layer

- **tRPC v11 for reads** (`@trpc/tanstack-react-query`, RSC prefetch + hydration) and
  **Server Actions for writes** (`{ error } | { data }` results with typed field
  errors).
- Rate-limited procedure variants, superjson transformer (Dates round-trip), request
  telemetry middleware with serverless-safe log flushing (`next/after`).
- **Realtime notifications** as a worked example: Postgres LISTEN/NOTIFY → Server-Sent
  Events → the TanStack Query cache, with reconnect backfill, an authoritative unread
  badge, and a persisted `notifications` table so nothing is lost when a tab is closed.

**Why the split:** Server Actions have the best progressive-enhancement story for
mutations (forms work without JS); tRPC gives end-to-end type safety for complex reads
without a schema language. One convention, applied everywhere.
**Why SSE over a hosted realtime service:** no new infrastructure — it reuses
`DATABASE_URL` and the native `EventSource`, and is correct across instances.
→ [`context/API.md`](context/API.md)

## State, forms & validation

- **The read-model boundary**: server state lives in TanStack Query, ephemeral client
  UI state in Zustand, shareable view state in the URL — with a litmus test ("if two
  tabs disagreed, is that a bug?") and worked examples of each, including optimistic
  updates and realtime cache feeding.
- **React Hook Form + Zod v4**, with schemas shared client + server via
  `@repo/validators` so validation is written once.

→ [`context/STATE.md`](context/STATE.md) · [`context/UI.md`](context/UI.md)

## UI

- **Tailwind CSS v4** (CSS-first config, design tokens in a shared package) +
  **shadcn/ui** primitives in `@repo/ui`, configured for monorepo mode.
- Class-based **dark mode** (next-themes, no-flash), **Storybook** component gallery,
  and an opt-in **visual-regression lane** (Playwright screenshots over the gallery,
  both themes).
- Worked patterns: forms, layouts, loading skeletons, dialogs (with the tall-content
  fix upstreamed into the primitive), toasts.

→ [`context/UI.md`](context/UI.md)

## Internationalization

- **next-intl** with `[locale]` path routing (`en` + `es` shipped, **full-surface
  message coverage** — identical key trees across locales), per-locale SEO
  (hreflang, localized sitemap), locale-aware date/number formatting, and a
  `LanguageSwitcher`.
- `localePrefix: "as-needed"` keeps default-locale URLs unprefixed — adding i18n
  changed no existing URL and broke no existing test.

**Why URL-segment locales:** it's the only strategy that stays statically
prerenderable under the Cache Components / PPR posture, and it gives real per-locale
URLs for SEO for free. Cookie/header-based locales force every route dynamic.
→ [`context/I18N.md`](context/I18N.md)

## Payments

- **Stripe hosted Checkout** → webhook → a `subscriptions` table in your DB (insert on
  `checkout.session.completed`, updates by subscription id), customer reuse, the
  **billing portal**, `invoice.payment_failed` dunning sync, subscription-gated
  content (`/premium`), and cancel-subscription-on-deletion via a background
  job (account **and** organization deletion).
- **Per-org billing**: subscriptions belong to a user *or* an organization
  (XOR-checked in the schema) — with an active org, checkout/portal are org-scoped
  and owner/admin-gated, and one org subscription entitles every member on
  `/premium`. Seat-quantity billing is a documented non-goal the schema doesn't
  preclude.
- Verified end-to-end in test mode: checkout, webhook idempotency, portal, and
  dunning-to-`past_due` driven by Stripe **test clocks**.

**Why hosted Checkout:** it's the PCI-lightest, fastest-to-revenue integration and
needs no client-side Stripe SDK; embedded Elements is a documented upgrade, not a
prerequisite. → [`context/SERVICES.md`](context/SERVICES.md)

## Email

- **Resend + React Email**: typed JSX templates, a plain-text part on every send,
  verification/reset/welcome/email-change/magic-link flows wired, and a production
  **deliverability recipe** (SPF/DKIM/DMARC) that has been proven against a real
  sending domain.
- **Bounce/complaint suppression**: a signature-verified Resend webhook feeds an
  `email_suppressions` do-not-send list that every send helper consults — permanent
  bounces and complaints stop future sends instead of eroding sender reputation.
- Fully graceful: with no API key, sends log-and-no-op, sign-up yields an immediate
  session, and org invitations fall back to a copyable accept link.

→ [`context/SERVICES.md`](context/SERVICES.md)

## Uploads, search, background jobs

- **Uploadthing** file uploads persisted to an `uploads` table, with a read path,
  remote-first fail-closed deletion, and avatar wiring.
- **Meilisearch** with index settings as code, indexing on DB write, and an
  admin-gated, rate-limited bulk reindex action.
- **pg-boss background jobs** (`@repo/jobs`): a worker + thin `enqueue()` helper,
  welcome-email and Stripe-cancel jobs as worked examples, a **dead-letter queue**
  with a watched consumer (console + env-gated Sentry) so exhausted jobs surface
  instead of vanishing, and a slim esbuild-bundled worker image (~169 MB vs ~1.57 GB
  naive).

**Why pg-boss over BullMQ/Redis or a hosted queue:** zero new infrastructure — it
reuses your Postgres. If the worker is down, jobs queue and drain later; the app
builds and runs with the worker never started.
→ [`context/SERVICES.md`](context/SERVICES.md)

## Observability

- **Sentry** (v10 instrumentation, source-map upload in CI), **BetterStack** logging
  (console fallback when unset) with **dashboards-as-code** (uptime monitors +
  worker heartbeats synced idempotently from typed config), and **PostHog** analytics
  + server-side feature flags.
- **Opt-in OpenTelemetry**: set `OTEL_EXPORTER_OTLP_ENDPOINT` and server traces
  export via OTLP/HTTP to any OTel backend — riding the Sentry SDK's own OTel
  provider (no double-instrumentation), with or without a Sentry DSN.
- **Privacy-first defaults**: analytics is consent-gated (opt-out by default, a real
  consent banner) and a GDPR **data export** ships with an allowlist-redacted
  `buildDataExport()`.
- `/api/health` readiness endpoint + request telemetry on every tRPC call.

→ [`context/SERVICES.md`](context/SERVICES.md)

## Security

- Full security-header set with **two supported CSP modes**: the **static default**
  (`'unsafe-inline'`, keeps the static/PPR rendering posture) and the env-gated
  **`CSP_MODE=nonce`** (per-request `'nonce-…' 'strict-dynamic'`, no script
  `'unsafe-inline'` — the gold standard; pages render dynamically), each proven by
  its own CI lane. One shared directive list so the modes can't drift.
- COOP cross-origin isolation, `security.txt` (RFC 9116), opt-in CSP violation
  reporting, and app-level **rate limiting** (in-memory by default, Upstash Redis as
  the distributed driver, hardened client-IP resolution behind proxies).
- Supply-chain posture: a **7-day minimum release age** enforced at both the Renovate
  layer and the pnpm install layer, SHA-pinned workflow actions, `pnpm audit` in CI,
  Trivy image scanning, CycloneDX SBOM + SLSA provenance attestations, and CodeQL.

→ [`context/SECURITY.md`](context/SECURITY.md) · [`context/DEPLOYMENT.md`](context/DEPLOYMENT.md)

## Testing & CI

- **Vitest 4** unit/component suites across every package (jsdom for UI, coverage
  thresholds enforced), **Playwright** E2E including auth lifecycles, security-header
  assertions, i18n, and **axe accessibility scans over seven surfaces** (four public,
  three signed-in), plus DB integration tests.
- The entire unit/coverage suite runs **with zero keys and no database**; integration
  + E2E need only the local Docker Postgres.
- CI lanes: `verify` (lint, type-check, manypkg pin-consistency, **knip** dead-code
  gate, build), `audit`, `e2e`, `docker-image` (builds both images, health-smokes
  them against a throwaway Postgres, Trivy-gates), and opt-in visual / CSP-nonce /
  perf / CodeQL / GHCR-publish lanes.
- Git hooks: lint-staged pre-commit, type-check pre-push, commit-message sanity.

→ [`context/TESTING.md`](context/TESTING.md) · [`context/DEPLOYMENT.md`](context/DEPLOYMENT.md)

## Deployment

- **Platform-agnostic Docker**: multi-stage Dockerfile (web + slim worker targets),
  dev and production docker-compose files, health checks wired for orchestrators.
- A **worked, proven Fly.io runbook** (app + managed Postgres + secrets + migrate +
  deploy), with Vercel / Railway / self-host paths documented.
- **Renovate** dependency automation with digest-pinned actions, plus performance
  budgets (`size-limit`) and bundle analysis as opt-in lanes.

**Why Docker-first:** the boilerplate targets many possible hosts; a Dockerfile +
`next start` is portable everywhere, and platform-specific conveniences stay additive.
→ [`context/DEPLOYMENT.md`](context/DEPLOYMENT.md)

## What's deliberately NOT included

Choices evaluated and rejected — with reasons — are as load-bearing as the ones that
shipped. The full record is [`context/DECISIONS.md`](context/DECISIONS.md); highlights:

- **`typedRoutes`** — prototyped end-to-end and rejected: under `[locale]` routing its
  checking is vacuous-or-wrong for the URLs this app actually navigates, and the net
  diff was six casts *suppressing* checks. next-intl's `pathnames` map is the right
  tool if typed hrefs are ever wanted.
- **Nonce CSP as the default** — the gold-standard CSP conflicts with Cache
  Components' static-shell model (a per-request nonce forces per-request shells). It
  ships as the first-class **`CSP_MODE=nonce`** build instead of a silent default
  (path-to-100 #10, 2026-07-17), with the real trade-off spelled out.
- **Prisma, Clerk/NextAuth, BullMQ/Redis, hosted realtime** — each displaced by a
  leaner or more self-contained equivalent (Drizzle, Better Auth, pg-boss, SSE over
  LISTEN/NOTIFY), with the reasoning recorded.
- ~~**Zustand `persist`** — causes SSR hydration mismatches; documented as an opt-in
  recipe rather than wired.~~ **Wired 2026-07-16** (path-to-100 #2): the hydration-safe
  shape (`skipHydration` + post-paint `<StoreRehydration/>`) ships live on `ui-store`,
  with unit + e2e proof. See STATE.md → Middleware decision.
- **TS 7** — GA'd, but ships no JS Compiler API yet, so `next build` can't use it;
  the cutover is a tracked backlog item gated on Next.js support.
- **Client-side Stripe SDK, org teams/dynamic roles, seat-quantity billing, Turbo
  remote cache** — all documented as deliberate one-step upgrades, kept out of the
  default surface to stay lean.

## The verification pedigree

Nothing here is "wired but never run." The project's standing rule is **verify by
building and running, not by assuming**:

- [`VERIFICATION.md`](VERIFICATION.md) is a phased, hands-on checklist proving every
  feature end-to-end — the free, keyless phases first, then per-service live phases.
- Phases 4–6 carry **dated live-verification banners**: real Resend/Sentry/
  BetterStack/PostHog/Uploadthing/OAuth/Upstash accounts, a full Stripe test-mode
  cycle (checkout → webhook → dunning via test clocks → portal), and a real Fly.io
  deploy with managed Postgres serving a healthy `/api/health`.
- CI runs the same gates on every push; four independent audit passes scored the repo
  against a best-available-boilerplate bar before launch (reports in
  [`archive/`](archive/)).

If you want the guided tour from `git clone` to your first deployed feature, start
with [`GETTING_STARTED.md`](GETTING_STARTED.md).
