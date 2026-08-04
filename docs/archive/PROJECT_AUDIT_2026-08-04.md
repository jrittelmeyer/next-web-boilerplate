# Project Audit — 2026-08-04 (thirteenth scoring pass)

> The `/project-audit` skill's thirteenth run, six days after the twelfth
> ([PROJECT_AUDIT_2026-07-29.md](PROJECT_AUDIT_2026-07-29.md), **99.9/100**).
>
> **Method — git-bounded, three parallel review agents + live surface.** The
> twelfth pass scored the tree at `7a04c57`; HEAD this pass is `ba1dd68` — the
> tip of the **unmerged PR [#38](https://github.com/jrittelmeyer/next-web-boilerplate/pull/38)
> branch** (`security/brace-expansion-5-0-9`, 2 commits ahead of `main`), so this
> report describes `main`-plus-PR-#38. The delta is **217 files, +57,277/−475** —
> dominated by the **calendar program (Phases 0–5, merged 2026-07-30 → 08-02),
> which no audit had ever scored**, plus the 08-02/08-03 maintenance, doc-audit,
> e2e-diagnosability and advisory work. Product code byte-identical to the audited
> `7a04c57` tree carries by identity. Three subagent sweeps covered (a) the
> calendar core (`packages/calendar`, schema/migrations 0019–0025, tests),
> (b) the calendar app surface (ACL, router/actions, UI, invitations/RSVP,
> reminders, notifications), and (c) the non-calendar delta + doc currency + the
> three open PRs; every headline finding was independently re-verified in the
> code by the main loop before scoring. Live surface + registry gates checked
> 2026-08-04 ~08:00–10:00 UTC. **A new 21st feature group — Calendar &
> scheduling — is scored from this pass on.**

## Headline: **98.6/100 — the calendar lands at 85 on its first scoring; a 9-advisory batch went red this morning; `main` is red pending two open fix PRs**

The drop from 99.9 is real work, not decay: the repo's largest-ever feature
program entered the scored surface, and the audit found what its reviews and
100/100/100/100 gates did not — one HIGH silent functional defect (external
guests never receive cancellation emails, F4), a destructive validator footgun
(F5), two deploy-conditional identity seams (F6), and two silent recurrence
mis-renderings in the engine's long tail (F7, F8) — all six behind tests that
pass for the wrong behavior as well as the right one. Meanwhile the live
surface carries two time-driven reds: today's 9-advisory `pnpm audit` failure
(F2, issue #41, filed by the daily lane at 07:30 UTC and untriaged) and a red
`main` whose two causes both have fixes sitting in open PRs (F3). Everything
else — 14 groups — carries at 100, several re-verified live.

## Live-surface results (2026-08-04)

| Check | Result |
| --- | --- |
| Code-scanning alerts (API) | **0 open** |
| Dependabot alerts (API) | **0 open** — alert #16 (brace-expansion) auto-closed after the 5.0.9 override, exactly as the 07-29 pass predicted |
| Daily security-audit lane | **RED today 07:30 UTC** — 9 advisories (4 high, 5 moderate), auto-filed as [#41](https://github.com/jrittelmeyer/next-web-boilerplate/issues/41); see F2. Green 08-03; the pipeline's detect→file→runbook path worked unattended |
| CI on `main` (`3d127d9`) | **RED** — E2E lane: one *real* a11y failure + the known signup flake; see F3. CodeQL green |
| CI on HEAD (PR #38 branch) | **Green** (run 2026-08-03 19:03 UTC), CodeQL green |
| Open PRs / untriaged issues | **3 / 1** — #38, #37, #40, all sound (agent-reviewed; merge order #38 → #37 → #40); issue #41 is today's advisory red, in-runbook |
| CI Thursday heartbeat | 2026-07-30 **green**; next due 08-06 |
| Pages (Storybook gallery) | **HTTP 200** |
| `renovate/*` branches | **Still zero, ever** — the 07-27 *and* 08-03 Monday windows both passed empty; F1 carries, escalated |
| `pnpm outdated -r` | **51** entries (50 on 07-29, 44 on 07-22) — F1's compounding cost |
| Community files / on-ramp | CONTRIBUTING, CoC, SECURITY, FUNDING, issue/PR templates all present; README quickstart commands verified against scripts; badges resolve (CI badge shows main's red, truthfully) |

## Currency & gates (re-verified this pass)

| Gate | Finding |
| --- | --- |
| TS7 cutover (B4) | `typescript` latest **7.0.2**, `next` tag 7.1.0-dev → **7.1 not released; no `tsserver` yet; gate stands** |
| `next` 16.3.0 | Published **2026-08-03T20:34Z** → inside the 7-day gate until **2026-08-10**; the tree's `^16.2.12` is policy-correct today. With Renovate dead (F1) the take-it decision on 08-10 is manual |
| `better-auth` 1.6.25 | Installed **and is the registry latest** — the 07-30 owner-carry closed on schedule |
| `brace-expansion@5.0.9` age-exclude | Present, version-scoped, expires **2026-08-06 — DELETE IT THEN** (hygiene; inert after age-in) |
| `fast-uri` 3.1.5 | Published 2026-07-31 → **admissible 2026-08-07**; until then the override's own 3.1.4 pin is vulnerable (F2) — park GHSA-7p8r-x3mc-p8w7 in `ignoreGhsas` per the three-route rule's default |
| `undici` 7.29.0 · `postcss` 8.5.23 · `socket.io-parser` 4.2.7 | Published 07-24 / 07-24 / 07-15 — **all clear the 7-day gate now**; F2's remediation is unblocked except fast-uri |
| effect / esbuild-kit / sharp overrides | Still required (upstream pins unchanged); the **postcss override needs a RAISE** (floor 8.5.20 → 8.5.23, key widened to `<=8.5.22`), not removal |

## Findings

- **F1 — Renovate scheduled lane: CARRIED, third consecutive empty window (−2, Monorepo & tooling).**
  Two more Mondays (07-27 re-confirmed, 08-03 new) with zero `renovate/*`
  branches ever; 51 outdated entries and the override retirements still queue
  behind it. The B1 diagnosis/fallback row stands unchanged — it precedes
  everything else in the dependency lane.
- **F2 — Advisory batch #5 is OPEN: 9 advisories red on every branch (−2, Security).**
  Filed by the daily lane as issue #41 today: `socket.io-parser` <4.2.7 HIGH
  (react-email dev server path) · `undici` <7.29.0, 1 HIGH + 4 moderate
  (vitest→jsdom test path, 19 paths) · `fast-uri` <3.1.5 HIGH — **the
  workspace override's own 3.1.4 pin is now vulnerable** · `postcss` ≤8.5.22
  moderate — **same for its 8.5.20 floor** · `brace-expansion` <5.0.9 HIGH —
  already fixed on the PR #38 branch, red only on trees without it. No
  confirmed runtime-path HIGH: every path is build/dev/test tooling (postcss
  moderate reaches next's chain). The deduction is for open, due, unremediated
  work — the detection pipeline itself performed exactly to spec. Remediation
  is admissible **today** for everything except fast-uri (08-07). Backlog: the
  batch-#5 row.
- **F3 — `main` is red; both causes have unmerged fixes (−1, Testing & CI).**
  Run 30811417546 (push `3d127d9`, 08-03): (a) `a11y.spec.ts:81` fails retries
  #1 *and* #2 — **real**: Uploadthing's avatar button sits
  `data-state="readying"` forever with no token and paints 2.54:1; the
  state-scoped scan exclusion is `ba1dd68` on the PR #38 branch. (b) Three
  `waitForURL` hangs = the signup flake, whose pre-hydration-click diagnosis
  and fix are open PR #37 (agent-reviewed: sound, well-evidenced). The
  diagnosability machinery shipped in #36 **provably works** — the red run
  produced full reports + traces for the first time. Merge order
  **#38 → #37 (rebase; #38's a11y comment wins the conflict) → #40**.
- **F4 — External guests never receive cancellation emails (HIGH; −3, Calendar).**
  `apps/web/src/server/actions/calendar.ts:1715` — `softDeleteEvent` collects
  recipients with `ne(attendees.userId, actor.id)`; SQL `<>` is NULL-false, so
  every external attendee (`user_id IS NULL`) is silently dropped from
  `guestEmails` and `enqueueCancellations` emails nobody external. They are
  precisely the recipients with no in-app feed and a live `.ics` on their
  calendar. The unit test (`calendar.test.ts:1002-1011`) mocks the select and
  **asserts the wrong behavior**, which is how it shipped. Fix
  `or(isNull(userId), ne(userId, actor.id))` + a real-Postgres integration
  test (the repo's own integration harness would have caught it).
- **F5 — `deleteEventSchema` accepts the half-pair `updateEventSchema` refuses (−1.5, Calendar).**
  `packages/validators/src/calendar.ts:464-467` has no `scopePairIssues`
  superRefine, so `scope:"this", recurrenceId:null` routes to whole-series
  soft-delete + cancellation fan-out — "delete this occurrence" destroying the
  series. Writer-authorized (no privilege escalation), fail-destructive.
  `api.md:78-83` claims both schemas refuse — currently true only of update.
- **F6 — Two unverified-email identity seams in attendee handling (−2, Calendar).**
  (a) `resolveAttendeeUserIds` (`calendar.ts:533-543`) matches accounts by
  email with **no `emailVerified` filter** and stamps the `user_id` at invite
  time; (b) `respondToEvent`'s UPDATE (`calendar.ts:1556-1564`) re-states
  identity the same way and can capture a co-invitee's row. Both bypass the
  read-side verified-email conjunct that `attendees.md:213-215` presents as
  the defense. Mitigated wherever email is configured
  (`requireEmailVerification: isEmailConfigured()`); reachable on
  email-unconfigured deploys, which graceful degradation treats as supported.
- **F7 — The 08-02 grid fix is incomplete: `overlaps` still drops long self-overlapping occurrences (−1.5, Calendar).**
  `seekPeriodIndex` keeps exactly one period of slack
  (`packages/calendar/src/expand.ts:283`) and was not widened when
  `match:"overlaps"` landed (529c8d5 changed selection, not seek): an
  occurrence starting ≥2 recurrence periods before the window is never
  *generated*, so the new accept predicate never sees it. Any series whose
  span exceeds ~2 periods (daily multi-day, weekly with >2-week span) still
  vanishes from months it overlaps — the exact symptom the fix claims
  eliminated. The test asserts returned rows satisfy the predicate, not that
  the set is complete.
- **F8 — `FREQ=YEARLY;BYMONTHDAY=n` without `BYMONTH` silently mis-expands (−1.5, Calendar).**
  `expand.ts:231` falls back to DTSTART's month → 1 occurrence/year; RFC 5545
  and the package's own frozen oracle (`rrule@2.8.1`) yield the nth of
  **every** month. Invisible to the 528-case differential because the corpus
  generator always pairs YEARLY BYMONTHDAY with BYMONTH, and the one unit test
  asserts a property both behaviors satisfy. This is the silent-wrong-render
  class the package's docs vow to refuse rather than emit. Fix note: the
  correction *adds* occurrences (existing `recurrence_id`s survive), so the
  closed engine-swap window is not re-opened — but the corpus regeneration is
  a reviewer-approved fixture change by design.
- **F9 — README says "calendar" zero times (−1, Docs & DX).**
  The public front door's status blurb and feature enumeration omit the
  repo's largest feature program entirely (FEATURES.md covers it; the guide
  gained ch. 12). Same currency class as the self-filed slide-deck B3 row,
  one surface higher.
- **F10 — Long-tail batch (grouped smalls).** Calendar: ICS parameter values
  use TEXT escaping instead of RFC 6868 quoting and leave `:` unescaped in
  `CN` (`ics.ts:126-135,237` — latent, `organizerName` is always null today) ·
  DATE-form `UNTIL` compared as UTC end-of-day against zone-resolved starts
  (one extra day in UTC+ zones; UI never emits it, actions accept it) ·
  `seriesEndInstantMs` under-estimates across a fall-back, violating its own
  "never under-estimate" comment (`occurrences.ts:262-267`) · DAILY+BYMONTHDAY
  refused with a false RFC attribution (`rrule.ts:337-342`) · one-off events'
  RSVP tokens never expire (`exp=0` from NULL `seriesEndAt`) ·
  `updateOccurrence` accepts a non-member `recurrenceId` (phantom chip,
  self-inflicted) · `deleteCalendar` is the one write with no rate limit ·
  the `/rsvp` read path has no limiter (invitations.md promises 60/min).
  App-wide, pre-tracked in Watch and now promoted to rows: `calendar.range`'s
  429 renders a **blank month grid with no error state**; reminder emails are
  en-GB/event-zone even for account holders whose zone `user_preferences`
  stores; `/admin/audit`'s intermittent `scrollable-region-focusable`
  (`@repo/ui` table container, standard remedy known); Uploadthing's
  perpetual `readying` button on keyless deploys (excluded from the a11y scan
  — correctly scoped — but still what a keyless user sees). Tooling: the kit
  adapter's `prodVerify.start` command is broken (`--` forwarding hands
  `--port` to `next start` as a directory; PR #40 files the row) (−1,
  Monorepo & tooling).

## Doc drift (found this pass)

Fixed in this audit commit (unowned by any open PR): `VERIFICATION.md:115`
(3 files/15 tests → **9** integration files), `:117` (1 jobs test → **3**),
`:124` (e2e enumeration missing the 3 calendar specs + notifications; 29
exist), `:125` ("environmental, not a code bug" — disproven by PR #37's
diagnosis); `MAINTENANCE.md:415-422` (the 07-22 batch bullet still said
`brace-expansion: 5.0.8` / "5.0.9 deliberately not taken" — the seventh site
PR #38's six-site edit missed); `API.md:404-408` ("the only place a write
authorizes on a row" — `respondByToken` is a second since Phase 4);
`attendees.md:213-215` (defense claim annotated with the F6 seams);
`invitations.md:237` (60/min read limiter doesn't exist — reworded to what
ships, row filed to build it), `:184` (organizer-exclusion comment describes
a filter the query doesn't have); `recurrence.md:88` (never-under-estimate
claim false across a fall-back), `:15-17` (BYMONTHDAY support claim omits the
DAILY refusal). Left to PR #40 (verified sound, in flight): TESTING.md:221
coverage include, PROJECT_STATUS kit 0.7.1→0.7.2, factors.md anchor, the
superseded MAINTENANCE flake row, reminders.md's outrun Phase-6 line.

## Score table

| # | Feature group | 07-29 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 98 | **97** | −2 F1 (third empty window, 51 outdated); −1 the kit `prodVerify.start` command is broken (F10) |
| 2 | Framework & app architecture | 100 | **100** | Calendar routes follow every convention (RSC pages, ACL server-side, split read surface) — verified by sweep |
| 3 | Database | 100 | **100** | The calendar schema is the repo's strongest area: arithmetic derived-instant CHECK proven by planted defects, composite self-FK, measured partial indexes, EXPLAIN-pinned plans, additive-safe migrations 0019–0025 |
| 4 | Auth & access control | 100 | **100** | Core untouched; 1.6.25 closed on schedule and is registry-latest. (F6 is calendar-side attendee identity, scored there) |
| 5 | API layer (tRPC + Actions) | 100 | **99** | −1: `deleteCalendar` breaks the six-step contract (no rate limit); the delete/update schema asymmetry sits on this seam (F5); API.md drift fixed this pass |
| 6 | UI & design system | 100 | **99** | −1: `/admin/audit` scrollable-region intermittent (remedy known, @repo/ui table) + Uploadthing perpetual-readying state on keyless deploys. Calendar grid itself is APG-correct with e2e-pinned roving tabindex |
| 7 | State & data fetching | 100 | **100** | Carries; calendar queries use the boundary correctly |
| 8 | Forms & validation | 100 | **100** | Recurrence builder locale-safe; validator suite strong (F5 scored under API/Calendar, not the forms layer) |
| 9 | Email | 100 | **99** | −1: reminder emails render en-GB/event-zone even when `user_preferences` knows the reader's zone and locale — removal condition already specified, now a row |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical — carries |
| 11 | File uploads | 100 | **100** | Byte-identical (the readying-state issue is scored under UI) |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Reminders sweeper verified: claim-then-compensate, instant-keyed dedupe, race-tested, graceful with email unset |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 100 | **98** | −2 F2: the 9-advisory batch is open and due (incl. two override pins now themselves vulnerable); no confirmed runtime-path HIGH; the detect→file→runbook pipeline performed unattended |
| 16 | Testing & CI | 100 | **97** | −1 F3 (main red, fixes unmerged); −1 the set-active hang remains root-cause-unknown (now instrumented); −1 the assertion-blind-spot class — three independent defects (F4, F7, F8) each sit behind a test that passes for the wrong behavior |
| 17 | Deployment & ops | 100 | **100** | Heartbeat green 07-30; carries |
| 18 | Docs & DX | 100 | **97** | −1 F9 (README); −1 VERIFICATION.md staleness (fixed this pass); −1 the deck's standing calendar gap + the #40-in-flight residuals. docs-sanity green (65 files); guide ch. 12 spot-checks 5/5 true |
| 19 | Internationalization | 100 | **100** | Calendar strings fully routed through next-intl (email locale scored under Email) |
| 20 | Realtime / SSE | 100 | **100** | Notification union parity + two-slot contract verified on both feed paths |
| 21 | **Calendar & scheduling** (new) | — | **85** | First scoring. −3 F4 · −1.5 F5 · −2 F6 · −1.5 F7 · −1.5 F8 · −2.5 long-tail (ICS params, UNTIL-DATE, seriesEnd, tokens, phantom chip, DAILY refusal) · −1 blank-grid 429 · −1 drift bundle · −1 masked-test blind spots. Against that: the time core, schema layer and verification design (frozen 528-case oracle, planted-defect proofs, EXPLAIN pins) **exceed** the best-available bar — the defects cluster in the long tail of an exceptionally built subsystem |
| | **Overall (mean)** | **99.9** | **98.6** | |

## Backlog delta

New rows merged into [BACKLOG.md](../BACKLOG.md) (banded per its convention);
each recovers the named deduction:

| Band | Area | Item | Lifts | Effort |
| --- | --- | --- | --- | --- |
| B1 | Security / deps | **Advisory batch #5** (issue #41): merge #38 first; raise `undici` ≥7.29.0 + `socket.io-parser` ≥4.2.7 overrides; widen the postcss key to `<=8.5.22` → 8.5.23; park fast-uri GHSA-7p8r-x3mc-p8w7 in `ignoreGhsas` until 3.1.5 ages in 08-07, then promote; CHANGELOG + Watch rows; #41 auto-closes | Security +2 | S |
| B1 | Calendar | **F4: external-guest cancellations** — `or(isNull(userId), ne(...))` + real-Postgres integration test of recipient sets; fix the mocked test's wrong assertion | Calendar +3 | S |
| B1 | Calendar | **F5: `deleteEventSchema` refuses the half-pair** (share `scopePairIssues`) + validator test | Calendar +1.5, API +0.5 | S |
| B2 | Calendar | **F6: enforce `emailVerified` at both writer seams** (invite-time resolution, respond UPDATE) + seam tests; restores attendees.md's claim | Calendar +2 | M |
| B2 | Calendar | **F7: widen `seekPeriodIndex` under `match:"overlaps"`** (span-aware slack or seek-by-span) + a completeness test with span > 2 periods | Calendar +1.5 | S–M |
| B2 | Calendar | **F8: YEARLY;BYMONTHDAY without BYMONTH expands all months**; extend the corpus generator to sample the family (reviewer-approved fixture regen per the leaf's rule) | Calendar +1.5 | M |
| B2 | Calendar / UX | **Blank-grid 429**: render `calendar.range`'s error state (and reconsider 20/min for month paging) — promoted from Watch | Calendar +1 | S |
| B2 | API / security | **Rate-limit completeness**: add the missing `deleteCalendar` limiter + a `/rsvp` read-side limiter (or 60/min per invitations.md's original design) | API +0.5, Calendar +0.5 | S |
| B2 | Email / i18n | **Localized reminder emails for account holders**: pass locale + `user_preferences.timeZone` through the sweeper to the template (removal condition pre-specified in Watch) | Email +1 | M |
| B3 | Calendar | **Long-tail correctness batch**: RFC 6868 param quoting + `:` in CN; mailto interpolation hygiene; DATE-UNTIL zone semantics; `seriesEndInstantMs` fall-back slack (+ COUNT `truncated` bit); DAILY+BYMONTHDAY (support or correct the attribution); one-off token expiry from `endAt`; `updateOccurrence` membership check | Calendar +2.5 | M |
| B3 | UI / a11y | **Table-container remedy** (`tabIndex={0}` + `role="region"` + name in `@repo/ui` table) — closes the `/admin/audit` intermittent; benefits every table — promoted from Watch | UI +0.5 | S |
| B3 | UI / uploads | **Gate the avatar uploader on config** (or style the `readying` state accessibly) — a keyless deploy currently shows a perpetual low-contrast button | UI +0.5 | S |
| B3 | Docs / showcase | **README calendar currency**: feature blurb + stack/feature tables name the calendar; pairs with the standing deck row and the B3 reframe | Docs & DX +1 | S |
| B2 | Testing | **Assertion-blind-spot sweep**: completeness/count assertions for the three masked defects' families (overlaps completeness, YEARLY family counts, recipient sets vs real SQL) | Testing & CI +1 | M |

Pre-existing rows unchanged: **Renovate diagnosis/fallback (B1)** — still
first in the dependency lane; Phase 6 Band 2 (owner-gated); intake-drop;
positioning reframe; deck row; second adapter; TS7 (B4). PR #40's kit
`prodVerify.start` row is adopted as filed (kit-half edits the ai-dev-kit
clone, per the boundary rule).

**Owner-carry (dated, already in Watch):** **2026-08-06** — delete the
`brace-expansion@5.0.9` age-exclude; heartbeat due. **2026-08-07** — fast-uri
3.1.5 ages in: promote the override, drop the ignore. **2026-08-10** — `next`
16.3.0 admissible (manual while Renovate is down). **Now** — merge
**#38 → #37 → #40** (rebases; #38's a11y comment wins its conflict), which
turns `main` green again on both red axes.

## Considered & excluded

- **Calendar Phase 6 Band 2** (sharing, org calendars, ICS import, guest
  permissions, per-occurrence RSVP) — owner-gated on a real consumer; a
  completeness bar for a *calendar product*, not for a starter whose Band-1
  discharge shipped. Not a deduction.
- **Guest reminders + inbound iTIP REPLY ingestion** — owner-closed extension
  points (consent surface / inbound transport); recorded, not scored.
- **Styling Uploadthing's `readying` button in-place** — rejected in favor of
  the config-gating row; the button is third-party DOM and the state is
  keyless-only.
- **A blanket `undici` override** for Node's bundled fetch — n/a; the runtime
  undici is compiled into Node, unaffected by the npm advisory.
- **Editing the six calendar app-code comments/tests** flagged by the sweeps
  (e.g. the wrong mocked assertion, `loadRecipients`' comment) — product-code
  edits, out of this skill's scope; each rides its backlog row.
- **docs-sanity's fails-open Commands nit** and **override registry-drift
  refresh** — carried verbatim from 07-29 (the latter is still F1's job).
- **`main` branch protection** — standing owner decision, re-noted, not
  scored.

## Prioritization

The dependency lane leads: **batch #5 (B1)** is due now and unblocks the
Audit lane on every branch; the **merge queue (#38 → #37 → #40)** rides with
it and un-reds `main`. Then the two **B1 calendar correctness rows (F4, F5)**
— both small, both silent-failure class. The B2 band (F6–F8, blank-grid,
limiters, localized reminders, the test sweep) is the calendar's path from 85
back toward 100 and benefits every derived project that touches scheduling;
the B3 tail is polish. The Renovate diagnosis row remains the standing
gate on the whole dependency lane. Band order maps to the backlog doc's
existing B1 > B2 > B3 convention unchanged.
