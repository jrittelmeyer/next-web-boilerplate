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

- **Typed notification payloads, links and one publish path** (calendar Phase 3, part A —
  no calendar coupling, and it closes a bug that exists in the repo today).
  `NOTIFICATION_TYPES` gains five calendar members, extended in `@repo/db` **and**
  `@repo/validators` in one commit because they are inseparable: the validators side was
  an inline `z.enum([…])`, and `server/realtime/notification-bus.ts` `safeParse`s every
  payload and **fails closed with no log, no error and no Sentry event** — so extending
  one side alone makes every notification of the new type silently stop arriving.
  `src/lib/union-parity.test.ts` (moved out of `lib/calendar/`, where the path was lying
  about a non-calendar union) is what makes those two edits one commit.
  Migration `0022` adds `title` and `link`.
  **Three decisions worth carrying forward.**
  (1) **The `body` contract is two slots, not one.** `title IS NULL` ⇒ `body` is already
  a complete sentence; otherwise `type` selects the sentence and (`body`, `title`) fill
  it. A one-slot design cannot express *"Alice declined Standup"* — two variables and a
  status — which is why the response type splits three ways. Both feed render paths
  switch on `type`: the `<li>` **and** the SSE toast.
  (2) ⚠️ **`link NOT LIKE '/\%'` is the wrong spelling and accepts `/\evil.com`** —
  backslash is `LIKE`'s **default ESCAPE character** in Postgres, so that pattern means
  "a slash followed by a literal `%`". The shipped CHECK uses `left()` comparisons, which
  have no escape layer. Verified on PG 18: `//evil.com`, `/\evil.com`, `http://evil.com`
  and `javascript:…` rejected; `/calendar/event/<id>` and `NULL` accepted. Rendering goes
  through the locale-aware `Link`, never a raw `<a href>`.
  (3) **`.nullable().default(null)`, not a bare `.nullable()`** — a bare `.nullable()`
  requires the key to be *present*, so mid-rolling-deploy an old instance would publish a
  payload without the new fields and every new instance's bus would drop it silently:
  the exact bug class above, reintroduced by its own fix.
  `createNotifications`/`publishNotifications` split persist from publish because
  `notify()` runs `pg_notify` on the **pooled** connection, not the caller's transaction
  connection, so publishing inside a transaction can beat the row's visibility;
  `sendTestNotification` is refactored onto them so there is one path, not two that
  drift. `notification-bus.ts` joins `coverage.include` — it has had a test file since
  A22 and had never been counted.
