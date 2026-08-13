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
     (HIGH+ or reachable by untrusted input in a configured deploy).
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

## Automation on a fork / new repo

GitHub repo settings don't travel with a template copy. On your own repo:

- **Install the Renovate (Mend) GitHub App** — without it, no update PRs ever arrive.
  Because `.github/renovate.json` is already committed, there's no onboarding PR —
  Renovate goes straight to the Dependency Dashboard issue and scheduled update PRs.
  Choose **"Only selected repositories"** when installing: an "All repositories"
  install defaults the Mend org to **Silent** mode (it scans but never creates
  issues or PRs), and changing the GitHub-side repository access afterward does
  *not* clear it — flip the mode to Interactive at
  [developer.mend.io](https://developer.mend.io) if the dashboard issue never
  appears. Validate config edits with
  `pnpm dlx --package renovate renovate-config-validator .github/renovate.json`.
- **Re-create the CI gate variables** (they're repo variables, not workflow content):
  `ENABLE_CODEQL` (needs a public repo or GHAS), `ENABLE_VISUAL`, and optionally
  `ENABLE_PERF` / `ENABLE_GHCR_PUBLISH`. Unset, those lanes *skip silently* — they
  don't fail. → [`context/DEPLOYMENT.md → CI/CD`](context/DEPLOYMENT.md#cicd-github-actions)
- Optional: a `CODECOV_TOKEN` secret (coverage upload is skipped cleanly when unset).

## Watch items (known, tracked, deliberately not done)

**This section is the canonical live Watch list** — full per-item detail and removal
conditions live here; [`BACKLOG.md`](BACKLOG.md) carries one-line pointers. Currently:

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

- **Two distinct e2e flakes — and the lane went red once, 2026-08-03.** PR #34 attempt 1:
  **1 failed · 9 flaky · 56 passed**. The single "e2e signup flake" row this replaces
  conflated two unrelated defects, and the red was *not* the one it named — read the run
  log, not the label, before acting on either.
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

- **TypeScript 7 cutover** — **GA'd as `typescript@7.0.2` (2026-07-08)** but not yet
  adoptable here (proven by a 2026-07-13 cutover attempt — owner-approved age-gate
  override; repo undeployed → no prod risk): TS 7's package IS the native **Go**
  compiler and **ships no JS Compiler API** — its `typescript` module exposes only
  `version` (`createProgram`/`readConfigFile`/`sys`/`transpileModule` gone, no
  `lib/typescript.js`; the programmatic API moved to `./unstable/*`), so `next build`
  fails at its TS-detection step (Next 16 stable embeds the classic API). Every
  library-API consumer (Next, webpack loaders, Vue/Svelte/Astro/MDX/Angular) stays on
  TS 6 until the stable programmatic API returns in **TS 7.1 (~Q4 2026)**. Upstream
  moved 2026-07-10: Next merged **experimental TS7 support into canary**
  ([#95639](https://github.com/vercel/next.js/pull/95639) — offers
  `experimental.useTypeScriptCli`, shelling out to the CLI instead of the JS API),
  closing tracking issue
  [#95490](https://github.com/vercel/next.js/issues/95490)
  ([#95633](https://github.com/vercel/next.js/discussions/95633) remains the
  discussion). The `tsc` CLI itself is clean and **~3.6× faster** (monorepo
  type-check 20.5s → 5.7s, cache-bypassed), so the win is real. Mechanics learned:
  pnpm's age gate re-validates the whole lockfile on every `pnpm run`/frozen
  install, not just `pnpm install`. That cost a `minimumReleaseAgeExclude` in July;
  **it no longer would** — `7.0.2` and all **20** `@typescript/typescript-<os>-<arch>`
  platform optional deps published 2026-07-08, ~25 days clear of the 7-day gate as of
  2026-08-02. ⚠️ But the gate binds what a range **resolves to**, not the version you
  had in mind, and the TS train publishes daily (`dist-tags.next` was
  `7.1.0-dev.20260802.1`), so a cutover should pin **exactly**, not `^7.x`.

  **⇒ THE NEXT-SIDE RE-GATE LIFTED 2026-08-02 — met by its literal terms, at three
  named costs.** The condition as written was *"TS7 support reaching a stable Next
  release (`useTypeScriptCli` or its auto-detect successor)"*. Verified **in the
  installed artifact**, not from a changelog: `apps/web` resolves `next@16.2.12`
  (`dist-tags.latest`), which carries `useTypeScriptCli` across 40 files including
  `dist/build/type-check.js`, `dist/build/load-jsconfig.js` and its own shipped docs
  page. Read that page (`dist/docs/…/useTypeScriptCli.md`) before planning a cutover —
  it is the primary source and it names what the flag costs:
  - **It is opt-in, not auto-detected.** *"Next.js does not select the CLI checker
    automatically"* — TS7 installed without the flag makes `next build` exit with
    instructions. The gate's disjunction is satisfied by `useTypeScriptCli`; the
    auto-detect successor this file expected before stable **did not** arrive.
  - **It widens what gets type-checked** — *"The complete project selected by the
    configured `tsconfig` is checked, including test files"*, and
    `--debug-build-paths` **cannot** narrow it. ⚠️ **This was overstated here until
    2026-08-02:** it is not new exposure for *this* repo. `apps/web` already runs
    `tsc --noEmit` over a tsconfig that includes `**/*.ts(x)`, so the 47 co-located
    tests and 29 `e2e/*.spec.ts` are checked **today**. The scope is unchanged; only
    the checker would be. The one genuinely-new surface is `.next/types/**/*.ts`,
    which `pnpm type-check` cannot see (turbo scopes it to `dependsOn: ["^build"]`,
    upstream builds only) — so `next build`, not `type-check`, is what would test it.
  - **Diagnostics degrade.** Next-specific code frames and error rewriting are not
    applied; `typescript.ignoreBuildErrors` skips the CLI checker too.

  **⇒ BUT THE BINDING CONSTRAINT IS NOT THE ONE THIS ENTRY TRACKED. Re-gated
  2026-08-02 on a fact no cutover trial could have surfaced:** ⚠️ **TS 7 ships no
  `tsserver`.** Verified at the registry — `typescript@6.0.3` declares
  `bin: { tsc, tsserver }`; `typescript@7.0.2` declares `bin: { tsc }`. The 20
  platform packages are compiler binaries. So bumping the workspace `typescript`
  leaves the editor's "Use Workspace Version" with no server, and the **`next`
  tsserver plugin** (`tooling/typescript/nextjs.json` → `plugins: [{ name: "next" }]`,
  the one `knip.jsonc` carries a dedicated ignore for) with no host. Either the editor
  falls back to its own bundled TypeScript — **a different checker from the build**,
  the classic green-in-editor / red-in-CI split, on the daily loop — or `"use client"`
  boundary violations and invalid metadata exports stop surfacing while typing.
  **No lane in `ci.yml` runs an editor**, which is exactly why the previous "run a
  trial" re-gate was the wrong instrument: a fully green trial would not have licensed
  the cutover.

  **Two further costs, both landing on the template surface** (`scripts/init-app.mjs`
  ships this tree verbatim into every generated project): TS 7 is a native Go binary
  published for **20 platform tuples with no musl variant**, while the repo's own
  builder is `node:24-alpine` (`docker/Dockerfile`) — TS 6 is pure JS and runs
  anywhere Node does, so a cutover trades away a portability guarantee an adopter
  currently has. And `next.config.ts` would need care: `experimental` exists **only**
  in nonce mode there (`...(cspMode === "nonce" ? { experimental: { useCache: true } }
  : {})`), so adding `useTypeScriptCli` as a *sibling* key silently drops one side —
  before the spread the flag is lost (TS7 without it makes `next build` exit ⇒ the
  CSP-nonce e2e lane goes red), after it `useCache` is lost (`"use cache"` stops
  caching). It must be **merged into one object**, not stacked.

  **The dependency blocker, restated from inspection rather than enumeration:**
  `react-docgen-typescript@2.4.0` is real — `lib/parser.js:22` does
  `require("typescript")` and then uses `ts.SyntaxKind` (16×), `ts.displayPartsToString`
  (6×), `ts.SymbolFlags` (6×), `ts.TypeFlags`, `ts.isIdentifier` … i.e. deep classic
  Compiler API, while TS 7's module exposes only `version`. Reached via
  `@storybook/react-vite` from `packages/ui/.storybook/main.ts`; **it gates the
  visual-regression lane, not `next build`.** ⚠️ Its peer is `>= 4.3.x`, which TS 7
  *satisfies* — so `pnpm install` would neither fail nor warn; the break is at
  Storybook build time. Escape hatch if ever needed: `typescript: { reactDocgen:
  "react-docgen" }` (AST-based, no Compiler API) or `false`. That costs autodocs
  prop-table fidelity but **no visual baselines** — `packages/ui/tests/visual.spec.ts`
  filters `entry.type === "story"` and autodocs pages index as `type: "docs"`, so none
  is screenshotted.
  The enumeration that found it (packages declaring `typescript` as a dependency or
  required peer) still cannot see a bare `require("typescript")` under an *optional* or
  undeclared peer — treat it as the floor. **A worked example of that blind spot, and
  of its inverse:** `next-intl@4.13.1` also resolves against `(typescript@6.0.3)` in
  the lockfile and looks like a second blocker. It is not — `typescript` is an
  **optional peer with no version range** there (only `next`/`react` are in
  `peerDependencies`) and `next-intl/dist` imports `typescript` nowhere. Cleared by the
  same sweep: knip (oxc), drizzle-kit/vitest (esbuild), biome (Rust), zero
  `typescript-eslint` anywhere; `@trpc/*`'s `typescript >=5.7.2` peer is types-only
  inference, not an API consumer.

  ***Removal condition (replaces "run a cutover trial"):*** `typescript@7.1.x` stable
  **and** it ships a language service (or the `next` tsserver plugin has a documented
  TS 7 story) **and** `react-docgen-typescript` resolves against it. Each is checkable
  without building anything. Until then **hold Renovate's `typescript` v7 major** — now
  for a recorded reason rather than a pending experiment. Costs no audit points.
- **Maintenance-only (Tier 3 G) — the standing state** — the honest "we're done"
  option: let Renovate drive deps, keep docs current, add steps as real needs surface.
  Standing 2026-07-12 → 2026-07-15; superseded 2026-07-15 by the path-to-100 program
  (owner decision; [archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md));
  **RESUMED 2026-07-17** — the program shipped all 11 rows and the eighth scoring pass
  verified it at **100.0/100**
  ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md)). The
  scheduled Renovate batch had **not opened as of 2026-07-22**, and the 2026-07-22
  audit found it **blocked, not waiting** — the scheduled lane has never produced a PR
  (0 `renovate/*` branches ever; all 7 merged PRs came from manual dashboard-approval
  clicks). The widening fix **SHIPPED 2026-07-22** — and **the proof FAILED anyway: the
  2026-07-27 Monday window passed with still zero `renovate/*` branches ever
  opened** (`git ls-remote --heads origin 'refs/heads/renovate/*'` → empty; all 7
  merged Renovate PRs came from manual dashboard clicks). **This is now a
  diagnosis job, not a wait** — next stop is the Mend app side (run logs / mode /
  cadence at developer.mend.io); owner's call on when to run it. Fallback if the
  app side won't cooperate: self-hosted Renovate via `renovatebot/github-action`
  on a cron, reusing the committed config — tracked as a B1 row in
  [`BACKLOG.md`](BACKLOG.md). The 7 approved majors merged 2026-07-18;
  typescript-v7 stays held per the TS7 gate above; `actions/setup-node v7` is a new
  pending-approval major, and `@testing-library/jest-dom v7` sits age-gated in the
  dashboard's Pending Status Checks (surfaces for approval once aged; 22B). The
  same-day 22B re-check confirmed the picture unchanged: still 0 `renovate/*`
  branches, 37 Awaiting Schedule.
- **Dated dependency takes (manual while Renovate delivery is down)** — the npm
  publish time governs each 7-day age-in; this bullet is the canonical dated set the
  PROJECT_STATUS watch line points at. Open now:
  - ~~**2026-08-10 — the `nanoid` 3.3.17 + `dompurify` 3.4.13 park exits**~~ —
    **EXITED 2026-08-12, two days late** (each was due when its fix aged in on
    08-10: nanoid ~10:39 UTC, dompurify ~14:16 UTC; the gap carried no exposure —
    both edges are audit-only and the daily security lane ran green 08-10/11/12).
    One PR per the 2026-08-07 signed spec: registry re-verified at take time
    (3.4.13 = `latest`, no newer release; **3.3.17 taken over 3.3.18** — npm's
    `legacy` tag, an unrelated React-Native fix with no advisory delta, so the
    aged advisory floor won per the postcss 8.5.23 precedent), the bare
    `dompurify:` key promoted to the ranged `"dompurify@<3.4.13": 3.4.13`,
    `"nanoid@<3.3.17": 3.3.17` added (in-range for postcss's `^3.3.16` —
    fix-forward), and the signed rider converted `fast-uri: 3.1.5` to its ranged
    form (same bare-key defect; the conversion moved nothing). Allowlist back to
    `[]` — `pnpm audit` zero vulnerabilities, **zero ignored**; the lockfile moved
    exactly two packages; Dependabot #25 + #26 auto-close. Removal conditions now
    live on the ranged keys in `pnpm-workspace.yaml`. The advisory detail this
    entry used to carry lives on those keys' comments (nanoid: GHSA-2v37-7h3g-55p8,
    HIGH, functions never invoked here; dompurify: GHSA-55q2-fjhq-7xh7, moderate,
    audit-ledger-only edge — the real fix channel is the posthog-js Watch line
    below).
  - **2026-08-14 ~16:41 UTC — `nanoid` 3.3.18** ages in (published 2026-08-07T16:41Z).
    **GHSA-2v37-7h3g-55p8 WIDENED 2026-08-13T15:43Z** — the 3.x vulnerable range is
    now `<3.3.18` (first-patched 3.3.18), so the 08-12 exit's 3.3.17 is inside it
    again and the tree re-flags HIGH. The exit was right when taken (3.3.18 read as
    the `legacy`-tag React-Native fix with no advisory delta — true *until* the
    advisory moved); the exposure analysis is unchanged (postcss calls plain
    `nanoid(6)`; the vulnerable custom-generator functions are never invoked here).
    Two admissible responses: **park GHSA-2v37 (route 1) now** and every lane stays
    green, or **accept one red daily lane** (2026-08-14 05:00 UTC — it will file the
    triage issue) and take the exit directly at age-in. Either way the take is:
    promote the ranged key to `"nanoid@<3.3.18": 3.3.18` (3.3.17 sits outside the
    current `<3.3.17` key, so the key floor must move), registry re-verify at take
    time, delete any park in the same change. ⚠️ The CI audit *merge gate* fails at
    HIGH from 2026-08-13T15:43Z until this lands — any PR opened before then needs
    the park first. Found by the fifteenth audit pass, four hours after the
    advisory moved. **Rider:** convert the bare `brace-expansion: 5.0.9` key to its
    ranged form in the same change (audit F5 — same file, same
    unsatisfiable-removal class the 08-12 PR fixed for fast-uri).
  - **2026-08-10 ~20:34 UTC — `next` 16.3.0** ages in (published 2026-08-03T20:34Z).
    Plan → sign-off (minor-version runbook, `@next/*` lockstep). **Rider, found by the
    2026-08-06 audit:** 16.3.0 pins `sharp ^0.35.3` and `postcss 8.5.23`, so the take
    plan should also **remove the `sharp: 0.35.3` override** (its removal condition —
    next's own pin ≥0.35.0 — is met by this release) and re-check the postcss
    override's second condition (natural tree resolution ≥8.5.23; the key goes inert
    when both hold).
  - **2026-08-11 ~21:20 UTC — `better-auth` 1.6.26** ages in (published
    2026-08-04T21:19Z; routine bug-fix release — no advisory; includes an email-OTP
    enumeration hardening). Normal take: bump both `^1.6.25` specifiers + the
    workspace floor note; full gate + auth e2e. **1.6.27 exists** (published
    2026-08-11T18:02Z → ages in 2026-08-18 ~18:02 UTC; no advisory) — the due take
    today is still 1.6.26; registry re-verify at take time and prefer 1.6.27 only
    once it clears the gate.
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
  - `brace-expansion: 5.0.9` → the 5.0.8 raise of 2026-07-30 (which also dropped the
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
    dompurify, missed on this third key — fifteenth audit, F5). Convert to the
    ranged `"brace-expansion@<5.0.9": 5.0.9` (riding the 2026-08-14 nanoid take),
    after which the condition becomes real: the key goes inert once the tree
    resolves past 5.0.9.
  - `"dompurify@<3.4.13": 3.4.13` (ranged since the 2026-08-12 park exit) → 3.4.12
    **fell vulnerable in turn 2026-08-07** (GHSA-55q2-fjhq-7xh7, moderate — parked
    route (1), owner-signed; **exited 2026-08-12**, due 08-10 ~14:16 UTC). ⚠️ The
    removal condition previously stated here — "remove once a routine bump naturally
    carries the lockfile past 3.4.12" — was unsatisfiable as written: a **bare** key
    pins every future resolution to its own value, so no routine bump can ever carry
    the lockfile past it. The ranged key is what makes the condition real: it goes
    inert once posthog-js resolves >=3.4.13 — which is also the moment the real fix
    lands, this edge being audit-only (see the posthog-js Watch line above).
  - `sharp: 0.35.3` → remove when **next**'s own sharp pin reaches >=0.35.0 (16.2.11
    still pins `^0.34.5`, excluding the libvips CVE fix — re-checked 2026-07-22).
    Its `/_next/image` runtime path is e2e-covered since 2026-07-22
    (`apps/web/e2e/image-optimization.spec.ts`) — a sharp that installs but no
    longer transforms turns the e2e lane red instead of passing silently.
  - `fast-uri: 3.1.5` → **CLOSED 2026-07-27**: 3.1.4 cleared the gate 2026-07-26, so
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
- **Advisory batch 2026-07-27** (closed [#10](https://github.com/jrittelmeyer/next-web-boilerplate/issues/10),
  red since 2026-07-25) — three highs, one of them a **direct** dependency:
  - **`better-auth` 1.6.20 → 1.6.23** (with `@better-auth/passkey` in lockstep).
    GHSA-qq9h-g4jm-xgf3 (CVSS 8.3, account takeover via pre-account) was **live-exposed
    here**, not transitive: its four preconditions — version `<1.6.22`, the magic-link
    or email-OTP plugin, email+password with open registration, and an account
    pre-existing at the address — all hold whenever `isEmailConfigured()` is true, which
    is the intended production path and is inherited by every derived project. 1.6.23 is
    the newest patched release clearing the 7-day gate. **Follow-up CLOSED 2026-07-30 —
    1.6.25 installed** (with `@better-auth/passkey` in lockstep) once it cleared the
    gate at 15:48:12Z. Not advisory-driven and **no migration**: the 1.6.23→1.6.25 model
    definitions were diffed against the installed artifacts and every difference is
    cosmetic. See the CHANGELOG **Security** entry for the 1.6.24 `Origin`-enforcement
    behaviour change on the magic-link / email-OTP send endpoints.
  - postcss + brace-expansion: see the retargeted override bullets above.
  - **The 2026-07-26 daily audit's green was a false green** — the advisory endpoint
    returned invalid JSON and `--ignore-registry-errors` turned that into exit 0, so
    the run never audited and left #10 untouched. **Both** lanes now assert the
    "…vulnerabilities found" trailer a completed report always emits, mirroring the
    guard `security-triage-issue.sh` already applied before closing the issue:
    `ci.yml`'s merge gate (so a PR can't merge on an unaudited tree) and
    `security-audit.yml`'s **Propagate audit status** (which previously gated only on
    a non-zero exit, so an outage skipped it and the run concluded *success*). Issue
    state was never wrong — the script's guard held — but the **run conclusion** was,
    and that is what a human reads in `gh run list`. A genuine npm outage now turns
    both lanes red and needs a re-run; that is the safe direction to fail.
