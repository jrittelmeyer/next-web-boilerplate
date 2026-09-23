# Changelog

Notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); since this is a template
(not a versioned library), `main` is always the supported version and entries mark
milestones rather than package releases. Each milestone is tagged (`v1.0.0`,
`v1.1.0`, …) with a matching
[GitHub Release](https://github.com/jrittelmeyer/next-web-boilerplate/releases).

## [Unreleased]

### Added

- **Predicate sensor for per-user reminder scoping** (B3 predicate-sensor long tail,
  headline item) — a two-user shared-event fixture and planted defect in `@repo/db`'s
  reminder integration suite, plus a spelling pin binding `applyReminders`'s
  existing-row read, close the one gap the 2026-08-08 sweep flagged as destructive-
  shaped. The scoping itself was already correct (`eq(userId)` on both the read and
  the write's existing-row lookup) — nothing behavioral changed; this is coverage
  proving a regression here would go red, the same posture as the F4/F6 sensors.
- **Predicate-sensor long tail, remaining 11 items** (B3, closing the row) —
  `calendar-rsvp`'s deleted-event UPDATE guard; primary-calendar demote's `ne()`
  self-exclusion (redesigned mid-plan per contrarian review: the original test
  would have passed regardless of the predicate, since a later unconditional
  UPDATE in the same transaction masks its effect — now asserted on the
  isolated demote statement); `splitSeries`/`truncateSeries`'s `gte` cut-edge
  inclusivity; `skipOccurrence`'s `(parent, recurrenceId)` pair scoping;
  `removeAttendees`'s event scope; `calendar.list`'s `(userId, organizationId)`
  scope and `calendar.byId`'s occurrence-detail predicate (restated as
  `packages/db` integration tests rather than e2e — faster and immune to the
  local signUp flake for two plain SQL predicates with no page-rendering
  dependency); `markAllRead`'s owner arm and `unreadCount`'s cross-user arm;
  `data-export`'s audit `or()` completeness (flagged by contrarian as the site
  most likely to hide a real bug — it did not); the `(createdAt, id)` keyset's
  same-timestamp tiebreak, shared by five call sites over three tables (one
  parameterized helper, not five copies); `createPost`'s duplicate-title check
  scoped per workspace; `getOrgRole`'s `organizationId` conjunct (a
  privilege-escalation-shaped gap — dropping it lets a role held in one
  organization answer a permission check scoped to a different one); and two
  e2e sensors for `/account` reads with no importable module boundary — the
  expired-session exclusion and the OAuth-only password card, seeded by two
  new direct-DB fixture helpers (no UI path reaches either state). Coverage
  only; no predicate was found already wrong. Plan:
  [`archive/predicate-sensor-long-tail-plan.md`](docs/archive/predicate-sensor-long-tail-plan.md).
- **Self-hosted Renovate workflow** — `.github/workflows/renovate.yml`
  (`renovatebot/github-action`, SHA-pinned, Monday cron + `workflow_dispatch`,
  reusing `.github/renovate.json` unchanged) as the cold fallback for the
  Mend-hosted App, kept dormant per the host decision above.

### Changed

- **`better-auth` `1.6.30` → `1.6.33`** (`@better-auth/passkey` in lockstep),
  routine patch bump, release-1.6 line — published 2026-09-14, outside the
  7-day dep-check window. Diffed all three schema surfaces per the leaf rule
  (`better-auth`'s plugin `schema.mjs` files, `@better-auth/core`'s
  `dist/db/schema` + `get-tables.mjs`, `@better-auth/passkey`'s inline
  schema block): no column changes, no migration needed. Only runtime change
  found was the Cloudflare Turnstile captcha handler logging a reason/details
  object on verification failure — additive, not behavioral.
- **v1.0.0 and v1.1.0 releases published** — both had sat `draft=true` since
  2026-07-20 while this header already claimed a matching GitHub Release per
  milestone; published non-latest (`--latest=false`) so v1.2.0 keeps the
  "Latest" badge.
