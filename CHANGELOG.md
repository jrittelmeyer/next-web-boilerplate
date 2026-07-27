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

- **`contrarian` review subagent + a sign-off nudge** — `.claude/agents/contrarian.md`
  is a read-only devil's-advocate agent that steel-mans a plan, audits its unstated
  assumptions by likelihood × impact, runs a pre-mortem, and returns severity-tagged
  findings that each carry a **required** recommendation (objection-without-alternative
  is an explicit anti-pattern in its prompt). `CLAUDE.md` carries the trigger policy —
  standing-authorized, always for schema, auth/RBAC, package boundaries, non-patch
  dependency adds, and any edit to the **template surface**, which is spelled out as a
  path set rather than a prose category so it stays checkable.
  `.claude/hooks/contrarian-nudge.mjs` fires a reminder on `ExitPlanMode`; it points at
  the policy rather than restating it, because a second copy of a trigger list drifts.
  This also makes `.claude/agents/` and top-level `.claude/hooks/*.mjs` a new
  **repo-owned** layer inside a directory that was previously all installer output —
  ownership rules are now in
  [`context/CONVENTIONS.md` → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude),
  and `pnpm docs:sanity` asserts the wiring stays intact.
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

- **2026-07-27: `better-auth` 1.6.20 → 1.6.23 (account takeover)** — GHSA-qq9h-g4jm-xgf3
  (CVSS 8.3, high) let an attacker take over an account that already existed at an email
  address, via the passwordless sign-in path. **This template met every precondition on
  its default configuration**: `better-auth <1.6.22`, the `magicLink` plugin registered,
  email+password with open registration, and no `disableSignUp` — i.e. the moment
  `RESEND_API_KEY` is set. If you generated a project from this template before this
  entry and you configure email, **bump `better-auth` and `@better-auth/passkey` to
  >=1.6.23** (they are pinned in lockstep — 1.6.23 peers `better-auth: ^1.6.23`). The
  fix, shipped in 1.6.22, revokes unproven credentials during magic-link and email-OTP
  sign-in, so an unverified password set before the upgrade stops working after it.
  **Migration 0018 is required with this bump**: 1.6.23 adds 2FA account lockout (on by
  default — 10 consecutive failed verifications lock the factor for 15 minutes) backed by
  two new `two_factor` columns, `failed_verification_count` and `locked_until`. Because
  this repo hand-maintains the Better Auth schema, a missing column makes the Drizzle
  adapter throw on **every failed 2FA verification** — apply the migration when you bump.
- **2026-07-27: transitive advisories — `postcss`, `fast-uri`, `brace-expansion`** —
  `postcss` moves to 8.5.20 for GHSA-r28c-9q8g-f849 (path traversal via the `prev`
  source-map annotation). Note the override **key** moved too (`<8.5.10` → `<8.5.18`):
  the old key only rewrote next's exact pin and never touched the `postcss@8.5.15` the
  tailwind/vite chains resolved, which the new advisory made vulnerable — a retargeted
  value alone would have left the tree exposed. `fast-uri` 3.1.4 graduates from a dated
  `ignoreGhsas` deferral to a real override now that it clears the 7-day age gate.
  `brace-expansion` takes the deferral instead: GHSA-mh99-v99m-4gvg affects `<=5.0.7`
  and the fix (5.0.8) is inside the age gate, on a build-tooling-only path — raise it
  2026-07-30.
- **2026-07-27: the audit merge gate no longer passes an unaudited tree** — ci.yml ran
  `pnpm audit --ignore-registry-errors` with no assertion that an audit actually
  completed, so an advisory-endpoint outage produced a green over an unchecked
  lockfile. It did exactly that on 2026-07-26, papering over the three highs above for
  a day. The step now requires the "…vulnerabilities found" trailer a completed report
  always emits — the same guard `.github/scripts/security-triage-issue.sh` already used
  before closing the triage issue. **A genuine npm outage now turns the lane red**
  rather than green; that is the intended direction to fail.
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
