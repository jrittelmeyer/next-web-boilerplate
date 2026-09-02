# Maintenance — keeping this stack current

How this repo stays up to date as the ecosystem moves, and how to run the same
framework in an app you started from it. The stack was current and fully verified at
release; this doc is what keeps that true.

## Philosophy

- **`main` is the version.** There are no release branches; fixes and upgrades land on
  `main` (see the [security policy](../.github/SECURITY.md)). Downstream apps rebase
  or cherry-pick what they want.
- **Every change runs the full gate** — `pnpm lint` · `pnpm type-check` · `pnpm build`
  — plus a live check where the change is observable. Verify by running, not by
  assuming.
- **Plan before nontrivial changes.** Upgrades and new features get a written plan
  first (agents: see the working agreements in [`AGENTS.md`](../AGENTS.md)).

## Dependency policy

The full per-dependency record (versions, pin style, and *why*) is
[`context/STACK.md`](context/STACK.md). The rules:

1. **Version-check against the npm registry, never blog posts** —
   `pnpm view <pkg> version` (or the registry dist-tags endpoint) before adding or
   bumping anything.
2. **A 7-day minimum release age, enforced at two layers**:
   - **Renovate** (`.github/renovate.json`) never *proposes* a release younger than
     7 days (security fixes bypass this).
   - **pnpm** (`minimumReleaseAge: 10080` in `pnpm-workspace.yaml`) validates every
     lockfile entry at *install* time, so a too-fresh package can't enter the tree at
     all. Note pnpm's gate does **not** exempt security fixes — a <7-day-old fix takes
     the three-route rule stated at `minimumReleaseAge` in `pnpm-workspace.yaml`:
     default is route (1), park the GHSA in `auditConfig.ignoreGhsas` until the fix
     ages in; a dated `minimumReleaseAgeExclude` is route (2), a bounded exception
     (HIGH+ or reachable by untrusted input in a configured deploy). When an exclude is
     removed on schedule, **the proof is CI's frozen install, not the local one** — pnpm
     reads publish times from registry metadata that can be cached locally, so a local
     green is the weaker signal.
3. **Exact-pin frequent publishers** (`stripe`, `@sentry/nextjs`, `posthog-*`, `knip`,
   `pg-boss`, …): with a caret range, a near-daily publisher re-trips the age gate on
   every resolve. Renovate's `rangeStrategy: "auto"` preserves each dependency's pin
   style when bumping.
4. **Cross-package pins stay in lockstep** — `pnpm lint:deps` (manypkg) fails CI if a
   shared dependency's range diverges between workspace packages; auto-align with
   `pnpm fix:deps`. Some pairs are deliberate lockstep (e.g. `@better-auth/passkey`
   must match `better-auth` exactly).
5. **Audit allowlist hygiene** — `pnpm audit` gates CI. For a transitive advisory,
   prefer a scoped **override** in `pnpm-workspace.yaml` when a compatible fixed
   version exists (see the dated override entries there — each carries its removal
   condition, mirrored in the Watch items below); acknowledge it in
   `auditConfig.ignoreGhsas` (with its reason) only when nothing fixable exists.
   **Prune both kinds** once the upstream fix lands. Same for the `vite` version
   override — bump it as newer releases age out.
