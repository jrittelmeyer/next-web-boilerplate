# Project Audit — 2026-09-23 (eighteenth scoring pass)

> The `/project-audit` skill's eighteenth run, twenty-two days after the seventeenth
> ([PROJECT_AUDIT_2026-09-01.md](PROJECT_AUDIT_2026-09-01.md), **99.3/100**).
>
> **Method — git-bounded + live surface + adversarial product review.** The seventeenth
> pass scored `main` at `8414839`; this pass's HEAD is `261f4aa`. The delta is **113
> files across 29 commits** (`git diff --stat`, main loop), and — unlike the last three
> passes — **product code moved**: the calendar long-tail correctness batch (`425e53e`:
> `packages/calendar` ICS/RRULE/occurrence fixes, `apps/web` action + invitation
> changes), the `calendar.range` error state (`4b0d0b6`), the `<Table>` region role
> (`a8b7a70`), the month-boundary e2e fix (`17a613e`), two new e2e specs, nine `@repo/db`
> integration suites (the predicate-sensor batches), the `renovate.yml` gate, four
> dependency takes (`next` 16.3.6, `better-auth` 1.6.33, `knip` 6.35.1, vitest 4.1.11)
> and six advisory overrides. Because product code moved, an **adversarial read-only
> review subagent** was spawned over every changed product file (its findings are R1–R9
> below, each re-read in the main loop; everything it certified clean carries by
> identity), alongside the mechanical **doc↔code reference sweep** subagent (every line
> ref, 523 path tokens, 802 links, the STACK.md table, the count claims, the hard rules).
> The live-surface + registry gates were re-run 2026-09-23 ~07:03–07:45 UTC in the main
> loop (`gh`, `npm view`, `pnpm audit`/`outdated`); the contrarian sandbox had no
> `git`/`gh`, so the commit counts, run IDs, the e2e counter and the Mend dashboard are
> main-loop-verified, not contrarian-verified. The report file was handed to the
> `contrarian` subagent **before any row was seeded**; its 11 findings and their
> dispositions close the report — four Majors reshaped the headline arithmetic, F4, R3's
> fix shape and F1's pricing rule.

## Headline: **99.5/100 — the calendar long-tail batch and the two B2 closes recovered 3.5 calendar points, every 09-01 row closed on schedule, the Renovate host decision retired a two-point deduction to a zero-cost Watch item under the repo's own owner-decision rule, the ledger is 0/0/0 and `main` is green at HEAD including the daily lane; the new deductions are one narrow regression the batch itself introduced (`updateOccurrence` now refuses a legitimate RDATE past the rule's end), the 429 error state that still renders blank for the retry backoff, a hardcoded English landmark on every table, two predicate pins the batch forgot, a 12-day red on the daily security lane that reached no one, the tree at 63 outdated with a `vitest` major aged in unproposed, the kit six tags behind, and the canonical dependency record left stale by a take for the second pass running**

The window's story is delivery: three plan-gated rows (long-tail batch, range error
state, predicate sensors) and the 09-01 pass's three seeded rows all shipped, two
security takes landed on the day they were needed (`next` 16.3.6 for an RCE on three
public image routes, taken as a route-(2) exception the same evening it published;
`knip` 6.35.1 closing a 12-day-old HIGH), and the release drafts were published. What
the delivery cost is visible at three seams. **First**, the long-tail batch's item 4 —
"validate `recurrenceId` in `updateOccurrence`" — reused `planSeriesCut`'s *bounds*
check as a *membership* check, and bounds are exactly what an RDATE is allowed to
exceed: an owner who added an extra date past a bounded series' `UNTIL` can no longer
edit that occurrence (R1), and a date *inside* the bounds that the rule never generates
still writes the phantom chip the batch's CHANGELOG entry says it closed (R2).
**Second**, the daily security lane was red from 09-10 to 09-22 with its triage issue
open, assigned and commented daily, two heartbeats red — the detection half of the
runbook worked on day one and the response half fired on day twelve; nothing in the
deployed posture was exposed (`knip` → `smol-toml`, a dev-only tool), but the
notification mechanism ships to every generated project and demonstrably did not reach
an owner (F5, priced under Testing & CI with a mitigation row). **Third**, the canonical
version record slipped again: the `better-auth` 1.6.33 take updated STACK.md's
`better-auth` row but not its `@better-auth/passkey` row — the identical partial miss the
08-26 take made — and left MAINTENANCE's dated-take bullet saying the repo still pins
1.6.30.

## Live-surface results (2026-09-23)

