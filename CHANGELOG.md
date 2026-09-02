# Changelog

Notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); since this is a template
(not a versioned library), `main` is always the supported version and entries mark
milestones rather than package releases. Each milestone is tagged (`v1.0.0`,
`v1.1.0`, …) with a matching
[GitHub Release](https://github.com/jrittelmeyer/next-web-boilerplate/releases).

## [Unreleased]

### Changed

- **ai-dev-kit 0.23.11 → 0.23.16** (13 drifted files reconciled; `install.mjs --check`
  13 → 0). Seven workflow skills — `checkpoint`, `harness-audit`, `project-adopt`,
  `project-audit`, `project-init`, `retro`, `tidy` — now carry
  `disable-model-invocation`, so an agent invokes them by **reading
  `.claude/skills/<name>/SKILL.md`**; `/name` is still the user form and `doc-audit`,
  `dep-check`, `live-verify` are unflagged. `stop-gate` gained `asyncRewake` (inert
  here — this repo sets no `enforcement` keys, deliberately). Both
  `checkpoint-autorun.mjs` hooks, repo-owned and kit-owned, had their reason text
  rewritten: they instructed an action the flag makes impossible.
- **Install from a TAG, never the kit clone's working tree** — new standing rule in
  [`CONVENTIONS.md` → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude),
  adopted after the clone moved 0.23.16 → 0.23.17 *mid-session* while this bump was
  being planned against it. `install.mjs --check` diffs against whatever the source
  currently is, so a drifting clone makes the drift gate green by construction. A
  `git worktree` at the tag fixes it, since `install.mjs:36` derives its kit root from
  the script's own location. Two rehearsal rules land with it: the scratch install must
  **omit `--global`** (that flag writes to `~/.claude/skills/`, a path not derived from
  `--dest`), and dual-home skills need their own diff.
- **Adapter migrated to the schema's `verify` block**, with the command string
  **verified by running it** rather than reasoned about:
  `pnpm --filter web start -- --port 3100` forwards the `--` literally into the
  script's argv, and `next start` then reads `--port` as the project directory
  (*"Invalid project directory provided"*). The no-`--` form serves on :3100 with
  `/api/health` returning `database: up`. The broken string — which a real
  with-skill run copied verbatim on 2026-08-31 — is corrected in `prodVerify` too
  rather than left as the fallback. `harnessAudit.kitSourcePath` deliberately **not**
  added: its only legal value is a machine-local absolute path, and the adapter is
  tracked template surface.
- **`docs:sanity`'s kit-wiring parity check now deep-compares every key** instead of an
  enumerated `event/matcher/handler/if/timeout` list, which had let kit 0.23.12's new
  `asyncRewake` through silently. Red-proven: deleting that key fails the check.
  Naming it as a sixth field would have repeated the defect for the seventh.

- **`renovate.yml` is fork-safe** — the job is gated on `ENABLE_RENOVATE`
  (job-level `if`, the `ENABLE_CODEQL`/`ENABLE_VISUAL` convention). It was the one
  workflow that *failed* rather than skipped when unconfigured: `scripts/init-app.mjs`
  ships it verbatim, so every project generated from the template inherited a Renovate
  run that died at startup for want of `RENOVATE_TOKEN` every Monday — forever in a
  private repo, which never hits GitHub's 60-day schedule auto-disable. Unset, the lane
  now skips silently. Enabling takes **two** actions (the secret *and*
  `gh variable set ENABLE_RENOVATE --body true`), so a dated 14-day liveness check
  ships alongside it in [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) — a forgotten
  variable would otherwise reproduce the same silent zero-PR observable that hid the
  Mend failure for six weeks.
- **`pnpm-workspace.yaml`'s `vite` comment corrected** — it claimed "we never import
  vite directly", but `packages/ui` declares `vite: 8.0.16` as a devDependency for
  Storybook's `@storybook/react-vite` builder. The override is what keeps that direct
  pin and every transitive copy in lockstep; both sites bump together.

### Security

- **`minimumReleaseAgeExclude` emptied on schedule** — the ten-entry dated exception
  taken 2026-08-26 for `next` 16.3.3 (+ `@next/env` and the 8 `@next/swc-*` lockstep
  binaries), covering the AVIF-decode RCE GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497, is
  removed: 16.3.3 (published 2026-08-25T15:32Z) cleared the 7-day gate unaided at
  15:32Z on 2026-09-01. The install-time age gate is unconditional again with zero
  exclusions. Third use of the park/exit machinery, third clean exit on schedule.

### Added

- **Self-hosted Renovate workflow** — `.github/workflows/renovate.yml`
  (`renovatebot/github-action`, SHA-pinned, Monday cron + `workflow_dispatch`,
  reusing `.github/renovate.json` unchanged) as the fallback for the Mend-hosted
  App, whose scheduled runs had produced no PRs since 2026-07-22. Needs a
  `RENOVATE_TOKEN` repo secret and is not yet live — the host decision is tracked
  in [`docs/MAINTENANCE.md` → Watch](docs/MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done).

## [1.2.0] — 2026-08-30

Everything shipped on `main` since v1.1.0 — the calendar feature (Phases 1–5,
built and hardened end-to-end), an ai-dev-kit modernization line, and continuous
maintenance (16 project-audit passes, 6 security-advisory batches, two CVE
remediations). See
[`v1.1.0...v1.2.0`](https://github.com/jrittelmeyer/next-web-boilerplate/compare/v1.1.0...v1.2.0).

### Added

- **Calendar (Phases 1–5)** — calendars, events and a month grid; an `RRULE`
  recurrence engine with per-occurrence overrides and three edit scopes; typed
  in-app notifications; attendees with internal RSVP; emailed invitations with
  `.ics` and token-based external RSVP; a reminders sweeper. Verified at
  100/100/100/100 against a 568-rule differential oracle. See
  [`context/calendar/`](docs/context/calendar/model.md).
- **`contrarian` review subagent** — a devil's-advocate agent that stress-tests
  plans touching schema/auth/package boundaries or template surface before
  build, wired via a `.claude/agents/` + hook layer and a standing trigger
  policy in `CLAUDE.md`.
- **`checkpoint-autorun`** — a Stop hook that automates commit/push/CI-watch/
  handoff-writing when a session goes idle with unpushed work.
- **ai-dev-kit 0.6.1 → 0.23.11** — skill-lint CI gate, any-project
  portability, `harness-audit` + `retro` skills, plugin-marketplace packaging,
  and `--hooks` adoption (SessionStart/compact wiring).
- **Hosted Storybook gallery** (GitHub Pages) + a README screenshot tour.
- **`/_next/image` optimization e2e coverage** and a **daily security-audit
  watch lane** with an auto-filed/auto-closed triage issue.

### Changed

- **`next` 16.2.11 → 16.3.3** across three security releases (16.2.12,
  16.3.1 taken-then-reverted same day on a boot-crash regression, 16.3.3 on a
  dated age-gate exception for an AVIF-decode RCE).
- **`better-auth` 1.6.20 → 1.6.30**, incl. the 1.6.23 account-takeover fix
  (below); now exact-pinned after a caret range silently resolved to a
  breaking 1.7.x.
- Sixteen `/project-audit` passes kept the repo at 98.6–100/100; docs kept
  current in the same commit as each change (working agreement).

### Fixed

- **CVE-2026-14456** — `libssl3`/`libcrypto3` in the Docker base image,
  patched via a shared `apk upgrade` build stage.
- **Calendar audit findings F4–F8** — an external-guest cancellation NULL
  bug, a series-delete scope-pair gap, verified-email race seams, and two
  recurrence-expansion edge cases (`overlaps` window, `BYMONTHDAY` without
  `BYMONTH`).
- E2E signup flake + reporter/artifact diagnosability gaps; an a11y false
  positive on Uploadthing's transient avatar state.

### Security

- **`better-auth` 1.6.23** — GHSA-qq9h-g4jm-xgf3, an account-takeover flaw
  live-exposed on the default config.
- **`next` 16.3.3** — GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497, an
  unauthenticated AVIF-decode RCE reachable via Uploadthing uploads.
- Six transitive-advisory override batches (`sharp`, `dompurify`, `nanoid`,
  `fast-uri`, `brace-expansion`, `postcss`, `effect`) — each parked behind the
  release-age gate and promoted/removed on schedule; `pnpm audit` clean
  throughout.

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

[1.2.0]: https://github.com/jrittelmeyer/next-web-boilerplate/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jrittelmeyer/next-web-boilerplate/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jrittelmeyer/next-web-boilerplate/releases/tag/v1.0.0