- **Calendar, Phase 2 — recurrence, per-occurrence overrides and edit scopes.** An
  `RRULE` engine in `@repo/calendar` (`rrule.ts` · `expand.ts` · `occurrences.ts`, at
  100/100/100/100), migration `0021` (`calendar_recurrence_dates`, a composite self-FK,
  and a partial override index), scoped `updateEvent`/`deleteEvent`, `setRecurrenceDate`,
  a three-query `calendar.range` that expands series in-process, and the recurrence
  builder with a locale-safe prose summary.
  **Four decisions carry the phase.**
  (1) **The grammar has one owner**, `packages/calendar/src/rrule.ts`; `@repo/validators`
  constrains only the string's shape. Ours is deliberately stricter than the obvious
  reference implementation — measured, `rrule@2.8.1` accepts a rule with no `FREQ`,
  `COUNT` and `UNTIL` together, `INTERVAL=0`, and `COUNT=-1` (416,011 occurrences).
  (2) **The differential oracle is a checked-in fixture, not a live dependency.**
  `rrule@2.8.1` ran once, into a 528-rule corpus; the permanent test diffs against that
  file, so CI never executes a 2.7-year-stale package and generated projects never inherit
  it. Two anti-tamper gates, because a red differential has one one-line "fix" that turns
  the oracle into a mirror of the engine: the fixture was committed **before** `expand.ts`
  existed, and its SHA-256 is pinned in the test.
  (3) **`0021`'s override index is PARTIAL, and that is the whole point.** Measured on
  PG 18 at 22,400 rows / 2,000 overrides: `(recurrence_parent_id, recurrence_id) WHERE
  recurrence_parent_id IS NOT NULL` is **96 kB against the 176 kB it replaces**, and turns
  1,971 index buffers into 15 — 131×. ⚠️ A plain btree **stores NULL keys**, so "only
  override rows are non-NULL, therefore the index is the same size" is false: the
  non-partial three-column variant is 55% *larger*. Measure index shapes, never infer them.
  (4) **`id` is always the series master's.** The grid renders virtual occurrences and
  materialised overrides as identical chips and both ids are `uuid`, so an override's own
  id never leaves the server, and a write whose target is an override is refused *whether
  or not it carries a scope* — the unscoped half is what stops an override being
  soft-deleted while its master is live.
  Also: a composite self-FK makes "an override lives in its master's calendar" true by
  construction, with `ON UPDATE CASCADE` moving overrides when a master changes calendar
  (⚠️ the cascade bypasses drizzle's `$onUpdate`, so those rows keep a stale
  `updated_at` — Phase 6's feed `ETag` must not rely on it alone); a
  `thisAndFollowing` split **rewrites the `uid` on every re-parented override**, without
  which the split manufactures the exact corruption the schema leaves writer-enforced; and
  the range response distinguishes `truncated` from `seriesTruncated`, over one merged
  time-ordered stream, so truncation is tail-shaped rather than category-shaped.
  Docs: [recurrence](docs/context/calendar/recurrence.md) ·
  [model](docs/context/calendar/model.md) · [api](docs/context/calendar/api.md).
- **Calendar, Phase 1 — calendars, events and a month grid.** `calendars` +
  `calendar_events` (migration `0020`) with the `calendar_event_masters` view,
  `@repo/validators/calendar` (a new exports-map subpath), `lib/calendar-acl.ts`,
  pure month-grid geometry in `lib/calendar/grid.ts`, six Server Actions, three tRPC
  reads, the `/calendar` and `/calendar/event/[id]` routes, eight components and a
  `Calendar` i18n namespace in both locales.
  **The load-bearing decision — and an amendment to the signed-off program plan —** is
  how the derived instants are guarded. The approved design was a `STABLE` trigger with
  a ±3600 s tolerance, justified by "`AT TIME ZONE <non-constant>` is `STABLE`, so it is
  illegal in a CHECK anyway". Probed against PG 18, **both halves were false**: the
  two-argument `timezone(text, timestamp)` is `IMMUTABLE` (only the one-arg session form
  is `STABLE`), and the tolerance **rejected correct data** — Postgres resolves a
  fall-back overlap to the *later* instant where we take the earlier, so they disagree by
  the transition size, which is 7200 s in `Antarctica/Troll`. Shipped instead:
  `start_offset_minutes` / `end_offset_minutes` (`smallint NOT NULL`, **no default**) and
  a tzdata-free arithmetic CHECK. It consults no timezone database, so a tzdata update
  can never make a row un-editable; it is the only variant that rejects a wrong
  overlap-branch row; and `NOT NULL` with no default makes a bypass writer fail loudly.
  ⚠️ A `CHECK` being created is **not** evidence of immutability — Postgres does not
  enforce volatility there at all; generated columns do. The old claim is corrected in
  `packages/calendar/src/timezone.ts` and `docs/context/calendar/model.md`.
  Also: the read surface is deliberately **split** (masters view for list/detail, raw
  table for the window query — measured `Seq Scan` vs `Bitmap Index Scan`, and the view
  hides override rows a range scan must include), pinned by an `EXPLAIN` assertion; the
  integration suite writes its negative cases through **raw SQL that bypasses the
  application writer**, because recomputing with the same function it wrote with would
  assert that a function equals itself. Docs:
  [`docs/context/calendar/`](docs/context/calendar/model.md) —
  [api](docs/context/calendar/api.md) · [acl](docs/context/calendar/acl.md) ·
  [remove-it](docs/context/calendar/remove-it.md).
- **`contrarian` review subagent + a sign-off nudge** — `.claude/agents/contrarian.md`
  is a devil's-advocate agent (no file-editing and no shell — its `tools:` are
  `Read, Glob, Grep, WebSearch, WebFetch`) that steel-mans a plan, audits its unstated
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