- **Renovate host decision closed**: kept the Mend GitHub App (opened
  [#56](https://github.com/jrittelmeyer/next-web-boilerplate/pull/56), merged),
  scoped to the no-lockfile update class — full npm-manager/lockfile delivery
  remains an accepted open risk. `.github/workflows/renovate.yml` stays in the
  repo dormant as a cold fallback (`ENABLE_RENOVATE` intentionally unset). See
  [`docs/archive/renovate-b1-host-decision-plan.md`](docs/archive/renovate-b1-host-decision-plan.md).
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

### Fixed

- **The e2e month-boundary defect** (`apps/web/e2e/calendar-invitations.spec.ts`) —
  `dayInThisMonth()` derived the event's month from the runner's UTC clock while
  `/calendar` opens on today in the organizer's **stored zone**
  (`America/New_York`), so the lane went deterministically red 00:00–04:00 UTC on
  the 1st of every month (reproduced 2026-09-01, `3e68733`). Now derives the
  month via `Intl.DateTimeFormat("en-CA", { timeZone: EVENT_ZONE })`, with `now`
  injectable; a new browser-less proof test pins the exact failing instant and
  asserts against it directly, so it discriminates the bug without waiting for
  or faking the real calendar date. Test-only. See
  [`docs/MAINTENANCE.md` → Watch (c)](docs/MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done).
- **`calendar.range`'s error state** (`apps/web/src/components/calendar/calendar-workspace.tsx`)
  — a 429 (the 20/min per-user bucket) or any other range-query failure left
  `rangeQuery.data` undefined, mapping to an empty events array and rendering a
  plain empty month grid indistinguishable from "no events this month". Now
  renders a dedicated error message instead, mirroring the fix already applied
  to `InvitesList` for `listInvites`. The bucket itself is unchanged — it's
  deliberate, documented, and tested behaviour, not the bug. See
  [`docs/context/calendar/api.md`](docs/context/calendar/api.md).
- **`@repo/ui`'s `<Table>` scroll container** (`packages/ui/src/components/table.tsx`)
  — the `overflow-x-auto` wrapper had no focusable content and no `tabindex`, so
  axe's `scrollable-region-focusable` rule (*serious*) fired whenever a table's
  rendered columns actually overflowed, seen intermittently on `/admin/audit`. Now
  carries `tabIndex={0}` + `role="region"` + a hardcoded accessible name — the
  standard shadcn remedy, applied once for every table in the app.
- **Calendar long-tail correctness batch** (B3, all nine items) — none user-visible on
  a standard configured deploy, `contrarian`-reviewed plan:
  [archive/calendar-long-tail-correctness-plan.md](docs/archive/calendar-long-tail-correctness-plan.md).
  - **RFC 6868 param quoting + mailto hygiene** (`packages/calendar/src/ics.ts`) — `CN`
    ran the TEXT escaper (backslash-escapes) on a param-value, a different grammar; a
    conforming reader decoding `Doe\, Jane` back gets the literal backslash. New
    `quoteParamValue`/`caretEncode` implement RFC 5545 §3.2's actual two independent
    rules: DQUOTE-wrap when the value carries `"`/`;`/`,`/`:`/`^`/a newline, and
    caret-encode only `^`→`^^`, `"`→`^'`, newline→`^n` *inside* that quoted form —
    never `;`/`,`/`:`, which RFC 6868 defines no unescape for. `mailto:` addresses now
    percent-encode instead (CAL-ADDRESS is a URI value, not TEXT).
  - **DATE-form `UNTIL` zone semantics** (`untilInstantMs`, now zone-aware) — the
    `"date"` branch computed UTC end-of-day with no zone, so a UTC+ series (e.g.
    Kiritimati, UTC+14) could accept an occurrence a full calendar day past its own
    stated `UNTIL`. Now resolves via `resolveCivil` in the series' own zone.
  - **`seriesEndInstantMs`'s two under-estimate risks** — the `UNTIL` branch now adds a
    120-minute fall-back-straddle slack (sized to `derive.test.ts`'s DST corpus, not a
    tzdata-wide guarantee); the `COUNT` branch now checks `expanded.truncated` before
    trusting a partial walk's last element, returning "unbounded" instead of a wrong
    finite estimate for a sparse rule that hits `MAX_EXPANSION_PERIODS` before
    generating `count` real occurrences.
  - **DAILY+BYMONTHDAY's false RFC citation** — RFC 5545 §3.3.10 only forbids
    `BYMONTHDAY` with `WEEKLY`; the refusal for `DAILY` (still refused — this engine's
    `DAILY` expansion has no `BYMONTHDAY` filter) now carries its own honest message
    instead of borrowing `WEEKLY`'s citation.
  - **One-off events' RSVP tokens never expired** (`loadSeriesForEmail`) —
    `series_end_at` is schema-NULL for every one-off, so passing it straight through
    minted a non-expiring token for an ordinary event with a perfectly good end time in
    the same row. Falls back to the event's own `end_at` when `rrule === null`.
  - **`updateOccurrence` accepted a non-member `recurrenceId`** — no validation that a
    caller-supplied date was an actual generated occurrence, so `onConflictDoUpdate`
    would write a "phantom chip" no expansion of the rule ever produces. Now reuses
    `planSeriesCut`'s bound check (the same one `scope: "thisAndFollowing"` already
    runs).
  - **Actor-self cancellation email, mixed unverified+configured state**
    (`softDeleteEvent`) — the `userId`-only exclusion missed an unverified self-guest
    row (F6's `userId: NULL` shape), so the deleter could get emailed about their own
    delete on an email-configured deploy. Now excludes by email too, `lower()`-matched
    against `actor.email` (mixed-case accounts included).
  - **`loadRecipients`'s organizer-exclusion comment vs. its filterless SELECT** — the
    comment claimed "the organizer is never a row here"; the trace this plan asked for
    before trusting that (before writing anything) found the opposite: nothing upstream
    (the composer, `addAttendees`) stops a genuine self-invite. Decision resolved to
    **(b)**, not the plan's recommended (a) — added the filter instead of just fixing
    the comment.
  - Full gate green (lint · type-check · build); `packages/calendar` 100/100/100/100
    coverage (838 tests); real-Postgres integration coverage added for both DB-predicate
    items (`packages/db/__tests__/integration/calendar-attendees.test.ts`) alongside the
    existing mock-based unit suites, since a mocked `db.select` cannot prove a `WHERE`
    clause. Live-verified: a fresh `:3100` prod build boots clean with DB connectivity
    after the change.

### Security

- **`vitest` (+ `@vitest/coverage-v8`, `@vitest/mocker`) bumped `4.1.9` → `4.1.11`** —
  GHSA-82fw-gwwq-j7x9 (MODERATE: `@vitest/mocker`'s redirect mock allows path
  traversal / arbitrary file read), vulnerable `>=2.1.0 <4.1.11`. A direct
  devDependency already declared `^4.1.9` in eight `package.json` files — 4.1.11
  is in-range, so this is a plain `pnpm update vitest @vitest/coverage-v8
  --recursive`, not an override. `vitest@5.0.0` exists but is a new major,
  published 2026-09-03 (inside the 7-day gate) — stays on the 4.x fix-forward.
- **`sharp` scoped override, `<0.35.4` → `0.35.4`** — GHSA-rgj7-g3m4-5g8c (→
  GHSA-g89c-p67h-r497 + GHSA-2jg2-4ch7-h545, HIGH: libheif flaws in the AVIF/HEIF
  decoder), vulnerable `<0.35.4`. Same shape as the 2026-08-14 override removed
  2026-08-26: `next@16.3.3`'s own `sharp` pin excludes the fix again. 0.35.4
  (published 2026-08-26) cleared the 7-day gate 2026-09-02.
- **`baseline-browser-mapping` scoped override, `<2.11.0` → `2.11.20`** —
  GHSA-w5vr-8v7q-w6rv (MODERATE: process termination via invalid input, a DoS),
  vulnerable `<2.11.0`. Reached via `next`'s own dependency — build/dev tooling
  only (Storybook's builder-vite + `@sentry/webpack-plugin`). 2.11.20 (published
  2026-08-27) cleared the gate; 2.11.21 (2026-09-03) is boundary-fresh with no
  advisory delta, so the aged version is taken instead (the postcss/browserslist
  precedent). `pnpm audit`: 0 advisories after all three fixes.
- **`fflate` scoped override, `<0.4.9` → `0.4.9`** — GHSA-px8p-9vwx-vf98 (MODERATE:
  `unzipSync` can enter an infinite loop parsing a malformed ZIP64 archive),
  vulnerable `>=0.4.5 <0.4.9`. Reached only via `posthog-js@1.391.2`'s own `^0.4.8`
  dependency (`apps/web>posthog-js>fflate`) — 0.4.9 is in-range, a fix-forward, not
  a pin-bypass, and cleared the 7-day age gate long before this advisory was
  caught (published 2026-07-20; caught by the daily audit lane 2026-09-05). Ranged
  key per the standing convention (see the other entries below): removed once a
  routine `posthog-js` bump naturally carries the lockfile past 0.4.9. `pnpm
  audit`: 0 advisories after the bump.
- **`browserslist` scoped override, `<4.28.7` → `4.28.8`** — two NEW HIGH advisories
  (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g: uncaught crash / prototype write via
  untrusted `browserslist-stats.json` in `normalizeStats`), vulnerable `<=4.28.6`.
  Reached only via `@babel/helper-compilation-targets` and `webpack` (Storybook's
  builder-vite + `@sentry/webpack-plugin`) — build tooling only, and this tree has
  no `.browserslistrc`, no `package.json` `browserslist` field, and no custom stats
  file anywhere, so the untrusted-stats vector has no artifact to exploit even in
  principle. `4.28.7` (2026-07-21) is the true advisory floor; `4.28.8` (2026-08-08)
  is taken instead — no advisory delta over `.7`, same reasoning as the `postcss`
  8.5.23-vs-8.5.24/25 precedent — and both clear the 7-day age gate, so no
  `minimumReleaseAgeExclude` was needed. `pnpm audit`: 0 advisories after the bump;
  lockfile diff touched only `browserslist` and its own bundled data packages
  (`caniuse-lite`, `electron-to-chromium`, `node-releases`,
  `update-browserslist-db`, `baseline-browser-mapping`).
- **Least-privilege pass on the tracked `.claude/settings.json`.** It ships verbatim
  into every generated project, so it is now written for a stranger's repo.
  `Bash(winget install *)` (arbitrary machine-wide install) and `Bash(docker exec *)`
  (arbitrary exec in any container) are **removed**, along with two dead grants; the
  gate and verify-lane commands are added. New `deny` tripwire: five force-push
  patterns per shell, each spelling verified blocked — `--force`, `-f`, the
  flag-after-remote orders, `--force-with-lease`, and the refspec form `origin +main`;
  a plain `git push origin main` is unaffected. `deny` beats every scope including
  `bypassPermissions` (verified by running it).
- ⚠️ **Permission rules are prefixed per shell tool, and `Bash(...)` does not reach the
  PowerShell tool** — there is a separate `PowerShell(...)` prefix. Every allow entry is
  now listed twice. Before this pass all eight entries were `Bash(...)` only, i.e. inert
  for the primary shell on Windows hosts since the 2026-07-14 release commit.
- **Env files are `ask`, not `deny`** — a `Read` *deny* rule also blocks Edit and Write
  on the same path, and `scripts/init-app.mjs` prints `Edit .env` as Next Step 1 of
  every generated project, so a deny would have bricked the on-ramp the template ships
  with. Recorded alongside it in
  [`CONVENTIONS.md`](docs/context/CONVENTIONS.md#agent-tooling-claude): `ask` behaves as
  a refusal in headless `claude -p` runs; `grep` **is** intercepted by `Read` rules
  despite being absent from the documented list, while shell sourcing and
  `node fs.readFileSync` are not; and a git `pre-push` hook cannot police force-pushes
  at all, since it never sees the flags.
- **`minimumReleaseAgeExclude` emptied on schedule** — the ten-entry dated exception
  taken 2026-08-26 for `next` 16.3.3 (+ `@next/env` and the 8 `@next/swc-*` lockstep
  binaries), covering the AVIF-decode RCE GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497, is
  removed: 16.3.3 (published 2026-08-25T15:32Z) cleared the 7-day gate unaided at
  15:32Z on 2026-09-01. The install-time age gate is unconditional again with zero
  exclusions. Third use of the park/exit machinery, third clean exit on schedule.
- **`fast-uri` scoped override, `<3.1.5` → `<3.1.6`** — four NEW HIGH advisories
  (GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc: SSRF via malformed IPv6/repeated
  percent-decoded hostname normalization; GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp:
  host confusion via skipped IDN canonicalization/percent-encoded scheme
  normalization), vulnerable `<3.1.6`. Same build-tooling-only path as prior fast-uri
  batches (`@sentry/webpack-plugin` → `webpack` → `schema-utils` → `ajv` →
  `fast-uri`). `3.1.6` (published 2026-08-23) cleared the 7-day gate 2026-08-30 and is
  in-range for ajv's `^3.0.1`. `pnpm audit`: 0 advisories after the bump; lockfile
  diff touched only `fast-uri`.
  - ⚠️ Same-day `3.1.7` (published 2026-09-02, ages in 2026-09-09) is itself a
    security release fixing two more HIGHs — GHSA-qw65-cvwx-89v3 (port injection in
    `serialize()`), GHSA-58mr-gqgx-xq4g (IP-literal host confusion) — found via
    fast-uri's own release notes, **not yet in `pnpm audit`'s feed** at take time.
    Pre-emptively parked in `auditConfig.ignoreGhsas` rather than left to surface
    unplanned once the feed catches up; promotes to a `3.1.7` override and drops both
    ignore entries on 2026-09-09.
- **`knip` `6.24.0` → `6.35.1`** — GHSA-7w5x-hrqm-74c2 (HIGH: DoS via a malformed
  TOML document), sole path `.>knip>smol-toml` at `1.7.0`. `knip@6.35.1` (published
  2026-09-09, safely past the 7-day gate) declares `smol-toml@^1.8.0`, clearing the
  advisory without an override. Exact-pinned, matching the existing pin style.
  `pnpm audit`: 0 advisories after the bump. The newer resolver surfaced two
  pre-existing knip findings the older version missed — `tooling/tailwind`'s
  `tailwindcss` devDependency (base.css only carries Tailwind v4 at-rules, no
  `@import "tailwindcss"` of its own; consumers import it before pulling in this
  file) and `packages/ui`'s dangling `./hooks/*` export entry (no `src/hooks/`
  directory exists yet). The first got a documented `ignoreDependencies` in
  `knip.jsonc`; the second is knip's non-fatal "Configuration hints" class (exits 0
  both before and after this bump) and was left as-is.
- **`fast-uri` scoped override, `<3.1.6` → `<3.1.7`** — promoted on schedule (aged
  in 2026-09-09, taken overdue 2026-09-22). The 2026-09-02 note asked to verify
  `pnpm audit --json` actually goes red on `3.1.6` for the two parked GHSAs before
  trusting the promotion; that check came back negative — neither
  GHSA-qw65-cvwx-89v3 nor GHSA-58mr-gqgx-xq4g resolves via the GitHub Advisories API
  (404 on both), and npm's advisory-bulk endpoint returns nothing for fast-uri
  `3.1.5`/`3.1.6`/`3.1.7` beyond the four already fixed at `3.1.6`. Both IDs were
  never published — the pre-emptive park had nothing to confirm. Deleted rather
  than promoted (`auditConfig.ignoreGhsas` is `[]` again); `3.1.7` is taken purely
  as a routine currency bump (in-range for ajv's `^3.0.1`), not because it fixes a
  live advisory. `pnpm audit`: 0 advisories after.
- **`next` `16.3.3` → `16.3.6`, age-gate exception (RCE in `next/og`)** —
  GHSA-vcvr-r3jv-pc5j, fixed in 16.3.6 (published 2026-09-22T16:19:00Z, inside the
  7-day gate — ages in 2026-09-29). `apps/web/src/app/opengraph-image.tsx`,
  `icon.tsx`, and `apple-icon.tsx` all use `next/og`'s `ImageResponse` directly, and
  all three are fully public, unauthenticated routes (no session gate — every
  visitor and crawler hits them), so this is a real, reachable RCE path, not a
  theoretical one. Waiting the ~6 days for the gate to clear naturally meant
  knowingly carrying an unpatched RCE on zero-access-control routes, so this took
  the age-gate's route (2) exception (`minimumReleaseAgeExclude`, same shape as the
  2026-08-26 `next` 16.3.3 AVIF take): 10 exact-version-scoped entries (`next` +
  `@next/env` + 8 `@next/swc-*` lockstep binaries), expiring 2026-09-29.
  `@next/eslint-plugin-next` untouched (separate `tooling/eslint` dependency,
  still resolves 16.2.12). `sharp`'s existing override (`0.35.4`) needed no
  change — 16.3.6's own `optionalDependencies.sharp` pin is still `^0.35.4`. This
  take incorporates 16.3.4 and 16.3.5 (both ship in the same lockfile diff); the
  16.3.4 pre-triage from 2026-09-01 (AVIF Image Optimization re-enabled,
  `sharp` `^0.35.3` → `^0.35.4`, three unrelated backports, nothing touching
  `output: 'standalone'`) is folded in rather than re-verified separately. Full
  gate green (lint, type-check, build); `pnpm audit`: 0 advisories after.
  Live-verified on a fresh `:3100` prod build: `/icon`, `/apple-icon`,
  `/opengraph-image`, `/twitter-image` all 200 `image/png`. **Not done this
  pass** (carried forward as a gap, same as the 16.3.3 take): the Docker
  standalone boot check, an AVIF-source `/_next/image` drive, and the
  `@next/eslint-plugin-next` lockstep bump.

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