6. **A `next` bump must exercise every deployment code path it touches, not just the
   one that's convenient to check locally.** Learned 2026-08-22: `next` 16.3.1 passed
   the full gate, both E2E CI lanes, and a manual `:3100` `next start` live-verify,
   but CI's Docker image job caught a boot-crashing regression in `output:
   'standalone'` — a code path `next start` never touches at all. Before taking a
   `next` bump: (a) run an actual `docker build` + `docker run` + `/api/health` hit
   locally for both the `web` and `worker` Dockerfile targets, not just `next start`;
   (b) skim the *immediate next* patch version's changelog for anything touching the
   subsystem just bumped, independent of whether it carries security content — "is
   the newer version security-relevant" is the wrong question when the newer version
   might instead fix a regression the one you're about to pin just introduced. Full
   incident: [CHANGELOG](../CHANGELOG.md) 2026-08-22, [Watch → `next`
   16.3.x](#watch-items-known-tracked-deliberately-not-done).

## Automation on a fork / new repo

GitHub repo settings don't travel with a template copy. On your own repo:

- **Renovate dependency updates run via `.github/workflows/renovate.yml`**, a
  self-hosted `renovatebot/github-action` cron reusing the committed
  `.github/renovate.json` unchanged. Needs a repo secret `RENOVATE_TOKEN` — a
  classic PAT with `repo` + `workflow` scope (`workflow` is required because
  the config extends `helpers:pinGitHubActionDigests`, which writes to
  `.github/workflows/*.yml`; the ambient `GITHUB_TOKEN` can't be used — it
  can't trigger downstream CI on PRs it opens). Validate config edits with
  `pnpm dlx --package renovate renovate-config-validator .github/renovate.json`.
  **Gated on `ENABLE_RENOVATE` since 2026-09-02** (job-level `if`, the
  `ENABLE_CODEQL`/`ENABLE_VISUAL` convention): unset — the state in this repo and in
  every generated project — the lane *skips silently* rather than failing. Enabling
  takes **two** actions, the secret **and** `gh variable set ENABLE_RENOVATE --body
  true`; see the dated liveness check in Watch items below, which exists because a
  forgotten variable would make the workflow silently dead rather than loudly broken.
  The fallback to the **Mend GitHub App**, built 2026-08-31 (`BACKLOG.md` B1; which host
  stays is the owner's call — see Watch items): Mend was
  confirmed installed, Interactive-mode, and schedule-healthy, but every
  scheduled Monday window since 2026-07-22 produced zero `renovate/*`
  branches — a manual trigger's own job log showed the run get killed
  mid-lockfile-generation with no error emitted, consistent with a
  Community/Free-tier resource ceiling for this monorepo's size. Full
  diagnosis: `docs/archive/renovate-b1-diagnosis-plan.md`. A fork that wants
  the Mend App instead: choose **"Only selected repositories"** when
  installing (an "All repositories" install defaults the org to **Silent**
  mode — scans but never creates issues/PRs — and changing GitHub-side repo
  access afterward doesn't clear it; flip to Interactive at
  [developer.mend.io](https://developer.mend.io) if the dashboard issue never
  appears), and remove `renovate.yml`.
- **Re-create the CI gate variables** (they're repo variables, not workflow content):
  `ENABLE_CODEQL` (needs a public repo or GHAS), `ENABLE_VISUAL`, `ENABLE_CSP_NONCE` (the
  nonce-mode e2e twin), `ENABLE_RENOVATE`
  (the self-hosted Renovate workflow — set it **with** the `RENOVATE_TOKEN` secret,
  never one without the other), and optionally `ENABLE_PERF` / `ENABLE_GHCR_PUBLISH`.
  Unset, those lanes *skip silently* — they don't fail. → [`context/DEPLOYMENT.md → CI/CD`](context/DEPLOYMENT.md#cicd-github-actions)
- Optional: a `CODECOV_TOKEN` secret (coverage upload is skipped cleanly when unset).

## Watch items (known, tracked, deliberately not done)

**This section is the canonical live Watch list** — full per-item detail and removal
conditions live here; [`BACKLOG.md`](BACKLOG.md) carries one-line pointers. Currently:

- **`browserslist` override (2026-09-02)** — `"browserslist@<4.28.7": 4.28.8` in
  `pnpm-workspace.yaml`, taken for two NEW HIGH advisories (GHSA-c83g-rgw3-j3cx,
  GHSA-73wf-gq98-2v4g) that surfaced as pure advisory-database drift against an
  unchanged lockfile (proven: `pnpm-lock.yaml` was byte-identical across the prior
  three commits, and the same audit lane was green on the commit before this one).
  Build-tooling-only (`@babel/helper-compilation-targets`, `webpack` — reached via
  Storybook's builder-vite and `@sentry/webpack-plugin`); this tree has no
  `.browserslistrc`, no `package.json` `browserslist` field, and no custom stats
  file, so the untrusted-`browserslist-stats.json` vector has no artifact to hit.
  *Removal condition:* remove once `next`'s own resolution and the natural tree
  both carry `browserslist` past `4.28.6` unaided (a no-op reinstall confirms it —
  the same check that retired the `sharp` override on 2026-08-26, see
  [archive/WATCH_HISTORY.md](archive/WATCH_HISTORY.md#sharp-override-removed-2026-08-26)).

- **Calendar offset drift** — `calendar_events.start_offset_minutes` /
  `end_offset_minutes` are a snapshot of what the IANA database said when the row was
  written. That is deliberate: the CHECK guarding the derived instants is pure arithmetic
  precisely so a tzdata update can never make an existing row un-editable (Postgres
  re-evaluates every CHECK on every `UPDATE`, including the one that soft-deletes).
  The trade is that after a real political timezone change, rows written under the old
  rules keep their old offsets. **Detection, not prevention:** the assertion in
  `packages/db/__tests__/integration/calendar-events.test.ts` ("offset drift — detected
  and surfaced, never blocked") recomputes every row's offset from the live tz database
  and names the mismatches. *Removal condition:* none — this is the design. *Action when
  it fires:* confirm the zone's rules genuinely changed (Node's ICU release notes), then
  re-derive the affected rows through `deriveEventInstants` in a one-off migration. Never
  "fix" it by moving the check into a constraint.

- **`/admin/audit` intermittently trips `scrollable-region-focusable`** — axe rates it
  *serious*, so it fails the e2e a11y gate when it fires. The node is
  `<div data-slot="table-container" class="relative w-full overflow-x-auto">` in
  `packages/ui/src/components/table.tsx`: an `overflow-x: auto` container with no
  focusable content and no `tabindex`, which axe reports only when the table **actually**
  overflows — so it depends on the rendered column widths, and the audit table's widest
  column is a generated e2e email address. Seen once on 2026-07-31 and **not reproducible
  on a re-run of the same build**; the surface is untouched by the calendar work.
  *Removal condition:* give the scroll container `tabIndex={0}` plus a `role="region"`
  and an accessible name (the standard shadcn remedy) — a `@repo/ui` change that touches
  every table in the app, which is why it is recorded rather than folded into an
  unrelated branch.

- **Calendar override integrity — two writer-enforced invariants** — an override must
  carry its master's `uid`, and its parent must be a recurring event. Both are cross-row
  predicates a `CHECK` cannot express, so the database enforces neither. **Detection, not
  prevention:** the two scans in
  `packages/db/__tests__/integration/calendar-recurrence.test.ts` ("the two
  writer-enforced invariants — detected, never blocked") plant the corruption and name
  the offending rows. The third rule — an override lives in its master's calendar — *is*
  enforced, by the composite FK `calendar_events_parent_same_calendar`.
  *Removal condition:* none — this is the design; a guard that can make an existing row
  un-editable is worse than the drift it prevents. *Action when it fires against real
  data:* find the writer that produced it (a split that skipped the `uid` rewrite is the
  likely shape) and repair the rows, never add a constraint that would strand them.

- **Calendar cascade-moved overrides keep a stale `updated_at`** — the composite FK's
  `ON UPDATE CASCADE` is a *database* write, so it bypasses drizzle's `$onUpdate`. Moving
  a master to another calendar therefore moves its overrides with correct data and an old
  timestamp. Harmless today; it is a **trap for Phase 6's feed `ETag`**, which must not
  derive change detection from `updated_at` alone for override rows. Recorded in
  `packages/db/AGENTS.md`. *Removal condition:* Phase 6 lands a change-detection scheme
  that does not read `updated_at` on its own.

- **`calendar.range` is 20 reads/min per user, and exceeding it renders a blank grid**
  — every month-arrow press is one read and `/calendar` always opens on today, so
  paging through two years (24 presses) trips `userRateLimitedProcedure` inside one
  window. The 429 leaves `rangeQuery.data` undefined, the grid maps `?? []`, and the
  user sees an **empty month with no message** — indistinguishable from "you have no
  events". Found while writing the Phase-2 e2e flow, which hit it and took three runs
  to diagnose for exactly that reason; the spec now asserts no tRPC call answered
  non-200 so the next occurrence names itself. The cap is Phase-1 behaviour and is
  deliberately **not** changed here — raising a rate limit is a security decision, not
  a calendar one. *Removal condition:* either raise the bucket for this procedure, or
  (better, and independent of the number) render the query's error state instead of an
  empty grid — the blank-grid failure mode is the part worth fixing.

- **Calendar range caps under real load** — `MAX_RANGE_ROWS` (2,000) now covers concrete
  rows *and* expanded occurrences merged into one stream, and `MAX_RANGE_SERIES` (200)
  bounds expansion work per request. A month that used to fit may now truncate. The merge
  makes the truncation tail-shaped rather than category-shaped, and `truncated` /
  `seriesTruncated` are reported separately — but the numbers themselves have not been
  exercised against a large tenant. *Removal condition:* a live run with a
  many-series calendar confirms both caps, or moves them.

- **Calendar reminders — three accepted limits, all writer-enforced, none schema-enforced.**
  Filed 2026-08-02 by the doc audit: each was recorded in a context doc or a source comment
  and tracked nowhere, which is how *"the schema permits it"* turns into a shipped bug.
  All three belong to the **Calendar Phase 6** row in [`BACKLOG.md`](BACKLOG.md).
  - **`anchor` is CHECK-gated to `'start'`, and dropping that CHECK is a THIRD of the change.**
    The sweeper windows on the occurrence's **start** instant, so an end-anchored reminder
    would fall outside the window and **silently never fire**: no log, no throw, no
    dead-letter. ⚠️ **And a reminder the composer cannot see is a reminder the next save
    DELETES** (`components/calendar/calendar-workspace.tsx`) — the failure is data loss, not
    a missed notification.
    *Removal condition — three steps, in this order:*
    **(i) the expansion supports it — DONE 2026-08-02.** `expandSeries` takes
    `match: "overlaps"` and tests each occurrence's **real end instant**. Note it is an exact
    test, *not* the widened nominal-span bound this condition used to ask for: a nominal span
    is whole days, so it is an hour short across a fall-back transition.
    ⚠️ **(i) alone changes nothing for reminders** — the sweeper does not opt in, deliberately.
    **(ii) the sweeper opts in *and* computes fire times from `endAtMs`** — `firesInWindow`
    reads `startAtMs` today.
    **(iii) the composer seed and `REMINDER_SUBMITTABLE_ANCHORS` widen together.**
    **Then** the CHECK goes.
  - **Guest reminders are prevented by the writer, not the schema.**
    [`calendar/reminders.md`](context/calendar/reminders.md) states the trap outright: a
    reader who checks only the DDL would conclude they were already sanctioned. An external
    guest has no `user_id` (so no in-app channel) and no consent record. **Owner decision
    2026-08-02: out of scope — a documented extension point, not scheduled work.** Recurring
    mail to non-users needs consent, and `email_suppressions` is a **bounce/complaint** list,
    not a consent record. *Removal condition (unchanged, should anyone revisit it):* a consent
    + unsubscribe surface — not a widened write path.
  - **Reminder emails are en-GB in the event's zone, even for an account holder whose zone
    `user_preferences` stores.** Forced for a Phase-4 guest (no account ⇒ no stored locale or
    zone); *not* forced for a Phase-5 reminder. `packages/email/src/format.ts` warns against
    "fixing" it locally, since that package cannot know a locale. *Removal condition:* the
    caller passes locale + `user_preferences.timeZone` into the template.
  - Recorded here too, since it is a **deployment** knob rather than a build row: the sweeper
    looks back a **fixed 60 minutes**, so a worker outage longer than that silently drops what
    it slept through. Deliberate — a persisted cursor is one stuck row away from replaying
    everything or skipping a day, and the dedupe unique already makes an overlapping window a
    no-op. *Action if a deployment cannot tolerate a >60 min gap:* raise the one constant.
    (Its sibling — a day-before reminder crossing a DST transition fires an hour off in local
    terms — is argued in [`context/DECISIONS.md`](context/DECISIONS.md) and stays accepted.)

- **Three distinct e2e defects — and the lane has gone red twice: 2026-08-03 and
  2026-09-01.** PR #34 attempt 1 (08-03): **1 failed · 9 flaky · 56 passed**; `3e68733`
  attempt 1 (09-01): the month-boundary defect, **(c)** below. The single "e2e signup
  flake" row this replaces conflated two unrelated defects, and the 08-03 red was *not*
  the one it named — read the run log, not the label, before acting on any of them.
  - **(a) The signup hang — DIAGNOSED 2026-08-03: a pre-hydration click, fixed in
    `e2e/support/auth.ts`.** All 9 flaky were this, and every one recovered on retry.
    `page.goto` resolves on **`load`**, which fires before React hydrates, and Playwright's
    actionability checks do not wait for hydration — the server-rendered form is fillable
    and clickable while its submit handler is not yet attached. A click landing in that
    window submits **nothing**: no request, no session, and `waitForURL("**/dashboard")`
    then hangs for the whole timeout with no error on the page. A slow, loaded CI runner
    widens the window, which is why it read as "timing, not a code bug".
    *Evidence:* reproduced **8/8** under 6× CPU throttling with the old helper sequence
    (no request ever issued); and in CI the hung attempts left **no** server-side
    `[email] verification email for …` line, i.e. the account was never created — each
    retry mints a fresh address, so `e2e-admin-audit`, `e2e-admin-pagination` and
    `e2e-org-invitee` show 1 line each, not 2.
    *Fix:* `settleThenSubmit` waits for the form to settle, then awaits the auth response
    **alongside** the click and asserts its status — so a 429 (this endpoint is 5/60s) or a
    5xx fails by name instead of degrading into the same silent hang. (Precision, from the
    2026-08-06 audit's re-review: the settle wait is `networkidle` — a network proxy for
    hydration, not proof of it — so the window is narrowed, not provably closed; what *is*
    closed is the silent-hang failure mode, since a pre-attach click now times out by name
    in `waitForResponse`.)
    ⚠️ **Two hypotheses were tested and are now RULED OUT — do not revive them without new
    evidence.** (i) *A Next router race* (`signup-form.tsx:88-89` fires `router.push()` then
    `router.refresh()`): **30/30** paced signups navigated cleanly on `next@16.2.12`, and the
    missing server-side line disproves the "account created, navigation never committed"
    shape it required. (ii) *The 5/60s rate limiter*: reachable (an unpaced loop tripped it
    on the 5th signup) but the failing CI log contains **zero** `429`s and no
    "Too many requests".
    *Removal condition:* 20 consecutive green e2e lanes, **or** a recurrence whose uploaded
    trace names a different cause. ⚠️ Still unmeasured: a throttled control arm proving the
    settle wait alone fixes it — the local server died mid-run three times. CI is the arbiter.
  - **(b) The `set-active` hang** — `e2e/organization.spec.ts:43`. **This is what died at
    Retry #2 and turned the lane red.** Root cause **unknown**: `waitForResponse` was the
    pending op at teardown, so the predicate never matched, but whether the POST never
    fired, returned non-2xx, or the `Promise.all`'s *click* half hung is not recoverable
    from the annotation. The 2026-08-03 change removed `r.ok()` from the predicate (a
    non-2xx now fails on status instead of hanging) and gave every Playwright lane a
    report + traces. *Removal condition:* a recurrence is diagnosed from its uploaded
    trace, or 20 consecutive green runs of the e2e lane.
  - **(c) The month-boundary defect — DIAGNOSED 2026-09-01, fix pending
    ([`BACKLOG.md`](BACKLOG.md) B2).** `3e68733` attempt 1 (2026-09-01 02:37Z) failed
    in `e2e/calendar-invitations.spec.ts:165` — the "Standup" chip never appeared.
    `dayInThisMonth()` (`:54-58`) derives the event's month from the **runner's** clock
    (`new Date().getMonth()` → September, UTC) while the organizer's stored zone is
    `America/New_York` (`:73`) and `/calendar` opens on *today in the stored zone*
    (`calendar/page.tsx` → `instantToCivil(Date.now(), preferences.timeZone)`) — still
    22:37 on 08-31, so the grid showed August with nothing to click. **Deterministic**,
    not flaky: every push, heartbeat or rerun landing in **00:00–04:00 UTC on the 1st
    of each month** (to 05:00 in EST — the Thursday 04:30Z heartbeat is inside that
    window whenever a winter 1st is a Thursday) goes red; attempt 2 at 04:18Z went
    green as predicted. `a11y.spec.ts:157`'s UTC-month seed is safe
    (`DEFAULT_TIME_ZONE = "UTC"`, `lib/user-preferences.ts`; the a11y user stores no
    zone), and no other spec derives a month from the runner clock. `apps/web/e2e`
    ships to generated projects, so their lanes inherit the window. *Fix (test-only,
    S):* derive the day in `EVENT_ZONE` (`Intl.DateTimeFormat("en-CA", { timeZone })`)
    and make `now` injectable so the discrimination proof runs on any day — **not**
    `calendar.spec.ts`'s fixed-date + `gotoMonth` pattern: this spec visits `/calendar`
    six times and ~7 arrow presses per visit would trip the 20/min `calendar.range` cap
    its header already works around. ⚠️ This red reset the 20-consecutive-green
    counter that (a) and (b) share. *Removal condition:* the fix merges and the
    2026-10-01 window passes green.
  - ⚠️ **Why this was invisible for so long:** all three Playwright lanes ran a
    report-less CI reporter while `ci.yml` uploaded a report directory that was never
    created, and `if-no-files-found` defaulted to `warn` — an annotation nobody read. The
    e2e trace mode (`on-first-retry`) also captured neither the initial attempt nor the
    last, which is where a test exhausting `retries: 2` actually dies. All fixed
    2026-08-03; the uploads now use `if-no-files-found: error` so a re-break is red, not
    quiet.

