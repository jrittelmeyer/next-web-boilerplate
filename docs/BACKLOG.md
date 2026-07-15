# Backlog — Forward (Watch + Tier 4 upgrade paths)

> **Forward-only backlog** (formerly `PHASE_3_IDEAS.md`). Phases 1–5 and every
> locally-buildable Tier-4 row are complete and pushed to main. Shipped-item detail is
> **not** kept here: the compact record is the build-progress table in
> [PROJECT_STATUS.md](PROJECT_STATUS.md), and the full per-item prose is in
> [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md). The audits that seeded past
> backlogs live in [docs/archive/](archive/) (Phase B + the six `/project-audit`
> scoring passes: 93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3/100). Everything below goes plan →
> sign-off → build. Don't reintroduce shipped-item entries here.

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
  deps, keep docs current, add steps as real needs surface. **The standing state since
  2026-07-12** — every locally-buildable row has shipped, so maintenance-only holds until an
  external prerequisite unblocks a row below. Reopen on real need.
- **e2e signup flake** — the `signUp`→`/dashboard` Playwright step is intermittently flaky
  (absorbed by `retries:2`, but it twice burned 2 of 3 CI attempts). **Not a code bug** — a
  fragile signup+redirect timing flow on modest runners. Harden **only if it ever turns a lane
  red**: bump that test's timeout, or wait on a network/cookie signal rather than only the URL.

## Tier 4 — Future upgrade paths (documented, unscheduled)

> Each open row is a real direction, **opt-in / on real need** (the starter is
> feature-complete without them), and goes plan → sign-off → build. Shipped rows keep one
> strikethrough line in the table at the bottom — the record is the PROJECT_STATUS
> build-progress table + the doc in "See"; don't re-expand them here.
>
> **The open set, ordered** (both the value÷effort and breadth-of-value lenses now agree —
> every other row has shipped): **1) Email bounce/complaint handling** — the one unbuilt
> app-side piece; common want, low urgency (Resend already suppresses account-side).
> **2) TypeScript 7 cutover** — the broadest win (every clone's build gets the
> native-compiler speedup) but hard-gated on Next.js TS7 support (see Watch).

### Open rows

| Band | Area | Upgrade | Documented in | Notes |
| --- | --- | --- | --- | --- |
| B3 | Email | **Bounce/complaint handling** (deliverability follow-up) | SERVICES.md Resend | The verified sending domain + SPF/DKIM/DMARC recipe + deliverability proof shipped 2026-07-14 (shipped table below); the remaining optional piece is app-side bounce/complaint handling (a Resend webhook → `email_suppressions` table). Resend already suppresses hard-bounces/complaints account-side, so this is app-side *awareness* + halting pointless job retries, not primary deliverability. |
| B4 | Toolchain | **TypeScript 7 cutover** | STACK.md | **Blocked on TS7 support reaching a stable Next release** (experimental in canary since 2026-07-10; TS 7.1 ~Q4 2026 restores the JS API for the rest of the toolchain) — full detail in Watch above. |

### Shipped (strikethrough record — full rows in the PROJECT_STATUS table + archive/PHASE_HISTORY)

| Band | Upgrade | Shipped | See |
| --- | --- | --- | --- |
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
