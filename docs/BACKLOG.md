# Backlog — Forward (Watch + Tier 4 upgrade paths)

> **Forward-only backlog** (formerly `PHASE_3_IDEAS.md`). Phases 1–5 and every
> locally-buildable Tier-4 row are complete and pushed to main. Shipped-item detail is
> **not** kept here: the compact record is the build-progress table in
> [PROJECT_STATUS.md](PROJECT_STATUS.md), and the full per-item prose is in
> [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md). The audits that seeded past
> backlogs live in [docs/archive/](archive/) (Phase B + the eight `/project-audit`
> scoring passes: 93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 → 100.0/100). Everything below
> goes plan → sign-off → build. Don't reintroduce shipped-item entries here.

## Watch (no action now)

- **TypeScript 7** — **GA'd as `typescript@7.0.2` (2026-07-08)**, but a 2026-07-13 cutover
  attempt (owner-approved override of the age gate; repo undeployed → no prod risk) found it
  **not yet adoptable here.** TS 7's package IS the native **Go** compiler and **ships no JS
  Compiler API** — its `typescript` module exposes only `version`; `createProgram`/`readConfigFile`/
  `sys`/`transpileModule` are gone and there is no `lib/typescript.js` (the programmatic API moved
  to `./unstable/*`). So `next build` fails at its TS-detection step (Next 16 stable embeds the
  classic API). This is **known & expected**: every library-API consumer (Next, webpack loaders,
  Vue/Svelte/Astro/MDX/Angular) must stay on TS 6 until the stable programmatic API returns in
  **TS 7.1 (~Q4 2026)**. **Upstream moved 2026-07-10:** Next merged **experimental TS7 support
  into canary** ([#95639](https://github.com/vercel/next.js/pull/95639) — detects TS7 and offers
  `experimental.useTypeScriptCli`, shelling out to the CLI instead of the JS API; auto-detect
  planned before stable), closing the tracking issue
  [#95490](https://github.com/vercel/next.js/issues/95490) as completed
  ([#95633](https://github.com/vercel/next.js/discussions/95633) remains the discussion). Not in
  any stable 16.2.x as of 2026-07-15. The `tsc` CLI itself is clean and
  **~3.6× faster** (monorepo type-check 20.5s → 5.7s, cache-bypassed), so the win is real.
  **Re-gate: on TS7 support reaching a *stable* Next release** (`useTypeScriptCli` or its
  auto-detect successor) — potentially ahead of TS 7.1, since Next now shells to the CLI.
  (Mechanics learned: the pnpm age gate re-validates the whole lockfile on every `pnpm
  run`/frozen install, not just `pnpm install` — any early adoption needs a
  `minimumReleaseAgeExclude`.)
- **Maintenance-only** (Tier 3 **G**) — the honest "we're done" option: let Renovate drive
  deps, keep docs current, add steps as real needs surface. Standing state 2026-07-12 →
  2026-07-15; superseded 2026-07-15 by the path-to-100 program (owner decision;
  [archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md)); **RESUMED
  2026-07-17** — the program shipped all 11 rows and the eighth scoring pass verified it
  at **100.0/100** ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md)).
  Near-term owner calendar: Monday 2026-07-20 (Renovate batch + 8 pending-approval
  majors — hold typescript-v7 per the TS7 gate).
- **e2e signup flake** — the `signUp`→`/dashboard` Playwright step is intermittently flaky
  (absorbed by `retries:2`, but it twice burned 2 of 3 CI attempts). **Not a code bug** — a
  fragile signup+redirect timing flow on modest runners. Harden **only if it ever turns a lane
  red**: bump that test's timeout, or wait on a network/cookie signal rather than only the URL.
- **Temporary security overrides (2026-07-15)** — three pnpm `overrides:` in
  `pnpm-workspace.yaml` remediate transitive-only Dependabot alerts with no upstream fix
  (`effect` 3.21.4 via uploadthing · `postcss` 8.5.15 via next's own pin · `esbuild` 0.25.12
  child-scoped via drizzle-kit). Remove each when its upstream moves — per-package removal
  conditions in [MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done).

## Tier 4 — Future upgrade paths (documented, unscheduled)

> Each open row is a real direction, **opt-in / on real need** (the starter is
> feature-complete without them), and goes plan → sign-off → build. Shipped rows keep one
> strikethrough line in the table at the bottom — the record is the PROJECT_STATUS
> build-progress table + the doc in "See"; don't re-expand them here.
>
> **The path-to-100 program** (2026-07-15, owner-directed) — 11 rows recovering the 13
> audit points locked behind won't-fix/deferred classifications (per-row re-analysis in
> [archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md)) — **shipped all
> 11 build rows 2026-07-16 → 17** (strikethrough table below), closed the last remainder
> (**#4b**, the one-time live Uploadthing tunnel proof, 2026-07-17), and was **VERIFIED
> at 100.0/100 by the 2026-07-17 scoring pass**
> ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md)). The
> **TypeScript 7 cutover** stays outside the program (externally gated, costs no
> points; see Watch). Open rows: the TS7 cutover and the ai-dev-kit extraction.

