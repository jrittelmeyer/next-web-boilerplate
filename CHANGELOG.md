# Changelog

Notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); since this is a template
(not a versioned library), `main` is always the supported version and entries mark
milestones rather than package releases. Each milestone is tagged (`v1.0.0`,
`v1.1.0`, …) with a matching
[GitHub Release](https://github.com/jrittelmeyer/next-web-boilerplate/releases).

## [Unreleased]

Shipped on `main` after the `v1.1.0` tag; not yet cut into a tagged milestone.

### Added

- **Hosted Storybook component gallery** — `@repo/ui`'s Storybook publishes to
  GitHub Pages on every change touching `packages/ui/**` (new
  `.github/workflows/pages.yml`), linked from the README and
  [`context/DEPLOYMENT.md`](docs/context/DEPLOYMENT.md#storybook-on-github-pages-component-gallery).
- **README screenshot tour** — four keyless, real-build screenshots (landing
  light/dark, signed-in dashboard, `/account`) in a new README `## Screenshots`
  section and a "See it" strip in [`FEATURES.md`](docs/FEATURES.md).
- **`/_next/image` optimization e2e coverage** —
  `apps/web/e2e/image-optimization.spec.ts` + a committed keyless fixture assert
  the optimizer really transforms (PNG→webp, an IHDR-verified resize, and 400
  for a non-allowlisted remote `url=`), so the overridden `sharp` engine (see
  Security below) is exercised on every e2e run instead of merely installed —
  the 2026-07-22 audit's last open row.
- **Daily security-audit watch lane + auto-filed triage issue** — new
  `.github/workflows/security-audit.yml` runs `pnpm audit` daily (moderate+
  threshold) and turns a red result into a rolling `security-triage` issue
  (labeled, assigned, auto-closed by the next green run) via
  `.github/scripts/security-triage-issue.sh`; ci.yml's audit lane syncs the same
  issue on non-PR runs on `main` (push / heartbeat / dispatch). Advisories publish against the world, not the
  tree — a fully green repo can wake up red (the 2026-07-22 Next.js batch), and
  a red scheduled run previously had no consumer. Triage procedure:
  [`docs/MAINTENANCE.md` → Security response runbook](docs/MAINTENANCE.md#security-response-runbook).

### Fixed

- **Renovate schedule widened so scheduled updates can actually land** — the
  config shipped `"schedule": ["before 6am on monday"]` with no `timezone` key:
  a 6-hour UTC window per week that the hosted app's run cadence may never
  intersect (this repo's scheduled lane had produced zero update PRs as a
  result). Now a full-day `["on monday"]` window with an explicit `timezone`
  and explicit PR limits (`prHourlyLimit: 0`, `prConcurrentLimit: 10`). **If
  you copied `.github/renovate.json` before this fix, apply the same change.**

### Security

- **2026-07-23: `next` 16.2.9 → 16.2.11** — remediates the 2026-07-22 Next.js
  advisory batch (9 GHSAs against `>=16.0.0 <16.2.11`: 4 high, including a
  middleware/proxy bypass and Server-Action DoS/SSRF, plus 5 moderate). The
  patched release was two days old, so a dated `minimumReleaseAgeExclude`
  (`next`, `@next/*`) takes it past pnpm's 7-day gate — the policy's documented
  security-fix path; remove 2026-07-28 (tracked in
  [`docs/MAINTENANCE.md` → Watch items](docs/MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)).
  This was the first advisory wave routed through the security-triage pipeline
  (see Added above).
- **Transitive-advisory remediations via pnpm `overrides`** (no upstream fix
  existed for any at triage time; every override is temporary, with its removal
  condition tracked in
  [`docs/MAINTENANCE.md` → Watch items](docs/MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)):
  - **2026-07-15:** `effect` → 3.21.4 (HIGH, via uploadthing's exact pin) ·
    `postcss@<8.5.10` → 8.5.15 (via Next's own pin) ·
    `@esbuild-kit/core-utils>esbuild` → 0.25.12 (via drizzle-kit).
  - **2026-07-22:** `brace-expansion` → 5.0.7 (HIGH, build-tooling paths) ·
    `dompurify` → 3.4.12 (via posthog-js, which ships client-side) · **`sharp`
    → 0.35.3 (HIGH — note: this forces sharp past Next 16.2.x's own `^0.34.5`
    optionalDependency pin on a real runtime path, `/_next/image`)**.
    `fast-uri`'s fix (3.1.4) is deliberately deferred behind the 7-day
    release-age gate (~2026-07-26) via two dated `auditConfig.ignoreGhsas`
    entries (build-tool-only exposure).
  - Provenance: only the 2026-07-15 trio and `brace-expansion` were Dependabot
    alerts — `sharp`, `dompurify`, and `fast-uri` were caught by CI's
    `pnpm audit` lane, the authoritative advisory gate here.

## [1.1.0] — 2026-07-20

Everything shipped on `main` since the initial release — all additive, verified
end-to-end, and graded **100.0/100** by the project audit (see
[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)).

### Added

- **Path-to-100 depth** — typed field errors on writes, hydration-safe Zustand
  `persist`, admin-gated search reindex, a jobs dead-letter queue, keyless uploads
  e2e + a prod-callback tunnel proof, magic-link sign-in, full-surface en/es i18n
  coverage, email bounce/complaint suppression, opt-in OpenTelemetry export,
  `CSP_MODE=nonce` as a first-class build mode, and per-organization billing.
- **ai-dev-kit** — the repo's agentic-dev workflow, extracted to the standalone
  [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) skill library and
  preinstalled here: two inception doors (`/project-init` from an idea,
  `/project-adopt` from an existing codebase), registry-verifying `dep-check` +
  `live-verify` skills, and advise-never-block hooks.
- **`pnpm init-app --slim`** — offers to strip the template's own history/marketing
  docs from a derived app (see
  [Getting started → Remove what you don't need](docs/GETTING_STARTED.md#remove-what-you-dont-need)).
- **Scheduled CI heartbeat** — `ci.yml` now runs weekly (`schedule`) and on
  `workflow_dispatch`, so the full pipeline keeps exercising world-facing surfaces
  between merges.
- **Staying-current recipe** — [Getting started](docs/GETTING_STARTED.md#staying-current-with-the-template)
  documents pulling later template improvements into a derived (degit) app.

### Changed

- **Docker Postgres moved 16 → 18** (`postgres:18-alpine` in both compose files and
  the CI service containers). **Action needed on existing local volumes:** 18+
  images refuse the old `/var/lib/postgresql/data` mount point
  ([docker-library/postgres#1259](https://github.com/docker-library/postgres/issues/1259)),
  so the compose files now mount the volume at `/var/lib/postgresql` — a volume
  created by an older image won't start under 18. Either `pg_dump` → recreate the
  volume → restore, or (throwaway dev data) delete the volume and re-run
  `pnpm --filter @repo/db db:migrate`.
- CI workflow actions updated a major each: checkout v7, setup-node v6,
  upload-artifact v7, codecov v7, codeql-action v4, pnpm/action-setup v6.

## [1.0.0] — 2026-07-14

Initial public release. The full inventory with rationale is
[`docs/FEATURES.md`](docs/FEATURES.md); everything below was verified end-to-end
against real services before release ([`docs/VERIFICATION.md`](docs/VERIFICATION.md)).

### Included

- **Platform** — Next.js 16 (App Router, React 19, React Compiler + Cache
  Components/PPR on by default), TypeScript 6 `strict`, Turborepo + pnpm workspaces,
  Node 24.
- **Database** — PostgreSQL + Drizzle ORM, committed migrations, a copy-me `posts`
  entity (keyset pagination, indexes, transactions, optimistic UI), backup/restore/DR
  runbook, seeding.
- **Auth** — Better Auth: email/password + verification + reset + HIBP check,
  env-gated GitHub/Google OAuth, 2FA (TOTP + backup codes), passkeys, organizations /
  multi-tenancy, admin (ban + impersonation) on top of fresh-from-DB RBAC, persisted
  audit log + `/admin/audit`, sessions management, two-hop email change, danger-zone
  deletion, opt-in Turnstile CAPTCHA, DB-backed rate-limit storage.
- **API** — tRPC v11 reads + Server Actions writes with typed field errors; SSE
  realtime notifications over Postgres LISTEN/NOTIFY.
- **UI / state / forms** — Tailwind v4 + shadcn/ui shared package, dark mode,
  Storybook + opt-in visual regression; TanStack Query + Zustand with a documented
  read-model boundary; React Hook Form + Zod v4 shared validators.
- **i18n** — next-intl `[locale]` routing (en/es), per-locale SEO, locale-aware
  formatting.
- **Payments** — Stripe hosted Checkout → webhook → `subscriptions` table, customer
  reuse, billing portal, dunning sync, subscription gating, cancel-on-account-delete.
- **Email** — Resend + React Email templates with plain-text parts and a proven
  deliverability recipe.
- **Uploads / search / jobs** — Uploadthing (persisted + fail-closed delete),
  Meilisearch (settings as code, index-on-write), pg-boss background jobs with a slim
  worker image.
- **Observability** — Sentry, BetterStack logging + dashboards-as-code, PostHog with
  consent gate + GDPR export, health endpoint, request telemetry.
- **Security** — full header set, static CSP + verified nonce-CSP recipe, COOP,
  security.txt, app-level rate limiting, 7-day supply-chain age gate (Renovate +
  pnpm), SHA-pinned actions, Trivy, SBOM/provenance, CodeQL.
- **Testing / CI** — Vitest (coverage-gated) + Playwright (a11y + visual lanes) +
  DB integration tests; CI: verify / audit / e2e / docker-image lanes. The unit suite
  runs with zero keys and no database.
- **Deployment** — multi-stage Docker (web + worker), dev/prod compose, a worked and
  proven Fly.io runbook, Vercel/Railway/self-host paths.
- **Docs** — `FEATURES` (what + why), `GETTING_STARTED`, `MAINTENANCE`, `AGENTS.md`
  agent onboarding, 14 per-area context docs, decision log, verification checklist.

[1.1.0]: https://github.com/jrittelmeyer/next-web-boilerplate/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jrittelmeyer/next-web-boilerplate/releases/tag/v1.0.0