- **Advisory batch 2026-08-04 (#5** — closed
  [#41](https://github.com/jrittelmeyer/next-web-boilerplate/issues/41), red since
  2026-08-03/04**)** — nine advisories (4 high, 5 moderate) across five packages, every
  path build/dev/test tooling; `brace-expansion` 5.0.9 (the ninth) merged separately as
  PR #38. The batch's lesson: **two of the nine were against our own previous
  remediation pins** (fast-uri 3.1.4, postcss 8.5.20) — an override is a standing
  liability, and `pnpm audit` re-judging pinned values live is exactly how both
  surfaced. New overrides, both RANGED deliberately (a bare key pins every future
  resolution so its own removal condition can never fire, and would force a future
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
  - postcss (second retarget) + fast-uri (parked GHSA — **exited on schedule
    2026-08-07**, the override now 3.1.5): see their bullets above.
  Dependabot alerted on **only the undici five**; `pnpm audit` caught all nine — the
  authoritative-gate ranking holds.
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
  schedule.** 16.2.11 (published 2026-07-21T16:00:01Z) cleared the 7-day gate that day;
  every `@next/*` entry in the lockfile is either 16.2.11 (published ~2 minutes *earlier*)
  or `@next/eslint-plugin-next@16.2.9`, so nothing still needed the bypass and a frozen
  install could not break. Proven falsifiably rather than assumed: `pnpm --filter web add
  next@16.2.12 --lockfile-only` is **refused on age grounds with the exclude removed**
  (exit 1, naming `next` and all eight `@next/swc-*` siblings) and **succeeds with it
  restored** (exit 0). Note the removal is a **no-op at install** — `apps/web` declares
  `^16.2.11`, which the lockfile already satisfies, so a lockfile-driven install never
  consults the registry; the gate re-arms at the next *resolution* (Renovate, `pnpm add`).
  16.2.12 becomes admissible 2026-08-01.
- ~~**`next` 16.2.12 admissible but not taken**~~ — **TAKEN 2026-08-02**, with
  `@next/eslint-plugin-next` in lockstep. Registry-verified at the time: `dist-tags.latest`,
  published 2026-07-25T20:45:53Z (8 days, past the 7-day gate), **no 16.2.13**. Contents are a
  docs backport plus the TypeScript-7 cherry-picks (vercel/next.js#95831 → #92277, #95639,
  #95692, #95753).
  - **Neither override retires.** 16.2.12 still pins `dependencies.postcss` exactly `8.4.31`
    (below the 8.5.18 key floor) and `optionalDependencies.sharp` `^0.34.5` (below the 0.35.0
    condition). Read off the published manifest, not inferred — `pnpm-workspace.yaml` is
    byte-unchanged.
  - **`@next/eslint-plugin-next` needs its own `pnpm add`.** It lives in `tooling/eslint`, so
    `pnpm --filter web add next@…` does not move it, and `manypkg` cannot flag the drift
    because its old `^16.0.0` range diverged from nothing. That is exactly why it sat three
    patches behind the framework it lints. Declared range is now `^16.2.12`.
  - **The verification that mattered was the alias path.** #92277 rewrites `load-jsconfig.ts`
    (+58/−20) to compute an effective base URL for `paths` declared **without** `baseUrl` —
    this repo's hard rule, and what `apps/web/tsconfig.json` does (`@/*` → `./src/*`). Only
    the Next app root's tsconfig is exposed (`packages/jobs` is a standalone worker Next never
    builds; `packages/ui` reaches the app via `transpilePackages`). Proven both ways: `next
    build` re-ran for 71 s — **not** a `FULL TURBO` replay, which on a lockfile change would
    have meant the graph never rebuilt — and `/calendar` rendered real DB rows on a `:3100`
    prod build; **and** `next dev --turbopack` first-compiled clean on `:3106`. The dev check
    is not ceremony: `load-jsconfig` feeds `next dev` too, and the gate never starts a dev
    server, so a dev-only alias regression would reach every consumer unobserved.
  - **This bump lifted the TypeScript-7 re-gate above** — `experimental.useTypeScriptCli` is now
    in a *stable* release. **Corrected 2026-08-02** in its own pass with its own evidence (the
    installed artifact + the flag's shipped docs page), deliberately not inherited from this
    entry: see the TS7 Watch item above for what the flag costs and what still blocks a cutover.
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

Two review passes keep docs and code from drifting — run them on real need (a big
upgrade, a batch of merged Renovate PRs) rather than on a calendar:

- **Doc audit** — sweep for code↔doc drift: claims in `docs/` that no longer match
  the code, duplication on the hot path, stale detail to archive — plus **currency
  drift** (claims the ecosystem moved out from under: upstream gates,
  "current/latest" statements) and the **outward-facing consumer claims** (README
  quickstart commands, badges, links).
- **Project audit** — score the repo against a best-available bar and emit a
  prioritized backlog of gaps — including, post-launch, the **public-template
  surface** (on-ramp truth, community files, automation actually alive) and a
  re-check of externally-gated watch rows.

Both audits ship as committed agent skills (`.claude/skills/project-audit/` and
`.claude/skills/doc-audit/`, alongside the checkpoint/tidy helpers — all installed
from the [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) skill library);
each SKILL.md is a plain-markdown procedure a human — or any agent tooling — can
follow directly. Past audit reports live in [`archive/`](archive/) as worked
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