### Open rows

| Band | Area | Upgrade | Documented in | Notes |
| --- | --- | --- | --- | --- |
| B4 | Toolchain | **TypeScript 7 cutover** (outside the program) | STACK.md | **Blocked on TS7 support reaching a stable Next release** (experimental in canary since 2026-07-10; TS 7.1 ~Q4 2026 restores the JS API for the rest of the toolchain) — full detail in Watch above. Costs no audit points. |
| B3 | Agent tooling | **ai-dev-kit extraction** — pull [../ai-dev-kit/](../ai-dev-kit/) (kit 0.4.0; the original 3 program steps shipped 2026-07-17, project-init added 2026-07-18) into its own repo; consume here + in similar projects via the installer | ai-dev-kit/README.md (Roadmap) | Unblocked, opt-in. Scope: new repo, move kit verbatim, this repo installs from it (git dep or subtree); decide dual-home doc-audit source-of-truth handoff. Plan → sign-off → build. |

### Shipped (strikethrough record — full rows in the PROJECT_STATUS table + archive/PHASE_HISTORY)

| Band | Upgrade | Shipped | See |
| --- | --- | --- | --- |
| B1 | ~~`init-app --slim` leftover-mention tidy (U1)~~ — the 8 known dead pointers in kept docs are retargeted at the public template repo or rewritten; the report is per-line and skips deliberate retargets | 2026-07-18 | scripts/init-app.mjs · GETTING_STARTED.md → Remove what you don't need |
| B1 | ~~AGENTS.md `PRODUCT.md` index placeholder (U2)~~ — commented row under the context-doc table; `/project-init` (0.1.2, kit 0.4.2) uncomments it instead of authoring a row | 2026-07-18 | AGENTS.md · ai-dev-kit CHANGELOG 0.4.2 |
| B1 | ~~project-init live trial (program step 3)~~ — full `/project-init` flow on a fresh degit consumer copy (sample product "Potluck"); two skill mends → **kit 0.4.1**; trial findings U1/U2 became the on-ramp rows above | 2026-07-18 | ai-dev-kit CHANGELOG 0.4.1 · PROJECT_STATUS ai-dev-kit row |
| B1 | ~~UT prod-callback tunnel proof (program #4b)~~ — closed program #4 | 2026-07-17 | SERVICES.md → Uploadthing · VERIFICATION.md → Uploadthing |
| B4 | ~~Per-org billing (program #11)~~ | 2026-07-17 | SERVICES.md → Stripe · PROJECT_STATUS Path-to-100 · #11 |
| B3 | ~~`CSP_MODE=nonce` as a first-class mode (program #10)~~ | 2026-07-17 | SECURITY.md → CSP strategy · PROJECT_STATUS Path-to-100 · #10 |
| B3 | ~~Opt-in OpenTelemetry (program #9)~~ | 2026-07-16 | SERVICES.md → OpenTelemetry · PROJECT_STATUS Path-to-100 · #9 |
| B3 | ~~Email bounce/complaint handling (program #8)~~ | 2026-07-16 | SERVICES.md → Resend (bounce/complaint) · PROJECT_STATUS Path-to-100 · #8 |
| B2 | ~~i18n full-surface message coverage (program #7)~~ | 2026-07-16 | I18N.md · PROJECT_STATUS Path-to-100 · #7 |
| B2 | ~~Magic-link sign-in, env-gated (program #6)~~ | 2026-07-16 | AUTH.md → Magic link · PROJECT_STATUS Path-to-100 · #6 |
| B1 | ~~`updatePost` → `fieldErrors` error shape (program #1)~~ | 2026-07-16 | API.md → Typed field errors · PROJECT_STATUS Path-to-100 · #1 |
| B1 | ~~`persist` wired to `ui-store`, hydration-safe (program #2)~~ | 2026-07-16 | STATE.md → Middleware decision · PROJECT_STATUS Path-to-100 · #2 |
| B1 | ~~Admin-gate `reindexPosts` (program #5)~~ | 2026-07-16 | SERVICES.md → Meilisearch · PROJECT_STATUS Path-to-100 · #5 |
| B1 | ~~Dead-letter queue wired (program #3)~~ | 2026-07-16 | SERVICES.md → Jobs (dead-letter) · PROJECT_STATUS Path-to-100 · #3 |
| B1 | ~~Enable CodeQL~~ — `ENABLE_CODEQL` flipped the day the repo went public (code scanning is free on public repos); the pre-publish git-history secrets scan happened as part of the launch. | 2026-07-14 | DEPLOYMENT.md → CI/CD · PROJECT_STATUS launch row |
| B3 | ~~Production sending domain + deliverability~~ — a real verified domain + SPF/DKIM/DMARC recipe; deliverability + the hop-2 email-change delivery gap (open since 2026-07-05) proven/closed live. Bounce/complaint handling remains open (row above). | 2026-07-14 | [SERVICES.md → Resend](context/SERVICES.md) · [VERIFICATION.md](VERIFICATION.md) → Resend |
| B1 | ~~Real host deploy~~ — **PROVEN live on Fly.io** (test app, managed `fly postgres`; `/api/health` 200 + sign-up→DB confirmed). Vercel/Railway/VPS paths stay authored. | 2026-07-13 | [DEPLOYMENT.md → Fly.io](context/DEPLOYMENT.md#flyio-worked-runbook) · [VERIFICATION.md](VERIFICATION.md) Phase 6 |
| B2 | ~~Stripe Phase-5 live-verify~~ — **COMPLETE in test mode** (checkout → webhook → row + idempotency; customer reuse; billing portal; test-clock dunning; webhook 400/503/429; A13 cancel-on-delete live). Doc-only close. | 2026-07-13 | [VERIFICATION.md](VERIFICATION.md) Phase 5 |
| B1 | ~~HIBP compromised-password check · 429 rate-limit headers · Avatar upload~~ | 2026-07-07→08 | AUTH.md / SECURITY.md / SERVICES.md |
| B1 | ~~A1 toasts · A2 subscription gating · A3 cron job · A4 PG-pooling docs · A5 email render tests · A6 remotePatterns · A7 fieldErrors · A8 search settings-on-create · A9 security.txt · A10 manypkg · A11 release-age gate~~ | 2026-07-08 | PROJECT_STATUS **Tier 4 · A1–A11** row |
| B2 | ~~2FA / TOTP~~ | 2026-07-08 | AUTH.md → Two-factor |
| B2 | ~~A14 Skeleton · A15 db.transaction example · A16 user-keyed rate-limited procedure~~ | 2026-07-08 | UI.md / DATABASE.md / API.md |
| B2 | ~~DB backup / restore / DR runbook~~ | 2026-07-09 | DATABASE.md → Backup, restore & DR |
| B2 | ~~Persisted audit log + `/admin/audit` read UI~~ | 2026-07-09 | AUTH.md → Persisted audit trail |
| B2 | ~~Docker-image CI (build · smoke · Trivy · opt-in GHCR publish)~~ | 2026-07-09 | DEPLOYMENT.md → CI/CD |
| B2 | ~~A12 — Opt-in CAPTCHA (Cloudflare Turnstile)~~ | 2026-07-11 | AUTH.md → Bot protection / CAPTCHA |
| B3 | ~~Passkeys / WebAuthn~~ | 2026-07-09 | AUTH.md → Passkeys |
| B3 | ~~Consent gate + GDPR data-export~~ | 2026-07-09 | SERVICES.md → PostHog + AUTH.md → Data export |
| B3 | ~~`@repo/ui` Dialog tall-content fix~~ | 2026-07-09 | UI.md → Dialog |
| B3 | ~~A17 next/font recipe · A18 magic-link/OTP recipe · A19 removal checklists · A20 failed-job note · A21 URL-state doc~~ | 2026-07-09 | UI.md / AUTH.md / SERVICES.md / STATE.md |
| B3 | ~~Visual regression for `@repo/ui` (opt-in)~~ | 2026-07-09 | UI.md → Visual regression |
| B3 | ~~Performance budgets in CI (opt-in)~~ | 2026-07-10 | DEPLOYMENT.md → Performance budgets |
| B3 | ~~SBOM / provenance attestation~~ | 2026-07-10 | DEPLOYMENT.md → CI/CD |
| B3 | ~~Multi-instance rate-limit storage~~ | 2026-07-10 | AUTH.md → Multi-instance storage |
| B3 | ~~Slim worker image~~ | 2026-07-10 | DEPLOYMENT.md → Background-jobs worker |
| B3 | ~~CSP-nonce example rework for the i18n proxy~~ | 2026-07-12 | SECURITY.md → CSP strategy · DECISIONS.md |
| B4 | ~~Organizations / multi-tenancy~~ | 2026-07-08 | AUTH.md → Organizations |
| B4 | ~~Admin plugin (ban + impersonation)~~ | 2026-07-10 | AUTH.md → Admin plugin |
| B4 | ~~i18n / next-intl~~ | 2026-07-11 | I18N.md |
| B4 | ~~A22 — SSE / realtime notifications example~~ | 2026-07-12 | API.md → Realtime / SSE |
| B3 | ~~A23 — SSE reconnect backfill~~ | 2026-07-11 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A26 — `Table` primitive in `@repo/ui` (+ `/admin/audit` consumer)~~ | 2026-07-11 | UI.md → Adding shadcn Components |
| B3 | ~~A24 — authoritative unread-count badge (`notification.unreadCount` as SQL `count()`, wired to the feed)~~ | 2026-07-11 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A25 — keyset-paginate `notification.list` ("Load more"; infinite-query cache)~~ | 2026-07-12 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A29 — `DB_POOL_MAX` env → `Pool({ max })` (deploy-tunable pool size)~~ | 2026-07-12 | DATABASE.md → Connection pooling · DEPLOYMENT.md |
| B3 | ~~A28 — Linux visual baselines + `ENABLE_VISUAL` (the visual lane runs on every PR/push now)~~ | 2026-07-12 | UI.md → Visual regression |
| B3 | ~~A27 — dead-code / unused-dep gate (knip) in CI's `verify` lane~~ | 2026-07-12 | STACK.md · DEPLOYMENT.md → CI/CD · CONVENTIONS.md → Exports |
| B3 | ~~A30 — worked next-intl formatting recipe (`useFormatter` / named formats / `timeZone` gotcha)~~ | 2026-07-12 | I18N.md → Formatting dates, numbers & currency |
| B2 | ~~`post.list` / `post.listMine` uuid-cursor hardening (`id: z.uuid()`, the A25 pattern; pre-fix 500 live-reproduced — the error body leaked the query text)~~ | 2026-07-12 | API.md → Cursor pagination |
| B3 | ~~A32 — locale-aware date formatting (`formats`/`timeZone` in `request.ts` + notifications feed → `useFormatter().dateTime`; the A30 recipe's consumer half)~~ | 2026-07-12 | I18N.md → Formatting dates, numbers & currency |
| B2 | ~~A13 — cancel Stripe subscription on account deletion (`deleteUser.beforeDelete` capture → `cancel-stripe-subscriptions` job → `@repo/jobs` worker; immediate cancel, Stripe customer kept)~~ | 2026-07-13 | SERVICES.md → Stripe · AUTH.md → Danger zone |
| B4 | ~~A31 — `typedRoutes` evaluation~~ (**evaluated → NOT adopted**: the `[locale]` tree makes the checking vacuous-or-wrong; next-intl's flattened nav typing is out of its reach) | 2026-07-12 | DECISIONS.md |