| Check | Result |
| --- | --- |
| Code-scanning alerts (API) | **0 open** |
| Secret-scanning alerts (API) | **0 open** |
| Dependabot alerts (API) | **0 open** |
| `pnpm audit` (local, this pass) | **0 / 0 / 0 / 0 / 0** across 1,163 deps; `ignoreGhsas: []` verified in the live file |
| CI on `main` (`261f4aa`) | **GREEN** — CI run `35829696464` + CodeQL `35829696401`; every lane incl. Docker (build · boot · `/api/health` smoke · scan · SBOM), Visual, CSP-nonce; perf skipped by design. Green on all four 09-23 heads that carry 16.3.6 (`7f94191`, `425e53e`, `2a657c3`, `261f4aa`) |
| Daily `security-audit` lane | **GREEN on `261f4aa`** — run `35832400538`, a `workflow_dispatch` fired at 07:34Z by this pass because the 05:00Z cron lands ~09:30Z and its last run (09-22 09:32Z, `a671798`) was still the `smol-toml` red. This is the lane's own confirmation the resume prompt asked for, not the push-lane audit job's |
| CI red window since 09-01 | Audit lane red on `9aa461c`/`594c95d`/`2f8627a`/`fa7c940` (09-02, `fast-uri` ×4 HIGH, fixed same day) · `21bea3c` → `fd07fa3` (09-08, `sharp`/`baseline-browser-mapping`/vitest, fixed `3e0ae56`) · **heartbeats 09-10 and 09-17 + `134be2a` (the `smol-toml` HIGH, 09-10 → 09-22, issue #61)**. E2E lane red on `4b0d0b6`/`6c9d2b0` (09-03, the new range-error spec's own timing, fixed `dccaa29`) and `fd07fa3` (09-08, fixed `db27c89`). Every red had a named cause and a same-day or next-commit fix except `smol-toml` (12 days — F5) |
| e2e consecutive-green counter | **11** first-attempt green e2e lanes since the last red (`fd07fa3`, 09-08), heartbeats included (their e2e jobs were green while their audit jobs were red) — the 20-green removal condition for flakes (a)/(b) is not met; the (c) checkpoint is 2026-10-01 00:00–04:00Z |
| Open PRs / untriaged issues | **0 / 0** — issue #1 is the Mend Dependency Dashboard, `updatedAt` **still 2026-07-22**; issue #61 (`smol-toml` triage) auto-closed 09-23 |
| `renovate/*` branches | none. Mend PRs ever: 8 (07-18 ×7, #56 08-31), all merged; Monday windows 09-07/09-14/09-21 produced nothing; the frozen dashboard still lists "Pending Approval: `actions/setup-node` v7" and 37 npm updates "awaiting schedule" computed on 07-22 |
| `pnpm outdated -r` | **63 unique** (58 on 09-01) — majors behind: `typescript` 7 (held), `@types/node` 26, `jsdom` 30, `size-limit`/`@size-limit/file` 14, `@testing-library/jest-dom` 7, **`vitest`/`@vitest/coverage-v8` 5.0.1 (new — 5.0.0 published 09-03, aged in 09-10)**; `react`/`react-dom` 19.3.0 minor |
| Exact-pinned publishers vs `latest` | `posthog-js` 1.391.2 → **1.434.9** (43 minors; the dompurify fix channel) · `@sentry/nextjs` 10.59.0 → 10.75.2 · `stripe` 22.2.2 → 22.6.2 · `knip` 6.35.1 → 6.37.0 · `lucide-react` 1.18.0 → 1.47.0 |
| Releases | v1.2.0 (08-30, Latest) · **v1.0.0 and v1.1.0 published 09-03, non-latest** — the 09-01 F5 row closed as prescribed |
| Pages (Storybook gallery) | **HTTP 200**; CI badge **200** |
| README front door | Quickstart + every Scripts-block command resolves to a real root script (13/13); calendar now named in the status blurb **and** the feature table (both since `fa7c940`, 09-02) — the open B3 "README calendar currency" row is already satisfied |
| Community files | CONTRIBUTING · CODE_OF_CONDUCT · `.github/SECURITY.md` · PR template · two issue forms + `config.yml` · FUNDING · LICENSE · `.nvmrc` — all present |
| `docs/archive/README.md` index | **31 rows = 31 files** before this report (this report adds row 32); two plan files still carried "draft, pending sign-off" headers after shipping (fixed this pass) |
| Branch protection | `branches/main/protection` → 404 (no required check); ruleset `protect-main` present (no force-push / no deletion) — matches the docs |
| Runner images | All twelve jobs across the five workflows use `ubuntu-latest`; GitHub's runner annotation on run `35832400538` dates the **Ubuntu 26 rollout to 2026-10-19** — new dated Watch item (F7) |
| Remote branches | `main` · `docs/adopt-wrapper-backlog-row` (parked, owner-tracked — INFO carries) |

## Currency & gates (re-verified this pass)

| Gate | Finding |
| --- | --- |
| `next` 16.3.6 `minimumReleaseAgeExclude` | **Present, ten entries, on schedule**: 16.3.6 published 2026-09-22T16:19:00Z → inert **2026-09-29T16:19Z**. Delete all ten + prove with CI's frozen install (Dependency-policy rule 2). `latest` = 16.3.6, no 16.3.7 |
| 16.3.6 take's rule-6 riders | **Docker standalone boot — web target proven by CI, worker target discharged by inspection** (F4): `ci.yml`'s Docker job (`:358-438`) builds `docker/Dockerfile`'s default `runner` target with `BUILD_STANDALONE=1` (→ `output: "standalone"`, `next.config.ts:25-26`), boots it against Postgres and polls `/api/health` for a real 200; green on all four 16.3.6 heads. The `worker` target is build-only there (`:406-407`), and no file under `packages/{db,email,jobs,calendar,validators}/src` — the whole worker bundle — imports `next`, so a `next` bump cannot reach its boot path. Rule 6(a)'s literal "both targets" clause is therefore satisfied for *this* bump by inspection, not by a run; scoping the clause is the owner's call (rider on the 09-29 batch). **Still open:** the AVIF-source `/_next/image` drive and the `@next/eslint-plugin-next` lockstep bump (resolves 16.2.12; `latest` 16.3.6 — `pnpm outdated` reports 16.3.5 because the age gate hides 16.3.6 until 09-29, so the lockstep bump belongs to the 09-29 batch) |
| `better-auth` | Installed **1.6.33 exact** (`release-1.6` head, published 09-14) with `@better-auth/passkey` in lockstep; `latest` **1.7.5** (09-14, 15 breaking changes) stays plan → sign-off with no advisory forcing it. The review subagent diffed the 1.6.30 → 1.6.33 dists: 15 files, instrumentation refactor + Turnstile verify-handler logging + zod enum key reordering in `.d.mts`; **no schema field moved**, matching the take's claim |
| TS7 cutover (B4) | `typescript` latest **7.0.2**, `next` tag `7.1.0-dev.20260922.1` → 7.1 not released; hold stands |
| `vitest` 5 | `latest` **5.0.1**; the 4.1.11 security take (09-08) deliberately stayed on 4.x because 5.0.0 was inside the gate — it has aged in since and nothing tracks it (Mend never proposed it). Eight `vitest.config.ts` + coverage-v8 lockstep — a triage of its own inside the currency cadence (F1) |
| Workspace overrides (live read) | **14 keys** — twelve security (`effect` · `postcss` · `@esbuild-kit/core-utils>esbuild` · `brace-expansion` · `dompurify` · `nanoid` · `undici` · `socket.io-parser` · `browserslist` · `fflate` · `sharp` · `baseline-browser-mapping`) + two non-security (`vite` freshness pin, `fast-uri` — reclassified as "routine currency" on 09-22). Bare keys: `sharp` (documented — next's pin is the only path) **and `effect`** (a peer-range pin, bare by necessity). BACKLOG's Watch line had the split wrong (`effect` counted non-security, `fast-uri` uncounted) — fixed |
| effect / esbuild-kit overrides | Still required — `uploadthing` latest **7.7.4** (2025-08, exact-pins effect 3.17.7); `drizzle-kit` latest **0.31.11** (still deps `@esbuild-kit`). Carry by upstream identity |
| ai-dev-kit | Installed **0.23.16**; clone tags through **v0.23.22** (09-08); `install.mjs --check` → **7 drifted files**, all upstream-forward. The delta matters to this repo: 0.23.20 fixed **this skill's own dead "run `/checkpoint`" step**, 0.23.19 added the `PreToolUse` twin of the skill-drift guard (the current one fires *after* the wasted edit), 0.23.21/22 fixed `harness-audit`'s hook double-count. Note the clone's working tree is dirty (7 files) — install from the tag, per the 09-02 rule |
| Renovate | Mend, no-lockfile class only (decided 09-03). Three empty Monday windows since; dashboard frozen at 07-22; a `vitest` major and 63 outdated went unproposed. The decision stands and costs no points (F1); its consequence is priced |
| Runner image (F7) | `ubuntu-latest` → Ubuntu 26 rollout begins **2026-10-19** ([actions/runner-images#14748](https://github.com/actions/runner-images/issues/14748)). Twelve floating jobs ship verbatim to generated projects. Owner decision before 10-19: pin `ubuntu-24.04` (template surface, five files) or accept the first post-rollout heartbeat (Thu 2026-10-22) as the acceptance run. New dated Watch item in MAINTENANCE |
| CI heartbeat | `cron: "30 4 * * 4"` — next **Thu 2026-09-24 04:30Z**, the first heartbeat since 09-03 that can run green (09-10 and 09-17 inherited the `smol-toml` red) |

## Delta verification (all claims checked at their seams)

- **Calendar long-tail batch (`425e53e`) — VERIFIED with two regressions (R1, R2).**
  `ics.ts`: `caretEncode` order (`^` first), `quoteParamValue` on exactly the RFC 5545
  §3.2 unsafe set plus `^`/newline, `stripControls` after encoding so `^n` survives,
  `encodeMailtoAddress` by code point — clean, tested. `rrule.ts`/`expand.ts`:
  `untilInstantMs` zone-aware at all three call sites; the Kiritimati test is a real
  discriminator. `occurrences.ts`: the UNTIL slack errs in the safe (exclude-late)
  direction; `truncated → null` avoids the finite under-estimate. `invitations.ts`: the
  `endAt` fallback only when `rrule === null`; `loadRecipients`' new join matches how
  `organizerEmail` is derived; every compared column is NOT NULL and lowercase-CHECKed.
  `softDeleteEvent`: `Actor.email` is `string`, so `lower($1)` is never NULL. **What
  failed review:** `updateOccurrence`'s new check — R1/R2 below.
- **`calendar.range` error state (`4b0d0b6` + `6c9d2b0`/`dccaa29`) — VERIFIED, with a
  residual (R3).** The error branch is ordered after `noCalendars`, before the grid; the
  i18n key is in both locales; the e2e burst is sound (the in-memory limiter's
  check-and-increment is synchronous) and its assertions discriminate the old `?? []`
  behaviour. The 15 s timeout widening is an honest accommodation of TanStack's default
  retry backoff, not a mask — but that backoff is itself the residual.
- **Month-boundary fix (`17a613e`) — VERIFIED.** `dayInThisMonth` derives year-month in
  `EVENT_ZONE` via `en-CA`; the pinned-instant proof (`2026-09-01T02:37Z` → `2026-08-15`)
  genuinely fails under the old runner-clock logic. Serial mode unaffected.
- **Predicate-sensor batches (nine `@repo/db` suites + two e2e sensors) — VERIFIED as
  fixture discriminators (R7).** Each "— the defect" case fails under the wrong spelling
  (checked: co-tenant `markAllRead`, ORG A's admin answering for ORG B, page 2 empty
  without the tiebreak). They restate the predicate in test code, so they prove the
  *shape*; only three `apps/web` pins bind production code. Known limitation, stated in
  the plan, carried not deducted.
- **`<Table>` region role (`a8b7a70`) — VERIFIED, one finding (R4).**
- **`renovate.yml` gate (`494ea6c`) — VERIFIED.** `if: vars.ENABLE_RENOVATE == 'true'`
  (`:65`), the `ENABLE_*` convention; skips, never fails. Two cosmetic leftovers (R8).
- **`knip` 6.35.1 + `tailwindcss` ignore (`fc9a850`) — VERIFIED.** `base.css` carries no
  `@import "tailwindcss"` of its own; the ignore's rationale holds.
- **Overrides `3e0ae56`/`c880214` and the 16.3.6 exclude (`7f94191`) — VERIFIED.** Ranged
  keys where a range is possible; `sharp` bare with its single-path justification; ten
  exclude entries consistent with the 16:19Z publish time.
- **`better-auth` 1.6.33 (`261f4aa`) — VERIFIED code-side, stale doc-side (F3).**
- **09-22/09-23 doc audits — SPOT-CHECKED.** The ninth compaction left 58 rows in
  PHASE_HISTORY verbatim; the archive index was 31 = 31 before this report; the showcase
  is stamped at seventeen passes / 99.3 (one pass stale after this report — `/doc-audit`
  hunt #6 owns the restamp, per precedent).

## Findings (this pass)

### Product code (review subagent, each re-read in the main loop; R1 reproduced end-to-end by contrarian from the UI path)

- **R1 — `updateOccurrence` refuses a legitimate RDATE past the rule's end (NEW,
  regression from `425e53e`, −0.5 Calendar & scheduling; new B2 row).**
  `apps/web/src/server/actions/calendar.ts:1313` now runs `planSeriesCut(target, rule,
  recurrenceId)` before the override upsert and returns its `fieldErrors` — but
  `planSeriesCut` (`:424-458`) rejects any date past `UNTIL` (`:434`) or beyond `COUNT`
  (`:448`), and an RDATE is *defined* to be allowed there: `setRecurrenceDate`'s own doc
  (`:1916-1918`) says "an added date past the rule's own end is the one thing that can
  extend a series", `seriesEndInstantMs` extends the series for it
  (`packages/calendar/src/occurrences.ts:276-280`), and the grid emits such an RDATE as an
  editable chip whose `recurrenceId` is the rdate wall (`occurrences.ts:228-233`).
  **Reproduced from the UI path (contrarian):** `event-composer.tsx:187-191` sends
  `scope: "this"` + the chip's `recurrenceId`; `calendar.byId` falls back to the master
  when no override row exists (`routers/calendar.ts:628`), so the composer opens; the
  submit lands on `:1313` and `:434` refuses it. **Failing scenario:** series
  `FREQ=WEEKLY;UNTIL=20270301`, owner adds RDATE `2027-03-15 09:00`, clicks the chip,
  edits "this occurrence" → `{ fieldErrors: { recurrenceId: "That date isn't part of
  this repeating event." } }`. Before the batch the upsert accepted it. No test covers it
  — the new unit test at `calendar.test.ts:1575` uses a date beyond `COUNT` with no
  RDATE; the plan (`calendar-long-tail-correctness-plan.md`, **item 4**) never considered
  RDATEs ("an actual generated occurrence of the target's `rrule`"). Unaffected:
  `deleteEvent` scope `"this"` (`planSeriesCut` is called only at `:1313`, `:1401`,
  `:1863`). `splitSeries` has the same RDATE-past-end limitation pre-existing (its cut
  semantics make it arguable); the fix should decide both. **Priced −0.5, not −1
  (contrarian #6):** a bounded series + an RDATE past its end + edit-this is a narrow
  path, and the whole nine-item batch was priced at −2.5. **Fix (S):** load
  `loadRecurrenceDates(target.id)` and accept when `recurrenceId ∈ rdates`, else a true
  membership test (R2).
- **R2 — the check is a bounds check, not membership; the batch's closure claim
  overreaches (NEW, −0.5 Calendar & scheduling; same B2 row).**
  `FREQ=WEEKLY;BYDAY=MO;COUNT=10` with a Tuesday `recurrenceId` between occurrences 3
  and 4: `before = 3 < 10` → accepted → a phantom override row is written, found by the
  range query's `rrule IS NULL` branch and emitted as a `RECURRENCE-ID` no client can
  match. The code comment (`:1302-1308`) and the test (`:1576`, "Same bound check")
  both say *bounds* honestly; what overreaches is the framing — "would otherwise let a
  tampered request write a phantom chip" (`:1305-1306`) and the CHANGELOG entry
  (`CHANGELOG.md:175`, "no validation that a caller-supplied date was an actual generated
  occurrence … now reuses `planSeriesCut`'s bound check"), which reads as closed. Low
  impact (the caller already holds write role). **Fix shape:** `expandRRule({ …,
  fromMs: cutMs, toMs: cutMs, limit: 1 })` and require one hit (both ends inclusive,
  `expand.ts:361`; COUNT generates from `dtstart`, `:312`) — or membership in `rdates`.
  **Decide `recurrenceId ∈ exdates` in the same change (contrarian #6):** a
  single-instant hit accepts an EXDATE'd date, and an override on a skipped date
  resurfaces through the concrete branch, since `occurrences.ts:236-241` prunes only the
  virtual set.
- **R3 — a 429 on `calendar.range` still renders a blank grid for the whole retry
  backoff and fires three more requests into the tripped bucket (NEW, −0.5 Calendar &
  scheduling; new B3 row).** `calendar-workspace.tsx:250-276` branches on
  `calendarsQuery.isPending` → skeleton, `rangeQuery.isError` → message, else the grid
  with `rangeQuery.data?.items ?? []` — so while `rangeQuery` is *fetching* (first load
  and every retry) the grid is empty. `apps/web/src/lib/trpc/query-client.ts:13-23` sets
  no `retry`, so TanStack's default `retry: 3` (1 s · 2 s · 4 s) applies to a 429: ~7 s
  of the exact blank grid the B2 row was filed to remove, plus three retries the limiter
  counts against the same 20/min bucket — and the bucket's window is fixed from its
  first call (the spec header, `calendar-range-error.spec.ts:21-29`), so no retry inside
  it can succeed. **Fix (S, shape corrected by contrarian #3):** a `retry` predicate on
  the query client that skips every 4xx tRPC code (`TOO_MANY_REQUESTS`, `UNAUTHORIZED`,
  `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST` — retrying any of them is equally pointless;
  server clients default `retry: 0`, so prefetch is unaffected), and a skeleton branch
  gated on **`rangeQuery.isLoading`** (pending *and* fetching) or `fetchStatus` — **not
  `isPending`**: `rangeQuery` is `enabled: visibleCalendars.length > 0`
  (`calendar-workspace.tsx:81-90`), and a disabled TanStack v5 query sits at
  `status: "pending"` forever, so an `isPending` skeleton would replace the grid
  permanently whenever every calendar is hidden. The e2e's 15 s widening then shrinks
  back. Priced under Calendar (symptom-located, the 09-01 precedent); the latent default
  lives in State & data fetching's surface and is named in that row's basis.
- **R4 — `@repo/ui` `<Table>` ships a hardcoded, non-overridable English `aria-label`
  and a universal tab stop (NEW, −0.5 UI & design system; new B3 row).**
  `packages/ui/src/components/table.tsx:16-23`: `role="region" aria-label="Scrollable
  table" tabIndex={0}` sit on the wrapper `div`; `...props` spread onto `<table>`, so a
  consumer cannot localise or override the landmark name. `apps/web/messages/es.json`
  exists and has no table-label key — Spanish users get an English landmark on every
  table — and every table, overflowing or not, becomes an extra tab stop. **Fix (S):**
  accept `containerProps` (or an `aria-label` prop defaulting to the current string);
  consider `tabIndex` only when overflow is detected, or document the redundancy.
- **R5 — the batch's two new email-exclusion predicates have no production pin (NEW,
  −0.5 Testing & CI; new B3 row).** `softDeleteEvent`'s new `ne(email, lower($actor.
  email))` (`calendar.ts:1777`) is restated in
  `packages/db/__tests__/integration/calendar-attendees.test.ts:72-124`, but the existing
  action-level pin (`calendar.test.ts:1213-1227`) still asserts only the `user_id` arm —
  drop the email clause and nothing goes red. `loadRecipients`' three-way join + `ne`
  (`invitations.ts:197-211`) is restated at `calendar-attendees.test.ts:127-168`, but
  `invitations.test.ts` (which mocks `db`) got no assertion on the query shape. The
  repo's own predicate-sensor posture (F4/F6 pins) is the standard the batch set for
  itself. **Fix (S):** extend the F4 pin regex to `"calendar_event_attendees"."email" <>
  lower($n)`; add a `loadRecipients` pin in `invitations.test.ts`.
- **R6 — two more `as any` in a test (folds into the B3 lint row, no new deduction).**
  `packages/db/__tests__/integration/keyset-tiebreak.test.ts:37,39`, each with a
  `biome-ignore` reason ("shared across three column types"). BACKLOG's lint row said
  "one `as any` in a test"; it is three. `PgColumn` from `drizzle-orm/pg-core` types both.
- **R7 — INFO: the predicate sensors are fixture discriminators, not production
  sensors.** Stated in the plan; carried as a known limitation. The three `apps/web` pins
  (`calendar.test.ts:759, 1213, 1354`) are the only bindings to production SQL.
- **R8 — INFO: `renovate.yml` leftovers.** `:67` still pins `actions/checkout` v7.0.0
  (#56 skipped the dormant file — every other workflow is on v7.0.1) and the gate
  comment at `:52-54` says "until the Renovate host decision lands" while the header
  says it landed. Cosmetic; rider on the next touch of that file (template surface,
  contrarian + sign-off). Line refs corrected by contrarian #8.
- **R9 — INFO, unverified in practice:** `untilInstantMs`'s DATE form resolves 23:59:59
  through `resolveCivil("compatible")`; a zone transition at 23:xx–24:00 would shift the
  bound by up to an hour. No IANA zone in the tested corpus does this. No action.

### Process, surface and docs

- **F1 — Renovate delivery: the fixed-price deduction is RETIRED; the stale tree is
  priced on its own merits (−1 Monorepo & tooling, new B2 row + a dated cadence).**
  The 09-01 pass held −2 as a fixed price for "delivery not restored" and said it would
  not re-price it per pass. Two things changed the rule that applies, not the number:
  the owner decided on 09-03 (Mend for the no-lockfile class; npm-manager delivery an
  accepted open risk with a 14-day liveness check), and this repo's stated precedent is
  that a recorded owner decision costs no audit points (TS7 hold — "costs no audit
  points"; `main` branch protection — "owner decision, not a build row"). A draft of
  this pass kept −2 by splitting it into a won't-fix −1 and a recoverable −1;
  **contrarian #4 called that a re-price wearing the old label** and asked for one rule.
  Applied: **(a)** the decision moves to Watch at 0, and **what the decision leaves
  behind is a new finding**: 63 outdated (58 on 09-01), a `vitest` major aged in with no
  row, the exact-pinned publishers this repo chose *so a lane would bump them* drifting
  further (`posthog-js` 43 minors on the dompurify fix channel). Manual dated takes cover
  security only; nothing covers currency, and a tree re-accretes at the same rate after
  any one-off batch (contrarian #9). **Shape:** a **dated monthly currency sweep** in
  MAINTENANCE → Watch (the honest substitute for the lane) whose **first instance is the
  new B2 row**, split in two — (i) in-range patches/minors + the exact-pinned publishers,
  S–M, one contrarian pass because it touches `pnpm-workspace.yaml` and `tooling/**`
  (CLAUDE.md's path-set trigger, not the bump size); (ii) the six majors, each its own
  triage decision (`vitest` 5 across eight configs + coverage-v8 lockstep first).
- **F2 — Kit currency: 0.23.16 → 0.23.22 (NEW, −0.5 Monorepo & tooling; new B3 row).**
  Six patch tags in three weeks; 7 drifted files; the delta includes a fix to this
  skill's own dead step. Same class as the 09-01 F7 row that closed 09-02 — the closure
  held for six days. Template surface ⇒ contrarian + sign-off; install from the tag.
- **F3 — The canonical dependency record was left stale by a take, second pass running
  (NEW, −0.5 Docs & DX; fixed in this pass's commit).** `261f4aa` updated STACK.md's
  `better-auth` row and not its `@better-auth/passkey` row (still "1.6.30 (exact)") — the
  identical partial miss the 08-26 take made and the 09-01 pass scored (F8) — and did not
  touch MAINTENANCE's dated-take bullet, which still read "this repo pins 1.6.30 … a
  routine patch take when convenient". The 09-01 scoring rule applies verbatim: drift in
  the doc AGENTS.md routes version questions to costs even when the pass fixes it.
  STACK.md's `next` row prose also still said "the `sharp` override retired with it"
  while a new `sharp: 0.35.4` override has been live since 09-08 — fixed. The MAINTENANCE
  bullet now tells the next take to update **both** rows.
- **F4 — Docker standalone boot: claimed open in three docs; the web half was proven by
  CI on every 16.3.6 head, the worker half is discharged by inspection (drift, fixed; no
  deduction for the boot).** Rule 6's own text names CI's Docker lane as the arbiter,
  and the lane boots the web image and polls `/api/health`; a draft of this pass wrote
  "PROVEN by CI" flat, and **contrarian #2 corrected it**: rule 6(a) asks for `docker
  run` on *both* targets, the worker step is explicitly build-only (`ci.yml:400-407`),
  and what discharges it is the widened grep — no `next` import anywhere in the worker
  bundle's packages, not just `packages/jobs/src`. Scoping rule 6(a)'s worker clause to
  bumps that touch the worker bundle's inputs is the owner's call (rider on the 09-29
  batch). What genuinely remains of the rider set is the AVIF drive and the plugin
  lockstep — **−0.5 Deployment & ops**, mapped to the dated 09-29 batch in MAINTENANCE
  (the repo's convention keeps dated takes out of the banded table).
- **F5 — The 12-day red on the daily security lane reached no one (NEW, −0.5 Testing &
  CI; new B3 row).** `smol-toml` GHSA-7w5x-hrqm-74c2 (HIGH, DoS via malformed TOML, sole
  path `knip` → `smol-toml`) landed 09-10; the daily lane filed and assigned issue #61
  that day and appended to it daily; heartbeats 09-10 and 09-17 went red; the fix (`knip`
  6.35.1, a plain bump) shipped 09-22. A draft of this pass logged it as INFO — dev-tool
  DoS, zero deployed exposure, green at HEAD — and **contrarian #5 argued the other
  side, which holds**: two doc-audit sessions ran in the window without executing the
  runbook's own control ("on any maintenance resume, check the open issue list"), and
  the issue + daily-comment mechanism ships verbatim to every generated project, where
  it demonstrably produced twelve days of unread red. The latency is owner cadence; the
  mechanism's failure to escalate is inherited. **Mitigation (S, new B3 row):**
  `security-triage-issue.sh` red-mode escalation — retitle with the age ("… red for N
  days") on each append, emit a `::error::` annotation naming the age so the heartbeat's
  own summary carries it, and after a threshold post one `@owner` mention (the assignee
  is already set at creation, `:79-82`). Testing +0.5 when it lands.
- **F6 — Stale counts and line refs (drift, fixed in this pass's commit; no
  deduction):** VERIFICATION.md "9 files" → **12** `@repo/db` integration suites, "29
  specs" → **31** (list gained `calendar-range-error` + `account-predicate-sensors`);
  TESTING.md "29 specs total" → 31; MAINTENANCE (c)'s three line refs rotted when the
  fix rewrote the spec (`:165` → `:184`; `:54-58` → `:63`; `:73` → `:43`) and (b)'s
  `organization.spec.ts:43` → `:48`; MAINTENANCE's "all 9 lockstep packages" → ten
  entries (the same miscount the 09-01 pass corrected once already); BACKLOG's
  `docs-sanity.mjs:98` → `:107-108`; BACKLOG's override split (`effect` is security and
  bare; `fast-uri` is the non-security one); BACKLOG's "one `as any`" → three; the README
  calendar row already satisfied 09-02; two archive plan headers still "draft, pending
  sign-off" after shipping (`renovate-b1-diagnosis-plan`, `renovate-b1-host-decision-
  plan`) and one with no status line (`calendar-range-error-state-plan`).
- **F7 — `ubuntu-latest` → Ubuntu 26, rollout 2026-10-19 (NEW, dated Watch item; no
  deduction).** Surfaced by the runner annotation on the dispatched daily-lane run.
  Twelve floating jobs across five workflows, shipped verbatim. Owner decision before
  10-19: pin `ubuntu-24.04` (template surface, one line per job, contrarian + sign-off)
  or let it float and treat the first post-rollout heartbeat (Thu 2026-10-22 04:30Z) as
  the acceptance run. Recorded in MAINTENANCE → Watch with its removal condition.
- **INFO — four stale `.gitkeep` files** sit in long-populated dirs
  (`apps/web/src/{components,lib,server}/`, `apps/web/public/`); `hooks/.gitkeep` is
  legitimate. Code-tree edit — `git rm` in any passing commit (carried from 09-01).
- **INFO — `docs/adopt-wrapper-backlog-row`** — still the only parked branch; the B3
  row is the record; delete-or-keep remains the owner's call.
- **INFO — the 09-02/09-03/09-08 red pushes cost no points.** State-at-HEAD grading and
  the 08-13/08-19/09-01 precedent: each red had a named cause and a same-day fix.

### Reference sweep (subagent, read-only)

Scope: 16 checkable line refs (2 more cite the external `install.mjs:36`), 523 unique
path tokens, 802 relative links + 239 anchors, the STACK.md table (57 rows) against every
manifest, the count claims, the AGENTS.md hard rules over `apps/web/src` +
`packages/*/src`, kebab-case, `.gitkeep`, the archive index, README commands. Results:
**11 line refs exact · 2 loose · 3 stale** (all fixed); **0 broken paths** (every miss is
build output, a hypothetical example, or an external file); **0 broken links or
anchors**; **56/57 STACK rows match** (the passkey row — F3); count claims **11 pass ·
4 mismatch** (F6); hard rules — `useMemo` ×3 / `useCallback` ×2 unchanged (the B3 lint
row's five sites), `as any` ×3 (R6), zero enums, zero `@ts-ignore`, zero `baseUrl`,
`paths` only in leaf tsconfigs, every default export framework-required; 0 non-kebab
files; archive index 31 = 31; README commands 13/13.

## Score table

| # | Feature group | 09-01 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 95.5 | **98.5** | F2 `renovate.yml` gate **closed 09-02** (+1) · kit row **closed 09-02** (+1) · permissions row **closed 09-02** (+0.5) · **F1's fixed −2 retired to Watch at 0 by the owner-decision rule (+2)** · **F1 stale tree, priced on its merits (−1, B2 currency row + monthly cadence)** · **F2 kit 0.23.16 → 0.23.22 (−0.5, B3 row)** |
| 2 | Framework & app architecture | 99.5 | **99.5** | The five Compiler-rule sites unchanged; `as any` now three (R6); B3 lint row carries (−0.5) |
| 3 | Database | 100 | **100** | Nine new integration suites reviewed; migrations `0000–0025` unchanged; better-auth 1.6.33 dist-diffed — no schema motion |
| 4 | Auth & access control | 100 | **100** | 1.6.33 exact + passkey lockstep; 1.7.5 plan-gated, no advisory |
| 5 | API layer (tRPC + Actions) | 100 | **100** | `ActionResult` shapes preserved through the batch; carries |
| 6 | UI & design system | 98.5 | **98.5** | Table-container row **closed 09-03** (+0.5) · **R4 hardcoded English landmark + universal tab stop (−0.5, B3 row)** · avatar readying (−0.5) · `select`/`form` stories (−0.5) |
| 7 | State & data fetching | 100 | **100** | Carries — but note the latent default R3 exposes lives here: `makeQueryClient` sets no `retry`, so every browser query retries 4xx three times; the fix in the R3 row is a client-wide predicate (STATE.md's surface), priced once under Calendar where the symptom is |
| 8 | Forms & validation | 100 | **100** | Carries |
| 9 | Email | 99 | **99** | Localized reminder emails still open (−1, B2 row) |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical (`stripe` 4 minors behind — F1's cost) |
| 11 | File uploads | 100 | **100** | Byte-identical; `sharp` 0.35.4 override live for the libheif HIGHs; the AVIF drive is priced under Deployment |
| 12 | Search | 100 | **100** | Byte-identical |
| 13 | Background jobs | 100 | **100** | Byte-identical; the worker bundle imports no `next` (F4) |
| 14 | Observability | 100 | **100** | Byte-identical (`posthog-js` 43 minors behind — F1) |
| 15 | Security | 100 | **100** | Ledger 0/0/0, `pnpm audit` 0, allowlist empty, every override conditioned, the exclude on schedule, an RCE on three public routes closed the evening it published, the daily lane green on HEAD. F5 is priced under Testing & CI (a pipeline-response control), not here: nothing in the deployed posture moved |
| 16 | Testing & CI | 98 | **98** | **F3 month-boundary row closed 09-03 (+1)** · `set-active` still unexplained (−1) · **R5 two unpinned predicates (−0.5, B3 row)** · **F5 twelve unread red days on a shipped mechanism (−0.5, B3 row)** · e2e green counter at 11 |
| 17 | Deployment & ops | 100 | **99.5** | Docker web boot proven by CI, worker discharged by inspection (F4, drift fixed) · **the AVIF `/_next/image` drive + plugin lockstep still open (−0.5, dated 09-29 batch)** · F7 Ubuntu 26 dated, no deduction |
| 18 | Docs & DX | 98 | **98.5** | Draft releases **published 09-03** (+0.5) · README calendar currency **satisfied 09-02** (+0.5, row struck) · deck calendar gap (−0.5) · **F3 STACK.md/MAINTENANCE left stale by the 1.6.33 take (−0.5, fixed — the stated rule)** · F6 incidental drift fixed, no deduction |
| 19 | Internationalization | 100 | **100** | Carries (R4's English landmark is priced under UI) |
| 20 | Realtime / SSE | 100 | **100** | Carries |
| 21 | Calendar & scheduling | 96 | **98** | Long-tail batch **closed (+2.5)** · blank-grid 429 **closed (+1)** · **R1 RDATE-past-end refusal (−0.5) + R2 bounds-not-membership (−0.5), one B2 row** · **R3 blank grid through the retry backoff (−0.5, B3 row)** · invitee-side signal (−0.5, B3 row) |
| | **Overall (mean)** | **99.3** | **99.5** | 2089.5 / 21 = 99.52 — recovered 10.5 (Monorepo 4.5 incl. the retired fixed price · Calendar 3.5 · Testing 1 · Docs 1 · UI 0.5), priced 5.5 new (Monorepo 1.5 · Calendar 1.5 · Testing 1 · UI 0.5 · Docs 0.5 · Deployment 0.5), net +5 on 2084.5. The up-tick is honest under the rubric: a −1 regression against +3.5 of closed calendar rows, and a rule change (owner decision → 0) stated rather than hidden |

## Backlog delta

| Band | Row | Change |
| --- | --- | --- |
| B2 | **Calendar — `updateOccurrence` membership: accept RDATEs, test true membership, decide EXDATEs** (R1 + R2) | **NEW.** S; `loadRecurrenceDates` short-circuit for `rdates` + a single-instant `expandRRule` hit (or `rdates` membership) replacing the `planSeriesCut` bounds reuse; **decide whether `recurrenceId ∈ exdates` is refused** (a single-instant hit accepts it and the override resurfaces through the concrete branch); unit tests: an RDATE past `UNTIL`, a non-generated in-bounds date, an EXDATE'd date; decide `splitSeries`' RDATE stance in the same change; reword the `calendar.ts:1302-1308` framing and add a CHANGELOG correction. `deleteEvent` scope `"this"` is unaffected. Calendar +1 |
| B2 | **Tooling / currency — monthly currency sweep, first instance** (F1) | **NEW.** Two halves: **(i)** in-range patches/minors across the tree + the exact-pinned publishers (`posthog-js` with the vendored-dompurify verify, `@sentry/*`, `stripe`, `knip`, `lucide-react` dual-pin), `dep-check` each (7-day age, exact-pin list), S–M, **one contrarian pass** — it touches `pnpm-workspace.yaml` (the `vite` pin) and `tooling/**`, CLAUDE.md's path-set trigger; **(ii)** the six majors as individual triage decisions (`vitest` 5 across eight `vitest.config.ts` + coverage-v8 lockstep first; `jsdom` 30, `@types/node` 26, `size-limit` 14, `jest-dom` 7; TS 7 held), each plan → sign-off. Full gate + e2e + Docker boot; `pnpm audit` 0 after; STACK.md rows in the same commit. The **cadence** (monthly, dated) is recorded in MAINTENANCE → Watch so the tree does not re-accrete unwatched. Monorepo +1 |
| B3 | **Kit 0.23.16 → 0.23.22** (F2) | **NEW.** S; tagged worktree install (`--global --hooks`), 7 drifted files, `--check` 0 after; reads the 0.23.17–22 CHANGELOG for anything the adapter must absorb. Template surface ⇒ contrarian + sign-off. Monorepo +0.5 |
| B3 | **Calendar / UX — no retry on 4xx + loading skeleton for `calendar.range`** (R3) | **NEW.** S; `retry` predicate on `makeQueryClient` skipping every 4xx tRPC code (safe client-wide: a fixed-window limiter cannot be out-waited by a retry; server clients already `retry: 0`); skeleton gated on **`isLoading`/`fetchStatus`, never `isPending`** (the query is `enabled`-gated and a disabled v5 query is pending forever); shrink the e2e's 15 s back. Calendar +0.5 |
| B3 | **UI / i18n — overridable `<Table>` container label** (R4) | **NEW.** S; `containerProps`/`aria-label` prop with the current default; optional overflow-gated `tabIndex`; `admin/audit` passes a translated label. UI +0.5 |
| B3 | **Testing — pins for the two email-exclusion predicates** (R5) | **NEW.** S; extend the F4 pin to the email arm; add a `loadRecipients` pin in `invitations.test.ts`. Testing +0.5 |
| B3 | **CI — security-triage issue age escalation** (F5) | **NEW.** S; `security-triage-issue.sh` red mode: retitle with the age on each append, `::error::` annotation naming the age, one `@owner` mention past a threshold. Ships to generated projects. Testing +0.5 |
| B3 | Gate the prose-only hard rules, lint-only | **Edited:** `as any` count one → three (`keyset-tiebreak.test.ts:37,39`, `PgColumn` types both) |
| B3 | README calendar currency | **SHIPPED 2026-09-02** (`fa7c940`, the doc audit) — struck through; +0.5 recovered |
| Watch | Temporary security overrides | **Edited:** split corrected (twelve security incl. `effect`; `vite` + `fast-uri` non-security; bare keys `sharp` and `effect`) |
| Watch | Maintenance-only (Tier 3 G) | **Edited:** the Renovate decision's audit cost is now 0 (owner-decision rule); the monthly currency sweep is its stated substitute |
| Watch | `ubuntu-latest` → Ubuntu 26 (F7) | **NEW dated item** in MAINTENANCE; one-line pointer in BACKLOG |

**Owner-carry (dated, canonical in MAINTENANCE → Watch → dated takes):**
**Thu 2026-09-24 04:30Z** — CI heartbeat (first that can run green since 09-03).
**2026-09-29T16:19Z** — delete the ten-entry `next@16.3.6` exclude, CI frozen-install
proof; the AVIF-source `/_next/image` drive; `@next/eslint-plugin-next` → 16.3.6
(`tooling/eslint`, its own `pnpm add`); decide rule 6(a)'s worker-boot scoping;
CHANGELOG Security + the MAINTENANCE bullet in the same commit — then the natural point
to cut v1.3.0 (B3 row). **2026-10-01 00:00–04:00Z** — the month-boundary window; a
dispatch inside it is the real proof. **2026-10-19** — Ubuntu 26 rollout begins; decide
pin-or-float before it. **Unscheduled, owner timing** — the better-auth 1.7 migration
(plan first; no advisory).

## Considered & excluded

- **Keeping F1 at a fixed −2 (option (b))** — would leave the currency row unpriced,
  which the skill forbids, and would price an owner decision the repo's own precedent
  prices at zero. Rule stated in F1; the *consequence* is scored instead.
- **Deducting Security for F5** — nothing in the deployed posture moved; the failure is
  a pipeline-response control, priced under Testing & CI with a mitigation row.
- **Deducting Auth for the better-auth 1.7 gap** — no advisory against 1.6.33 (registry
  + GHSA re-checked), plan-gated by decision; same call as 08-19 and 09-01.
- **A backlog row for the 09-29 exclude deletion / AVIF drive / plugin lockstep / rule
  6(a) scoping** — dated-take matter (MAINTENANCE), per the repo's convention; the −0.5
  maps there.
- **A backlog row for `vitest` 5 alone** — half (ii) of the currency row; a lone major
  with no advisory is a triage decision inside the cadence, not its own row.
- **A backlog row for the Ubuntu 26 pin** — a dated owner decision (pin vs. float);
  Watch item with a removal condition, not a build row until decided.
- **Pricing R1 at −1** — a narrow path (bounded series + RDATE past end + edit-this)
  against a nine-item batch priced at −2.5; −0.5 + R2's −0.5 is proportionate
  (contrarian #6).
- **Scoring the three e2e-lane reds on new-spec pushes** — same-day fixes, state-at-HEAD
  grading (INFO above). The counter arithmetic is recorded honestly (11, not 20).
- **Scoring `<Table>`'s universal tab stop as an a11y regression** — it is the
  shadcn-documented remedy and axe is satisfied; the deduction is for the untranslatable
  label, with the overflow-gated `tabIndex` as an optional refinement in the same row.
- **Scoring R7 (restated predicates)** — the plan stated the limitation before building;
  scoring it now would grade the plan's honesty as a defect.
- **Re-diagnosing Mend's npm-manager stall** — explicitly out of scope by the 09-03
  decision; the cadence row is the substitute.
- **Certifying either standing e2e flake closed** — counter at 11 of 20.
- **Fixing R8's `renovate.yml` leftovers in this pass** — workflow file, template
  surface, contrarian-gated; audit output is docs only. Rider recorded.
- **Restamping the showcase (seventeen passes / 99.3)** — `/doc-audit` hunt #6 owns it.
- **Carried unchanged from 09-01**: Phase 6 Band 2 (owner-gated); guest reminders +
  inbound iTIP (owner-closed extension points); `main` branch protection (owner
  decision, 404 re-confirmed, ruleset present); knip's cosmetic `packages/ui` hooks
  entry hint; the parked wrapper branch; `dependabot_security_updates: disabled`
  (deliberate); the Dockerfile's unpinned `apk upgrade` (deliberate).

## Prioritization

Dated items lead; the band order is unchanged (B1 > B2 > B3):

1. **R1/R2 — `updateOccurrence` membership (B2, S)** — a user-visible regression the
   window introduced; test-backed, one function, ships before the next calendar row.
2. **2026-09-29T16:19Z — the 16.3.6 close-out batch** (exclude deletion + AVIF drive +
   plugin lockstep + rule 6(a) scoping; mechanical; then cut v1.3.0).
3. **Currency sweep, first instance (B2)** — half (i) as one contrarian-gated S–M
   commit; half (ii) one triage decision at a time, `vitest` 5 first. The tree's
   freshness is what every generated project starts from.
4. **Kit 0.23.22 (B3, S)** — this skill's own dead step is among the fixes; template
   surface, tagged worktree, contrarian + sign-off.
5. **B3 polish, breadth first:** triage-issue age escalation (F5, ships downstream) →
   no-retry-on-4xx + loading skeleton (R3) → `<Table>` label (R4) → the two pins (R5)
   → the five-site Compiler decision + `as any` ×3 → deck → invitee signal → avatar
   readying → `select`/`form` stories → context-doc splits.
6. **Before 2026-10-19** — the Ubuntu 26 pin-or-float decision (F7).

Within B2 the order is R1/R2 → currency sweep → localized reminders; Phase 6 Band 2
stays owner-gated.

## Contrarian disposition

Run on this file **before any row was seeded**, with the primary sources (not a
summary): `calendar.ts:420-460,1296-1345,1905-1925`, `occurrences.ts:200-300`,
`calendar.test.ts:1575`, `calendar-workspace.tsx:81-90,250-276`, `query-client.ts`,
`calendar-range-error.spec.ts:21-29`, `table.tsx`, `es.json`, `ci.yml:355-440`,
`docker/Dockerfile:43,95,130`, `next.config.ts:25-26`, `packages/*/src` (the worker
bundle), MAINTENANCE/STACK/BACKLOG/README at the cited lines, the 09-01 report and
CLAUDE.md/AGENTS.md. It reproduced R1 end-to-end from the composer through the router
fallback to the refusing line itself, widened F4's grep to the whole worker bundle, and
found the `enabled`-gate trap in R3's proposed fix — none of which the draft held.
Verdict: **Sound with caveats**.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Major | Headline/prose arithmetic contradicted the table ("5.5 recovered, 4.5 new"; "4.5 calendar points") — the table's deltas summed to +4, calendar recovered 3.5 | **Folded** — prose rewritten from the table; after #4 and #5/#6 the totals are 10.5 recovered / 5.5 new / net +5 → 99.5, stated in the overall row |
| 2 | Major | F4 overclaimed "PROVEN by CI": rule 6(a) asks for `docker run` on both targets; CI boots web only, the worker step is build-only; the worker half is discharged by inspection across the whole bundle (`packages/{db,email,jobs,calendar,validators}/src`), not just `packages/jobs/src`; the tree briefly held both "not done" and "proved it" | **Folded** — F4, the gates row and the MAINTENANCE bullet all say web-by-CI / worker-by-inspection; rule 6(a)'s scoping is a rider on the 09-29 batch |
| 3 | Major | R3's fix shape had a bug: `rangeQuery` is `enabled`-gated, and a disabled v5 query is `isPending` forever — an `isPending` skeleton hides the grid whenever every calendar is hidden; the no-retry predicate is safe client-wide and should cover all 4xx | **Folded** — `isLoading`/`fetchStatus` in R3 and the row; predicate widened to every 4xx tRPC code; State & data fetching's row 7 names the latent default |
| 4 | Major | F1's two-halves split re-priced a deduction the 09-01 pass said it would not re-price, and a permanent −1 for an owner decision contradicts the TS7 / branch-protection precedent | **Folded, option (a)** — the fixed price is retired to Watch at 0 under the stated owner-decision rule; the stale tree is a new −1 on its merits; Monorepo 98.5 |
| 5 | Minor | F5 as INFO changes nothing: two doc-audit sessions skipped the runbook's control, and the issue/daily-comment mechanism ships downstream and failed to reach an owner — inherited, not owner-only | **Folded** — −0.5 Testing & CI with a mitigation row (age-escalating retitle + `::error::` + threshold mention in `security-triage-issue.sh`) |
| 6 | Minor | R1 verified from the UI path by the contrarian itself; the plan item is 4, not 6; a single-instant expansion accepts EXDATE'd dates; `deleteEvent` "this" unaffected; −1 is steep for the narrow scenario | **Folded** — item number corrected; EXDATE decision and delete-this note added to R1/R2 and the row; R1 re-priced −0.5 (R1 + R2 = −1, one row) |
| 7 | Minor | R2's "the comment is false" overstated — the comment and test say "bounds" honestly; the overclaim is the phantom-chip framing; and the closure claim lives in `CHANGELOG.md:175`, not `api.md` | **Folded** — R2 reworded; attribution corrected |
| 8 | Minor | R8's `renovate.yml` refs were wrong (`:149`/`:134-137` in a 73-line file → `:67`/`:52-54`); the Docker job is `ci.yml:358-438` | **Folded** — refs corrected before the sweep's tally could grow |
| 9 | Minor | The currency row was the wrong shape (six config-risk majors bundled with 40+ in-range bumps as one M), cited the wrong contrarian trigger (bump size, not CLAUDE.md's path set), and a one-off batch papers over the 09-03 decision unless it becomes a cadence | **Folded** — split into (i) in-range + exact-pins (S–M, one contrarian pass on the path-set trigger) and (ii) per-major triage; a dated monthly cadence recorded in MAINTENANCE with the B2 row as its first instance |
| 10 | Info | R4, R5, R6, the override split, the exclude block and STACK `:30` verified clean | **Carried** |
| 11 | Info | Nothing material missed beyond #2's scope; state the git/gh-unverifiable items as such | **Folded** — the method note says which figures are main-loop-verified only |

None overruled. The pre-fold draft carried a headline that did not match its own table,
an F4 that promised a proof CI does not run for the worker, an R3 fix that would have
blanked the grid on a different path, and an F1 that changed its pricing rule without
saying so.