- **Claude Code hooks no longer die from a subdirectory** (ai-dev-kit 0.7.2) — all five
  hook commands in `.claude/settings.json` wired their handler on a repo-relative path
  (`node .claude/hooks/…`). Hooks are spawned with the **session cwd, not the project
  root**, so after any `cd` into `apps/web` or `packages/*` the path resolved against that
  subdirectory and the hook died with `MODULE_NOT_FOUND`. Entirely silent: only exit 2
  blocks a hook, these advise, and `docs:sanity`'s existing `existsSync` check passed
  either way — 14 lost runs here and 274 in a consumer repo over a 50-session window, with
  every gate green. Commands are now anchored as
  `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/…"`; **braced and double-quoted are both
  load-bearing** (a bare `$CLAUDE_PROJECT_DIR` is `$null` under the PowerShell hook shell,
  an unquoted path word-splits under bash on a project path containing a space). Exec form
  (`args`) was evaluated and rejected — it moves the path out of `command`, where the
  installer's ownership marker looks, so the next install would append duplicates.
  `pnpm docs:sanity` now **fails** on an un-anchored command, closing the gap that let this
  survive: the wiring was asserted to *exist*, never to *resolve*. Generated projects
  inherit `.claude/` verbatim, so every project made from this template carried the bug.
  Rationale and the residual limit (`CLAUDE_PROJECT_DIR` is the launch cwd, not the git
  root): [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
- **Renovate schedule widened so scheduled updates can actually land** — the
  config shipped `"schedule": ["before 6am on monday"]` with no `timezone` key:
  a 6-hour UTC window per week that the hosted app's run cadence may never
  intersect (this repo's scheduled lane had produced zero update PRs as a
  result). Now a full-day `["on monday"]` window with an explicit `timezone`
  and explicit PR limits (`prHourlyLimit: 0`, `prConcurrentLimit: 10`). **If
  you copied `.github/renovate.json` before this fix, apply the same change.**
- **2026-07-28: three false statements about the agent tooling, and a check that could
  not fail.** Found by running `contrarian` against its own introducing plan — the
  acceptance test PR #11 deferred.
  - The `contrarian` agent was documented as **read-only** while its `tools:` granted
    `Bash`. Shell access is not read-only, and a non-interactive agent run executes
    commands with no permission prompt (verified with a non-allowlisted `whoami`).
    `Bash` is now removed from its `tools:`, so the description and the grant agree.
  - `pnpm docs:sanity`'s hook-wiring assertion was wrapped in
    `if (existsSync(settings.json))` — deleting that file **skipped the check silently**
    rather than failing it. Now an orphaned repo-owned handler fails regardless, with a
    message naming both valid exits (restore the wiring, *or* delete the handler) — a
    generated project that declines this template's `.claude/` config still passes.
  - "The subagent registry is snapshotted at session start, so it doesn't resolve until
    Claude Code reloads" was **wrong**, and appeared in three places. Registration is
    surface-dependent; a session started days later still could not dispatch the agent,
    and `claude --agent <slug>` works when the registry does not. Corrected with the
    fallback recipe in
    [`context/CONVENTIONS.md` → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
  - `docs:sanity` additionally asserts that every agent in `.claude/agents/` is
    referenced by `CLAUDE.md` and vice versa — **existence only**. Whether a well-formed
    agent actually registers is not observable from CI, so a frontmatter-shape validator
    would certify the wrong property; that limitation is documented rather than papered
    over.

### Changed

- **2026-07-28: removed the dated `minimumReleaseAgeExclude` for `next` + `@next/*`**
  added 2026-07-23 for the advisory batch. 16.2.11 cleared the 7-day gate on schedule, so
  the bypass is gone and the supply-chain gate is unconditional again. Verified
  falsifiably: requesting the still-gated `next@16.2.12` is refused with the exclude
  removed and accepted with it restored. Note this is a **no-op at install** — `apps/web`
  declares `^16.2.11`, which the lockfile already satisfies — so the gate re-arms at the
  next *resolution* (a Renovate bump or `pnpm add`), not at `pnpm install`.

### Security

- **2026-07-30: `brace-expansion` 5.0.7 → 5.0.8 — the deferred advisory closed on
  schedule** — GHSA-mh99-v99m-4gvg / CVE-2026-14257 (high; `expand_()` caps the result
  *count* but not each result's *length*, so ~7.5 KB of input reaches an uncatchable
  OOM) affects `<=5.0.7`, so the 5.0.7 override taken on 2026-07-22 was never a fix for
  it. The fix 5.0.8 published 2026-07-23T11:39:25Z, cleared the 7-day age gate on
  2026-07-30, and is in-range for minimatch's own `^5.0.5` — a plain fix-forward.
  **`auditConfig.ignoreGhsas` is empty again**, which is its steady state: the deferral
  existed only because the fix was younger than `minimumReleaseAge`, and it was deleted
  the day the fix aged in rather than bypassed with a `minimumReleaseAgeExclude`.
  `pnpm audit` now guards both brace-expansion advisories live. Note 5.0.9 became
  `latest` on 2026-07-30 (~10 h old at install time) and was **deliberately not taken** —
  inside the gate; the same wait-don't-exclude rule applies to it.
- **2026-07-30: `better-auth` 1.6.23 → 1.6.25 (+ `@better-auth/passkey` in lockstep)** —
  **not advisory-driven**: neither release carries a GHSA, and this is hardening plus bug
  fixes taken while the tree was already being touched. **No schema change** — the
  1.6.23→1.6.25 model definitions were diffed artifact-by-artifact against the installed
  packages and every difference is cosmetic (JSDoc, a widened export list, a build-chunk
  hash), so **no migration accompanies this bump** — in contrast to 1.6.23, which added
  two `two_factor` columns as a *patch*. **Behavioural change worth knowing (1.6.24,
  upstream #10368):** the magic-link and email-OTP *send* endpoints now enforce `Origin`
  on cookieless requests — a request with a **wrong** `Origin` is rejected, while one
  with **no** `Origin` header (server-to-server) still works and same-origin browser
  traffic is unaffected. If you drive those endpoints from a script against a non-default
  origin, send the trusted `Origin` or none at all.
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
- **2026-07-27: neither audit lane can report green on an unaudited tree** — both ran
  `pnpm audit --ignore-registry-errors` with no assertion that an audit actually
  completed, so an advisory-endpoint outage produced a green over an unchecked
  lockfile. It did exactly that on 2026-07-26, papering over the three highs above for
  a day. Both now require the "…vulnerabilities found" trailer a completed report
  always emits — the same guard `.github/scripts/security-triage-issue.sh` already used
  before closing the triage issue: `ci.yml`'s merge gate, and `security-audit.yml`'s
  status propagation, which previously fired only on a non-zero exit so an outage
  skipped it and the daily run concluded *success*. The triage issue was never wrongly
  closed (its own guard held) — the misleading part was the **run conclusion**, which
  is what a human reads. **A genuine npm outage now turns both lanes red** rather than
  green; that is the intended direction to fail.
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