- **A global `now` for relative-time formatting is deferred** (noted in
  [`context/I18N.md`](context/I18N.md)) — self-gating, because **no route server-renders a
  `relativeTime` yet**. *Removal condition:* add it alongside the first route that does, or
  the server and client will disagree on "5 minutes ago" across a hydration boundary.

- **TypeScript 7 cutover — HOLD, re-gated on TS 7.1.** `typescript@7.0.2` GA'd 2026-07-08 as
  the native Go compiler; the Next-side blocker lifted 2026-08-02 (`experimental.useTypeScriptCli`
  in stable `next` 16.2.12+), but **that is not the binding constraint.** What still blocks it,
  each checkable without building:
  - **TS 7 ships no `tsserver`** (registry `bin`: 6.0.3 → `{tsc, tsserver}`, 7.0.2 → `{tsc}`).
    Bumping the workspace `typescript` leaves the editor's "Use Workspace Version" with no
    server and the `next` tsserver plugin (`tooling/typescript/nextjs.json`) with no host — the
    editor would check with a different compiler than the build, and **no `ci.yml` lane runs an
    editor**, which is why the earlier "run a cutover trial" gate was the wrong instrument.
  - **Two template-surface costs** (`scripts/init-app.mjs` ships this tree verbatim): TS 7 is a
    native binary for 20 platform tuples with **no musl variant** (the builder is
    `node:24-alpine`; TS 6 is pure JS); and `next.config.ts`'s `experimental` key exists **only**
    in nonce mode, so `useTypeScriptCli` must be **merged** into that object — added as a sibling
    key it silently drops one side (before the spread: the flag is lost and the CSP-nonce e2e lane
    reddens; after it: `useCache` is lost and `"use cache"` stops caching).
  - **`react-docgen-typescript@2.4.0` uses the classic Compiler API** (`lib/parser.js`) that TS 7
    no longer exposes; its peer `>= 4.3.x` is *satisfied* by TS 7, so `pnpm install` neither fails
    nor warns — it breaks at Storybook build time (the visual lane, not `next build`). Escape
    hatch: `typescript: { reactDocgen: "react-docgen" | false }` — costs autodocs prop tables,
    **no visual baselines** (`visual.spec.ts` screenshots `type: "story"` entries only).
  - **Cutover mechanics when the day comes:** `useTypeScriptCli` is opt-in, not auto-detected
    (TS 7 without it makes `next build` exit with instructions); the bump is **10** specifiers
    (`packages/calendar` included; `manypkg` catches a 9-of-10); **pin exactly** — the age gate
    binds what a range resolves to and the TS train publishes daily; no `minimumReleaseAgeExclude`
    is needed (7.0.2 and its 20 platform packages are long aged); the checker's scope is unchanged
    (`apps/web` already type-checks its tests and e2e specs) except `.next/types`, which
    `next build` sees and `pnpm type-check` cannot; Next-specific diagnostics degrade. The CLI is
    ~3.6× faster here (20.5 s → 5.7 s), so the win is real.
  *Removal condition:* `typescript@7.1.x` stable **and** it ships a language service (or the
  `next` tsserver plugin has a documented TS 7 story) **and** `react-docgen-typescript` resolves
  against it. Until then **hold Renovate's `typescript` v7 major**. Costs no audit points. The full
  entry as it stood — the 07-13 attempt, the lifted-gate verification, the dependency sweep — is
  preserved verbatim in [archive/WATCH_HISTORY.md#typescript-7-cutover-full-entry-as-of-2026-09-02](archive/WATCH_HISTORY.md#typescript-7-cutover-full-entry-as-of-2026-09-02).
- **Maintenance-only (Tier 3 G) — the standing state; Renovate delivery is the open owner
  decision.** Standing since 2026-07-17 (path-to-100 verified at 100.0). Renovate's scheduled lane
  produced zero `renovate/*` branches from 2026-07-22 until 2026-08-31, when two things happened
  the same day: the Mend App opened the first scheduled PR in the repo's history
  ([#56](https://github.com/jrittelmeyer/next-web-boilerplate/pull/56), `actions/checkout`
  7.0.1, every lane green — Mend *does* deliver the no-lockfile class; the Dependency Dashboard's
  `updatedAt` is still 2026-07-22, so its pnpm run still never finishes), and the self-hosted
  `renovate.yml` fallback's first cron run failed at startup for want of the `RENOVATE_TOKEN`
  secret. Two hosts are configured against one repo and the workflow header's dual-run warning is
  live. **Owner decision, not a build row:** (a) add `RENOVATE_TOKEN` **and** set
  `ENABLE_RENOVATE` (the fork-safe gate shipped 2026-09-02 — see Automation on a fork), then
  uninstall the Mend App; or (b) keep Mend, delete `renovate.yml`, and accept that npm-manager
  PRs may keep dying on Mend's tier. Never both. Either way, merge or close #56 first (touching
  `.github/workflows/*` needs the `workflow` scope). *Removal condition:* a scheduled
  `renovate/*` PR from the *chosen* host merges. The full narrative (the 07-22 widening fix, the
  empty Monday windows, the Mend-side diagnosis) is preserved verbatim in
  [archive/WATCH_HISTORY.md#maintenance-only-tier-3-g-the-renovate-narrative-to-2026-09-02](archive/WATCH_HISTORY.md#maintenance-only-tier-3-g-the-renovate-narrative-to-2026-09-02); the diagnosis itself is
  [archive/renovate-b1-diagnosis-plan.md](archive/renovate-b1-diagnosis-plan.md).
- **Dated dependency takes (manual while Renovate delivery is down)** — the npm
  publish time governs each 7-day age-in; this bullet is the canonical dated set the
  PROJECT_STATUS watch line points at. Open now:
  - ~~**Landed takes, 2026-08-10 → 2026-09-02**~~ — `nanoid` 3.3.17 then 3.3.18 (08-12, 08-14) ·
    `next` 16.3.0 superseded, 16.3.1 taken-and-reverted (08-22, the standalone boot crash that
    became Dependency-policy rule 6), 16.3.3 taken (08-26) with its Docker standalone check
    closed 08-30 · the 16.3.3 age-exclude deleted on schedule (09-02) · `better-auth` 1.6.26
    (08-14) and 1.6.30 (08-26). Every take is in [CHANGELOG](../CHANGELOG.md); the verbatim
    dated entries are in [archive/WATCH_HISTORY.md#dated-dependency-takes-landed-2026-08-10-to-2026-09-02](archive/WATCH_HISTORY.md#dated-dependency-takes-landed-2026-08-10-to-2026-09-02) and
    [archive/WATCH_HISTORY.md#better-auth-1626-and-1630-takes-2026-08-14-2026-08-26](archive/WATCH_HISTORY.md#better-auth-1626-and-1630-takes-2026-08-14-2026-08-26).
  - **NEW 2026-09-02 — Renovate liveness, 14 days after `RENOVATE_TOKEN` is set.**
    Enabling the self-hosted workflow now takes **two** owner actions (the secret *and*
    `gh variable set ENABLE_RENOVATE --body true`), because the fork-safe gate that
    stops generated projects inheriting a weekly red also means a forgotten variable
    leaves the lane skipping *silently*. That is the same observable that hid the Mend
    failure for six weeks — zero `renovate/*` branches, no error anywhere. **So: within
    14 days of adding the secret, confirm either a `renovate/*` branch or a Dependency
    Dashboard `updatedAt` newer than 2026-07-22.** Neither ⇒ check
    `gh variable list` first, before re-diagnosing anything upstream.
  - **2026-09-07 ~20:00 UTC — `next` 16.3.4** ages in (published 2026-08-31T20:00:51Z,
    registry-checked the same day; no advisory known). **Pre-triaged 2026-09-01
    (Dependency-policy rule 6, seventeenth audit):** the release *re-enables AVIF Image
    Optimization* (vercel/next.js#97949 — the other half of the 16.3.3 mitigation, i.e.
    exactly the subsystem the security take moved) and raises
    `optionalDependencies.sharp` `^0.35.3` → **`^0.35.4`** (`sharp` 0.35.4 published
    2026-08-26T09:42Z, ages in 09-02 — clear by the take; the lockfile moves `sharp`
    too); three backports (testmode passthrough recursion #97691, a TS-alias build error
    #97997, Turbopack `crossOrigin` #97930); nothing touches `output: 'standalone'`.
    Take-plan riders: (a) rule 6's Docker build + boot + `/api/health` for **both**
    images; (b) drive `/_next/image` with an **AVIF** source first, *then* the OG/icon
    routes (order-dependent, per the 16.3.0 lesson); (c) confirm the libheif floor in
    `sharp` 0.35.4's vendored libvips; (d) bump `@next/eslint-plugin-next` in lockstep
    (`tooling/eslint`, its own `pnpm add` — it has resolved 16.2.12 since the 16.3.3
    take left it outside the exclude). Plan → sign-off.
  - ⚠️ **`better-auth` 1.7.x (`latest` since 2026-08-18, 1.7.2 now) is NOT a routine take** — a
    breaking minor: 15 breaking changes incl. account identity scoped by issuer (requires a
    migration), captcha paths needing explicit wildcards (this repo wires CAPTCHA), SCIM/MCP
    extractions. Plan → sign-off when there is a reason to move; no advisory forces it.
    `@better-auth/passkey` 1.7.x exists for lockstep. **Exact-pinning is the standing rule for
    this dependency** — a caret let `^1.6.30` silently resolve to 1.7.1 ([STACK.md](context/STACK.md)).
- **posthog-js rebuild bump — the real GHSA-55q2-fjhq-7xh7 fix channel** — the
  dompurify override is **audit-edge only**: the vulnerable `IN_PLACE` caller is
  posthog-js's remotely-loaded product-tours chunk, which vendors its own dompurify
  (3.3.2 in the npm-shipped copy of the installed 1.391.2). PostHog's CDN redeploy
  fixes hosted loads on their side automatically; the npm artifact is fixed only by a
  posthog-js release whose chunks vendor >=3.4.13. *Removal condition:* on the next
  posthog-js take, verify the vendored copy — grep the installed
  `dist/product-tours*.js` for `version="3\.` expecting >=3.4.13 — then drop this
  line (and the dompurify override once the tree resolves past its range).

- **Temporary security overrides** (added 2026-07-15) — three pnpm `overrides:` in
  `pnpm-workspace.yaml` remediate transitive-only Dependabot alerts (#1–#3) that have
  **no upstream fix**. Remove each when its upstream moves, then `pnpm install` + the full
  gate:
  - `effect: 3.21.4` → remove when **uploadthing** ships on effect >=3.20 (7.7.4
    exact-pins 3.17.7).
  - `"postcss@<=8.5.22": 8.5.23` → **retargeted 2026-07-27, and again 2026-08-04
    (batch #5) — both times because the pinned value itself went vulnerable.** The
    original `"postcss@<8.5.10": 8.5.15` only rewrote consumers declaring `<8.5.10`
    (next's exact 8.4.31 pin); the tailwind/vite chains resolved a plain
    `postcss@8.5.15` the key never touched — and 8.5.15 fell to GHSA-r28c-9q8g-f849
    (`<=8.5.17`, path traversal via the `prev` source-map annotation), so **the key
    floor had to move, not just the value** (→ `<8.5.18`: 8.5.20). Then
    GHSA-fxqj-rqcc-2cmp (`<=8.5.22`, moderate — an incomplete-fix follow-up:
    attacker-controlled `sourceMappingURL` reads arbitrary `.map` files when `from`
    is unset) swallowed 8.5.20 too → `<=8.5.22`: 8.5.23 (the advisory floor, aged in
    07-31; 8.5.24/8.5.25 existed but were boundary-fresh with no advisory delta).
    Remove when next's own pin **and** the natural tree resolution both reach
    >=8.5.23.
  - `"@esbuild-kit/core-utils>esbuild": 0.25.12` → remove when **drizzle-kit** drops
    the deprecated `@esbuild-kit` loader.

  The `auditConfig.ignoreGhsas` allowlist emptied the same day — `pnpm audit` now
  guards these overrides live (red if one ever regresses).
- **More security overrides** (added 2026-07-22) — three transitive-only advisories,
  newly disclosed the same week (`pnpm audit` queries live advisory data — nothing in
  the lockfile changed to surface these; the prior day's CI was fully green). **Only
  `brace-expansion` was a Dependabot alert**; `sharp`, `dompurify`, and `fast-uri`
  were caught by the CI `pnpm audit` lane and never appeared in Dependabot — so
  **`pnpm audit` is the authoritative gate here and Dependabot the supplementary
  signal** (checking Dependabot alone would have missed a HIGH on `sharp`, which sits
  in Next's image-optimization path). Remove each when its upstream moves, then
  `pnpm install` + the full gate:
  - `"brace-expansion@<5.0.9": 5.0.9` (ranged since 2026-08-14) → the 5.0.8 raise of 2026-07-30 (which also dropped the
    `GHSA-mh99-v99m-4gvg` ignore; allowlist empty again) was **superseded 2026-08-03**:
    GHSA-rgw5-rvv9-x895 showed nested arrays bypass the mitigation 5.0.8 was taken
    for, so 5.0.9 was taken 4 days old under a dated, version-scoped
    `minimumReleaseAgeExclude` (owner-approved — the first age-gate bypass rather than
    a park; **deleted on schedule 2026-08-06** once 5.0.9 aged in; the full story: the
    CHANGELOG Security entry and the three-route rule in `pnpm-workspace.yaml`).
    ⚠️ The removal condition previously stated here — "remove once a routine bump
    naturally carries the lockfile past 5.0.9" — is **unsatisfiable while the key
    is bare** (a bare key pins every future resolution to its own value; the
    identical defect the 2026-08-12 exit PR diagnosed and fixed for fast-uri and
    dompurify, missed on this third key — fifteenth audit, F5). **Converted** to the
    ranged `"brace-expansion@<5.0.9": 5.0.9` on 2026-08-14 (riding the nanoid take),
    so the condition is now real: the key goes inert once the tree resolves past
    5.0.9.
  - `"dompurify@<3.4.13": 3.4.13` (ranged since the 2026-08-12 park exit) → 3.4.12
    **fell vulnerable in turn 2026-08-07** (GHSA-55q2-fjhq-7xh7, moderate — parked
    route (1), owner-signed; **exited 2026-08-12**, due 08-10 ~14:16 UTC). ⚠️ The
    removal condition previously stated here — "remove once a routine bump naturally
    carries the lockfile past 3.4.12" — was unsatisfiable as written: a **bare** key
    pins every future resolution to its own value, so no routine bump can ever carry
    the lockfile past it. The ranged key is what makes the condition real: it goes
    inert once posthog-js resolves >=3.4.13 — which is also the moment the real fix
    lands, this edge being audit-only (see the posthog-js Watch line above).
  - ~~`sharp: 0.35.3`~~ → **REMOVED 2026-08-26** with the `next` 16.3.3 take: its condition
    (next's own sharp pin ≥0.35.0) is met by 16.3.3's `^0.35.3`, and a no-op reinstall confirmed
    the lockfile resolves `sharp@0.35.3` unaided. Record → [archive/WATCH_HISTORY.md#sharp-override-removed-2026-08-26](archive/WATCH_HISTORY.md#sharp-override-removed-2026-08-26).
  - `"fast-uri@<3.1.5": 3.1.5` (ranged since 2026-08-12) → **CLOSED 2026-07-27**: 3.1.4 cleared the gate 2026-07-26, so
    the deferral became a real override and both GHSAs (`GHSA-v2hh-gcrm-f6hx`,
    `GHSA-4c8g-83qw-93j6`) left `ignoreGhsas`. **Reopened 2026-08-04 (batch #5):
    3.1.4 was itself vulnerable to GHSA-7p8r-x3mc-p8w7** (`<3.1.5`, high — the third
    host-confusion advisory of the family, via a backslash authority introducer);
    the only fix, 3.1.5 (published 2026-07-31T09:16:56Z), sat inside the 7-day gate,
    so the advisory was **parked** in `auditConfig.ignoreGhsas` — route (1), the
    steady-state deferral, not a second gate exception. **Closed again on schedule
    2026-08-07**: 3.1.5 aged in at 09:16:56 UTC, the override moved 3.1.4 → 3.1.5 and
    the park was deleted in one change (allowlist empty — zero ignored). **Converted
    to the ranged `"fast-uri@<3.1.5": 3.1.5` on 2026-08-12** (signed rider on the
    dompurify/nanoid park exit — the bare key shared their unsatisfiable-removal
    defect; the conversion itself moved nothing). Remove the
    override once a routine bump naturally carries the lockfile past 3.1.5.
  - `"nanoid@<3.3.18": 3.3.18` → GHSA-2v37-7h3g-55p8 (HIGH; audit-edge only — postcss
    calls plain `nanoid(6)`, the vulnerable custom-generator functions are never
    invoked here). Added 2026-08-12 as `<3.3.17`, promoted to `<3.3.18` on 2026-08-14
    when the advisory widened; the park/exit story is in the dated-take entries above
    (this one-liner added 2026-09-01 so every live override key has a bullet here).
    Remove once a routine bump naturally carries the lockfile past 3.3.18 (ranged key
    — inert from that moment).
- ~~**Advisory batch 2026-07-27**~~ — closed ([#10](https://github.com/jrittelmeyer/next-web-boilerplate/issues/10)):
  `better-auth` 1.6.20 → 1.6.23 (GHSA-qq9h-g4jm-xgf3, live-exposed on the default config) →
  1.6.25 on 07-30 with no migration; the postcss + brace-expansion retargets (their live keys are
  above); and both audit lanes made to fail **closed** after the 2026-07-26 false green (the
  advisory endpoint returned invalid JSON and `--ignore-registry-errors` turned that into exit 0).
  Record → [archive/WATCH_HISTORY.md#advisory-batch-2026-07-27](archive/WATCH_HISTORY.md#advisory-batch-2026-07-27).
- **Batch #5 overrides (added 2026-08-04)** — both RANGED deliberately (a bare key pins every
  future resolution so its own removal condition can never fire, and would force a future
  undici@8 copy cross-major *down*; a ranged key self-neutralizes and leaves new copies
  for `pnpm audit` to judge loudly):
  - `"undici@<7.29.0": 7.29.0` → five advisories at once (GHSA-4cwx-7wf7-3272, high,
    plus four moderates), reached only via vitest→jsdom (test tooling). In-range for
    jsdom's own `^7.25.0`. Remove when the lockfile's undici entry moves past 7.29.0
    (the key is inert from that moment).
  - `"socket.io-parser@<4.2.7": 4.2.7` → GHSA-2m8v-j782-fhvr (high, zero-attachment
    memory exhaustion), via react-email's dev preview server. In-range for socket.io's
    own `~4.2.4` — the lockfile's 4.2.6 simply predated the fix. Remove when the
    react-email chain re-resolves >=4.2.7.
- ~~**Advisory batch 2026-08-04 (#5)**~~ — closed ([#41](https://github.com/jrittelmeyer/next-web-boilerplate/issues/41)):
  nine advisories (4 high), every path build/dev/test tooling; two were against our own previous
  remediation pins (an override is a standing liability — `pnpm audit` re-judging pinned values
  live is how both surfaced). Its two new keys (undici, socket.io-parser) are the live bullet
  above. Record → [archive/WATCH_HISTORY.md#advisory-batch-2026-08-04-5](archive/WATCH_HISTORY.md#advisory-batch-2026-08-04-5).
- **`contrarian` subagent — evaluated 2026-07-28; both open items now closed.**
  - **The acceptance test RAN and passed its pre-committed bar.** It produced findings
    absent from both the plan and the PR body, each citing a file:line it read itself —
    including two that were *correct and material*: `.claude/agents/contrarian.md`
    granted `Bash` while `CHANGELOG.md` called the agent "read-only", and the
    `docs:sanity` wiring assertion failed **open** on a missing `settings.json`. A second
    run against this remediation plan then caught that its own verification step could
    not fail. That is the apparatus working, not a ritual.
  - **The "reload fixes it" claim was false and is deleted.** Registration is
    **surface-dependent**, not session-snapshot-dependent: the agent resolves in the
    `claude` CLI and under `claude --agent <slug>`, and not at all on some hosted
    surfaces — a session started days after the agent merged still could not dispatch it.
    Full table + fallback recipe: [CONVENTIONS.md → Agent
    tooling](context/CONVENTIONS.md#agent-tooling-claude). **Registration itself is not
    CI-verifiable** (it requires running the CLI); `docs:sanity` guards existence only,
    deliberately.
  - **Kill criterion (committed 2026-07-28, replacing the quality-based draft):** *if
    **three consecutive** merged PRs touching a path in CLAUDE.md's ALWAYS set carry no
    `## Contrarian disposition` heading in the PR body, the policy is dead — delete it or
    make the gate blocking.* Anchored to PR bodies because they are durable and greppable
    (`gh pr list --search … --json body`); the first draft anchored to *plan files*, which
    `git ls-files` shows are never committed. Chosen over a quality test because the
    likelier failure is **non-invocation**, not weak findings — the acceptance test itself
    went unrun for a day because the assumed invocation path did not exist.
- **`main` has no branch protection** (noted 2026-07-27) —
  `gh api repos/…/branches/main/protection` returns 404, so *no* status check is required
  and a red PR is one click from merging. Every "this blocks merge" convention in this repo
  — including the advisory-PR-before-feature-PR ordering used on 2026-07-27 — is
  self-imposed discipline with no machine backstop. Owner decision whether to add it; not a
  build row, and CI changes can't substitute (they turn a lane red, they can't stop a merge).
- ~~**`minimumReleaseAgeExclude` for `next` + `@next/*`**~~ — **CLOSED 2026-07-28, on
  schedule** (16.2.11 aged in; proven falsifiably — the exclude removed is refused on age grounds,
  restored it succeeds). Record → [archive/WATCH_HISTORY.md#age-exclude-for-next-16211-closed-2026-07-28](archive/WATCH_HISTORY.md#age-exclude-for-next-16211-closed-2026-07-28).
- ~~**`next` 16.2.12**~~ — **TAKEN 2026-08-02** with `@next/eslint-plugin-next` in lockstep
  (it lives in `tooling/eslint` and needs its own `pnpm add`); neither override retired; the
  `paths`-without-`baseUrl` alias path proven in both `next build` and `next dev`; this is the
  bump that lifted the TS7 Next-side gate. Record → [archive/WATCH_HISTORY.md#next-16212-taken-2026-08-02](archive/WATCH_HISTORY.md#next-16212-taken-2026-08-02).
- **Ship a real derived product end-to-end** (intent-level driver, owner-driven) — a
  real app built to completion on the template is the strongest validation of the
  "verified end-to-end" claim, **unlocks the gated B1 intake-drop row** (BACKLOG →
  Open rows), and supplies the proof the positioning reframe needs — consumption
  finds what audits can't (both inception trials did). Already tracked in memory
  `derived-project-intake-trial`; starts via `/project-init`. No template action
  until it begins; it then feeds the on-ramp rows with real lessons.

## Security response runbook

Advisories publish against the *world*, not against this repo's commits — a fully
green tree can wake up red (the 2026-07-22 Next.js batch dropped 9 GHSAs on a tree
whose CI had passed hours earlier). The pipeline guarantees detection **and** a
backlog entry; this runbook is the human half.

**Signals, ranked.** `pnpm audit` is the authoritative gate (it queries live
advisory data per run; of the four packages remediated 2026-07-22, Dependabot
alerted on **one**). Dependabot alerts and their emails are the supplementary
signal — cross-check both, trust `pnpm audit`.

**Automated cadence.** Three lanes watch for advisories; the first two run
`pnpm audit` and sync one rolling **`security-triage` issue** (created red,
appended while red, auto-closed by the next green run that provably audited —
`.github/scripts/security-triage-issue.sh`):

- **`security-audit.yml`** — daily 05:00 UTC watch lane; red at **moderate+**.
- **ci.yml → Audit (supply chain)** — every PR/push + the Thursday heartbeat;
  *merge gate* at high/critical, but its triage-sync step files/closes the issue
  at the same moderate+ watch threshold (non-PR runs on `main` only — push,
  heartbeat, manual dispatch).
- **Dependabot** — GitHub-side rescans with their own alerts/emails (also what
  auto-closes its alerts after a fix lands; observed latency ~90 min).

**Triage, when the issue fires** (or on any maintenance resume — check the open
issue list, the latest scheduled-run conclusions, and run `pnpm audit` before
declaring the ledger clear):

1. **Direct dependency with a fixed version** → bump it (registry-verified). A fix
   younger than the 7-day age gate takes the three-route rule stated at
   `minimumReleaseAge` in `pnpm-workspace.yaml` — default route (1): park the GHSA
   in `auditConfig.ignoreGhsas` and promote it to a real override when the fix ages
   in; a dated `minimumReleaseAgeExclude` is route (2), a bounded exception (HIGH+
   or reachable by untrusted input in a configured deploy), removed once the
   version ages out.
2. **Transitive with a compatible fixed version** → scoped override in
   `pnpm-workspace.yaml` + plain `pnpm install` (never `pnpm update --recursive` —
   it re-resolves the whole lockfile).
3. **No fixed version anywhere** → dated `auditConfig.ignoreGhsas` entry with its
   reason and expected exit condition.
4. **Record it in the same commit**: CHANGELOG **Security** entry + a Watch item
   above (with its removal condition), then the full gate and a CI watch. The
   green push closes the triage issue; confirm the Dependabot alerts auto-close.

## Periodic audit cadence

Three review passes keep docs and code from drifting — run them on real need (a
big upgrade, a batch of merged Renovate PRs) rather than on a calendar:

- **Doc audit** — sweep for code↔doc drift: claims in `docs/` that no longer match
  the code, duplication on the hot path, stale detail to archive — plus **currency
  drift** (claims the ecosystem moved out from under: upstream gates,
  "current/latest" statements) and the **outward-facing consumer claims** (README
  quickstart commands, badges, links).
- **Project audit** — score the repo against a best-available bar and emit a
  prioritized backlog of gaps — including, post-launch, the **public-template
  surface** (on-ramp truth, community files, automation actually alive) and a
  re-check of externally-gated watch rows.
- **Harness audit** — re-run when the installed `ai-dev-kit` version bumps
  (`.claude/ai-dev-kit.installed.json`), not on a calendar cadence: a quarterly
  nudge fires against unchanged state, while a kit release is what actually
  stales the harness inventory (skills, hooks, `CONVENTIONS.md` → Agent tooling).
  Needs network access to check upstream; stamps PARTIAL without it.

All three ship as committed agent skills (`.claude/skills/project-audit/`,
`.claude/skills/doc-audit/`, and `.claude/skills/harness-audit/`, alongside the
checkpoint/tidy helpers — all installed from the
[ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) skill library); each
SKILL.md is a plain-markdown procedure a human — or any agent tooling — can
follow directly. ⚠️ Since kit 0.23.13, `project-audit`, `harness-audit` and `tidy`
(with `checkpoint`, `project-init`, `project-adopt`, `retro`) carry
`disable-model-invocation`, so an agent runs one by **reading its SKILL.md** rather
than through the Skill tool; `/name` is still the user form, and `doc-audit` is
unflagged. That is why "plain-markdown procedure" is load-bearing rather than
decorative — see [`context/CONVENTIONS.md` → Agent tooling](context/CONVENTIONS.md#agent-tooling-claude). Past audit reports live in [`archive/`](archive/) as worked
examples.

## Local disk hygiene

The Turbo cache (`.turbo/cache`) has no native size cap and grows by ~3.5 GB per
clean build; `pnpm clean` does **not** touch it.

```bash
pnpm cache:size    # report current cache size
pnpm cache:prune   # evict oldest entries down to the cap (default 20 GB)
```

`cache:prune` also runs automatically on `pre-push`.
→ [`context/DEPLOYMENT.md → Local disk hygiene`](context/DEPLOYMENT.md#local-disk-hygiene-turbo-cache)

## Major-upgrade runbook

For a framework-level bump (Next major, React major, Tailwind major, Better Auth
major — anything with a migration guide):

1. **Branch**, and read the upstream migration guide + [`context/STACK.md`](context/STACK.md)
   notes for the packages involved (several pins have "bump when X" conditions
   recorded inline).
2. **Bump** the dependency (registry-verified, age-gate-cleared), plus any lockstep
   partners (manypkg will tell you).
3. **Full gate**: `pnpm lint && pnpm type-check && pnpm build`, then `pnpm test` and
   `pnpm test:e2e`.
4. **Live-verify the affected surface** against a fresh production build (build, then
   `PORT=3100 pnpm --filter web start` so a standing dev server isn't disturbed) —
   walk the relevant [`VERIFICATION.md`](VERIFICATION.md) phase, not just the tests.
5. **Update the docs in the same change**: the [`context/STACK.md`](context/STACK.md)
   version table, the affected `docs/context/*` doc, and
   [`PROJECT_STATUS.md`](PROJECT_STATUS.md). If the upgrade changed a *decision*
   (not just a version), record it in [`context/DECISIONS.md`](context/DECISIONS.md).
6. Merge only on a green CI run.

## When best practices move

This boilerplate encodes 2026 defaults, and says *why* each was chosen
([`FEATURES.md`](FEATURES.md) for the summary, [`context/DECISIONS.md`](context/DECISIONS.md)
for the full record). When the ecosystem shifts, re-argue against the recorded
rationale rather than the code: if the "why" no longer holds (a library died, a
platform feature landed, a rejected option matured), that's the signal to revisit —
and the decision log is where the reversal gets recorded, so the next reader inherits
the reasoning, not just the diff.
