# Project Audit — 2026-08-06 (fourteenth scoring pass)

> The `/project-audit` skill's fourteenth run, two days after the thirteenth
> ([PROJECT_AUDIT_2026-08-04.md](PROJECT_AUDIT_2026-08-04.md), **98.6/100**).
>
> **Method — git-bounded, one adversarial review agent + live surface.** The
> thirteenth pass scored `main`-plus-PR-#38 at `ba1dd68`; HEAD this pass is
> `f9626b6`. The delta is **45 files, +2,236/−295** — the 08-04 merge queue
> landing (#37 · #40 · #42 + advisory batch #5), the five audit-fix commits
> (08-04's F4–F8, shipped 2026-08-05 → 06), the on-schedule
> `brace-expansion@5.0.9` age-exclude deletion, and two doc audits. Product code
> byte-identical outside that delta carries the prior pass's findings by
> identity. One subagent adversarially reviewed the **entire product-code
> delta** — including, for each fix, whether reverting it would turn any test
> red — and the main loop independently re-verified every fix at its seam
> before scoring. Live surface + registry gates checked 2026-08-06
> ~19:00–20:30 UTC.

## Headline: **99.3/100 — all five calendar fixes verified under adversarial re-review (calendar 85 → 95.5); the live surface is fully green for the first time since 07-29; the one new find is methodological: two of the six fixes have no revert sensor**

The 08-04 pass's entire actionable core is closed and verified: 08-04's F4
(external-guest cancellations), F5 (delete half-pair), F6 (verified-email
seams), F7 (overlaps seek) and F8 (YEARLY;BYMONTHDAY) are each correct at the
exact seam the finding named, the advisory batch is remediated with the
three-route rule followed to the letter, and `main` is green on every axis —
today's scheduled heartbeat and security-audit lanes both ran green unattended.
What the re-review surfaced is one level up from the defects themselves: the
F4 and F6-respond-UPDATE fixes are proven by *restated* SQL in the integration
suite rather than by executing the app's own query, so reverting either
predicate would ship the original defect with an entirely green suite. That
sharpens the existing B2 assertion-sweep row rather than seeding a new one.

## Live-surface results (2026-08-06)

| Check | Result |
| --- | --- |
| Code-scanning alerts (API) | **0 open** |
| Secret-scanning alerts (API) | **0 open** |
| Dependabot alerts (API) | **1 open** — #24, `fast-uri` GHSA-7p8r-x3mc-p8w7: exactly the policy-parked advisory (route (1), dated), promotes to a 3.1.5 override **tomorrow 08-07 ~09:17 UTC** |
| CI on `main` (`f9626b6`) | **Green** (14:39 UTC push run, all lanes), CodeQL green |
| CI Thursday heartbeat (due today) | **Ran 07:11 UTC — green** |
| Daily security-audit lane | **Ran 07:31 UTC — green** (with the park in place; the lane asserts the audit trailer, so this is a real audit, not a skipped one) |
| `security-triage` issue | **None open** |
| Open PRs / untriaged issues | **0 / 0** — the only open issue is #1, Renovate's Dependency Dashboard fixture |
| Pages (Storybook gallery) | **HTTP 200** |
| `renovate/*` branches | **Still zero, ever** — no new Monday window since the 08-04 pass (next: 08-10); F1 carries unchanged |
| `pnpm audit` (local, full + prod) | **Exit 0** — "1 vulnerabilities found / 1 high (1 ignored)" = the fast-uri park, exactly the documented ledger state |
| `pnpm outdated -r` | **49 unique packages** (51 entries on 08-04 — flat; counting method this pass dedupes per-workspace repeats) — F1's compounding cost |
| Community files / on-ramp | Unchanged since the last verified pass (not in the delta); CI badge truthfully green |

## Currency & gates (re-verified this pass)

| Gate | Finding |
| --- | --- |
| TS7 cutover (B4) | `typescript` latest **7.0.2**, next tag `7.1.0-dev` → **7.1 not released; gate stands** |
| `next` 16.3.0 | Published **2026-08-03T20:34:17Z** → admissible **2026-08-10 ~20:34 UTC**; `^16.2.12` is policy-correct today. **New rider found this pass:** 16.3.0 pins `sharp ^0.35.3` and `postcss 8.5.23`, so the take plan should **retire the `sharp: 0.35.3` override** (its removal condition is met by this release) and check the postcss override's natural-resolution half (key inert when both hold). Recorded in MAINTENANCE → dated takes |
| `better-auth` 1.6.26 | **New since the last pass** — published 2026-08-04T21:19Z → ages in **2026-08-11 ~21:20 UTC**. Routine bug-fix release (no advisory; includes an email-OTP enumeration hardening). Installed `^1.6.25` is no longer registry-latest; manual take while Renovate delivery is down. Dated bullet added to MAINTENANCE |
| `fast-uri` 3.1.5 | Published 2026-07-31T09:16:56Z → **admissible tomorrow 08-07 ~09:17 UTC**; promote the override + delete the park in one change (pre-authorized in the batch-#5 plan) |
| `undici` / `socket.io-parser` / `postcss` overrides | Ranged keys verified in place and matching every batch-#5 claim verbatim; `socket.io-parser` 4.2.7 is still registry-latest; undici's latest is now the 8.x line — the ranged key correctly leaves any future 8.x copy alone |
| `brace-expansion@5.0.9` age-exclude | **Deleted on schedule 2026-08-06** — the `minimumReleaseAgeExclude` key is entirely gone (not an empty list); the 5.0.9 override correctly remains; tombstone comment records the exit |
| effect / esbuild-kit overrides | Still required — `uploadthing` 7.7.4 (latest) still exact-pins effect 3.17.7; `drizzle-kit` 0.31.10 (latest) still deps `@esbuild-kit` |

## Fix verification (08-04's F4–F8 — the core of this pass)

Every fix was verified twice: independently by the main loop at the seam, and
by a subagent reviewing the full delta adversarially, including
revert-sensitivity of the new tests.

- **08-04 F4 (external-guest cancellations) — VERIFIED.**
  `apps/web/src/server/actions/calendar.ts:1745` now reads
  `or(isNull(userId), ne(userId, actor.id))`; externals flow into
  `guestEmails` and the cancellation fan-out. A census of every other
  recipient-collection path found them NULL-safe by construction
  (`loadRecipients` selects all rows; `removeAttendees` returns deleted emails
  via `RETURNING`; reminders are per-account by design). The one remaining
  attendee-`userId` inequality in the server tree is a non-nullable-PK
  comparison with no NULL-drop class.
- **08-04 F5 (delete half-pair) — VERIFIED.** `deleteEventSchema` runs the
  identical `scopePairIssues` superRefine as update
  (`packages/validators/src/calendar.ts:433,450,473`); no other schema carries
  the pair; the new validator tests import the real schema and go red on
  revert.
- **08-04 F6 (verified-email seams) — VERIFIED.** Invite-time:
  `resolveAttendeeUserIds` filters `eq(user.emailVerified, true)`
  (`calendar.ts:554`). Respond: the UPDATE's email arm is an `EXISTS` with the
  verified conjunct and correct correlation (`calendar.ts:1583-1588`), bounded
  to one row per event by the `(event_id, email)` unique. A third-seam census
  (ACL read path, `listInvites`, the RSVP token path — which targets by id and
  deliberately never stamps — seed, e2e support) found no unguarded product
  seam. Seam (a) has a real app-path revert sensor (the new e2e asserts
  `{ userId: null }` for an unverified address through the real composer path).
- **08-04 F7 (overlaps seek) — VERIFIED.** Opt-in `seekBackDays`
  (`expand.ts:60-70,327-331`) is computed *inside* `expandSeries` from the
  master's actual civil span plus a 2-day zone slack
  (`occurrences.ts:207-219`) — the app's `match:"overlaps"` call site gets it
  for free and has nothing to forget. COUNT rules never seek, so COUNT
  semantics are undisturbed; `limit` counts accepted occurrences, so
  over-seeking can't evict; the pre-existing override-suppression bounds
  (±368 civil days) already cover newly-reachable straddlers, and a test pins
  that coupling. The new completeness tests assert **exact ordered sets** with
  spans > 2 recurrence periods (daily and weekly), plus an extreme-zone case
  pinning the slack — all red on the pre-fix engine.
- **08-04 F8 (YEARLY;BYMONTHDAY) — VERIFIED.** No-BYMONTH now expands
  `ALL_MONTHS` (`expand.ts:246-254`), with the bare-anniversary fallback
  preserved and BYSETPOS selecting over the year's full candidate set,
  matching the frozen oracle. Corpus +40 → **568** cases, a pure-append diff
  (654 insertions, 0 deletions — the existing 528 entries byte-identical);
  `CORPUS_SHA256` repinned same-commit and **recomputed by the reviewer —
  matches**; the anti-tamper protocol is unweakened. Identity claims check
  out precisely: UNTIL/unbounded rules only gain occurrences; COUNT/BYSETPOS
  set changes are stated, not hidden; stored `series_end_at` staleness is safe
  in both directions (UNTIL is engine-independent; pre-fix COUNT ends are
  permanent over-estimates the range query only excludes on).
- **Batch #5 + exclude deletion — VERIFIED** (see the currency table).
- **e2e signup helper — VERIFIED**, with a precision now recorded in the
  Watch row: both `signUp` and `signIn` route through `settleThenSubmit`,
  which settles, awaits the auth response beside the click, and asserts
  status; the settle wait is a network proxy for hydration, so the window is
  narrowed and made loud, not provably closed.

## Findings (this pass)

- **F1 — Renovate scheduled lane: CARRIED (−2, Monorepo & tooling).** No new
  evidence either way — the next Monday window is 08-10. Zero `renovate/*`
  branches ever; 49 outdated packages; `better-auth` 1.6.26 and the 08-10
  `next` take now both queue behind manual process. The B1 diagnosis/fallback
  row stands unchanged, still first in the dependency lane.
- **F2 — The 08-04 F4 and F6-respond fixes have no revert-sensitive coverage
  (NEW; −0.5 Testing & CI, −0.5 Calendar).** The real-Postgres proofs
  *restate* the fixed predicates rather than execute the app's query (each
  says so in its own comment — the actions live in `apps/web`, a package
  boundary the integration suite doesn't cross); the unit test mocks the
  select; no e2e drives deletion or a co-invitee capture. Reverting
  `calendar.ts:1745` or `:1583-1588` today leaves `pnpm test`, the
  integration suite, and every e2e lane green while shipping the exact
  defects the 08-04 audit found. F5, F6-seam-(a), F7 and F8 are all directly
  revert-sensitive — the gap is specifically these two predicates. This is
  the assertion-blind-spot class one level up (tests that pass for the wrong
  behavior → proofs that survive reversion), and it sharpens the existing B2
  sweep row: cheapest closure is an e2e delete step asserting the enqueued
  cancellation set, or extracting the two predicates into an importable
  module the integration suite executes for real.
- **F3 — kit adapter's `prodVerify.start` still broken: CARRIED (−1,
  Monorepo & tooling).** `.claude/ai-dev-kit.config.json` still encodes the
  `--`-collision form; the B1 kit-side row is open.
- **F4 — README says "calendar" zero times: CARRIED (−1, Docs & DX).**
  Re-verified by grep this pass; the B3 currency row is open (08-04's F9).
- **F5 — Long-tail batch grows two smalls (priced inside the existing −2.5,
  Calendar).** From the re-review: (a) the deleting actor can now email
  *themselves* a cancellation when their own address sits as an unverified
  guest row — the F6-produced `user_id NULL` shape meets 08-04-F4's `isNull`
  arm; reachable only in the mixed unverified-account + configured-email
  state, and it contradicts the code comment "every guest but the person
  doing the deleting". (b) `loadRecipients`' comment claims an
  organizer-exclusion its SELECT doesn't perform (pre-existing; the doc half
  was fixed 08-04, the code comment/filter decision rides the row). Both
  added to the B3 long-tail row.

## Doc drift (found this pass)

Small, and fixed in this audit commit:

- **MAINTENANCE.md was not carrying the dated-takes set PROJECT_STATUS calls
  canonical** — the `next` 16.3.0 date lived only in PROJECT_STATUS. Fixed
  with a "Dated dependency takes" Watch bullet (fast-uri 08-07 pointer ·
  `next` 16.3.0 08-10 **+ the override-retirement rider found this pass** ·
  `better-auth` 1.6.26 08-11).
- **The e2e flake row's "FIXED" needed one sentence of precision** (window
  narrowed and made loud, not provably closed) — added, per the re-review.
- **Showcase stamps** (FEATURES.md, plain-english guide) said
  "98.6 across thirteen passes" — re-stamped to fourteen/99.3 in this commit.

Spot-checks that **passed** (no drift): TESTING/ARCHITECTURE/I18N/STACK now
name the calendar (the 08-06 doc-audit's fixes verified present);
VERIFICATION.md's corrected counts (9 integration files, 29 e2e specs) match
the tree; `api.md`'s per-procedure limiter description matches; the corpus
fixture holds 568 cases; `init-app.mjs`'s retargeted doc-patch needle exists
exactly once in VERIFICATION.md; archive index current; CHANGELOG carries the
F7/F8 entries.

## Score table

| # | Feature group | 08-04 | Now | This pass's basis |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 97 | **97** | F1 carried (−2); F3 kit `prodVerify.start` still broken (−1) |
| 2 | Framework & app architecture | 100 | **100** | Carries by identity |
| 3 | Database | 100 | **100** | Carries; the F6 integration tests exercise the schema's constraints against real PG |
| 4 | Auth & access control | 100 | **100** | Carries; 1.6.26 is a routine dated take (08-11), not a deduction |
| 5 | API layer (tRPC + Actions) | 99 | **99.5** | F5's schema asymmetry closed (+0.5); `deleteCalendar` limiter still missing (−0.5, B2 row) |
| 6 | UI & design system | 99 | **98.5** | Table-container remedy (−0.5) and avatar-readying gating (−0.5) open; **new information, not regression**: the 08-06 doc audit filed the `select`/`form` stories gap — story-less primitives also never enter the visual-baseline set (−0.5, B3 row) |
| 7 | State & data fetching | 100 | **100** | Carries |
| 8 | Forms & validation | 100 | **100** | Carries; the validator fix is scored under API/Calendar |
| 9 | Email | 99 | **99** | Localized reminder emails still open (−1, B2 row) |
| 10 | Payments (Stripe) | 100 | **100** | Byte-identical — carries |
| 11 | File uploads | 100 | **100** | Byte-identical — carries |
| 12 | Search | 100 | **100** | Byte-identical — carries |
| 13 | Background jobs | 100 | **100** | Carries; reminder paths re-checked NULL-safe during the F4 census |
| 14 | Observability | 100 | **100** | Byte-identical — carries |
| 15 | Security | 98 | **100** | Batch #5 fully remediated (+2): overrides verified verbatim, exclude deleted on schedule, ledger enumerated clean (0/0 alerts + the one dated park, promoting tomorrow, pre-authorized), both scheduled lanes green today with the audit trailer asserted. The three-route rule executed exactly as written |
| 16 | Testing & CI | 97 | **98.5** | `main` green + merge queue landed (+1); blind-spot class half-recovered — F5/F6a/F7/F8 have real revert sensors, exact-set completeness tests shipped (+0.5); F2's two revert-insensitive proofs (−0.5) and the still-unexplained `set-active` hang (−1, instrumented, next red is the evidence) |
| 17 | Deployment & ops | 100 | **100** | Heartbeat ran green today unattended |
| 18 | Docs & DX | 97 | **98** | VERIFICATION staleness recovered (fixed 08-04) and #40's residuals landed (+1.5 net); F4 README currency still open (−1); deck calendar gap (−0.5, B3 row); this pass's own drift finds, fixed in-commit, plus the unreleased-milestone backlog the CHANGELOG's header promise creates (−0.5, v1.2.0 B3 row) |
| 19 | Internationalization | 100 | **100** | Carries |
| 20 | Realtime / SSE | 100 | **100** | Carries |
| 21 | Calendar & scheduling | 85 | **95.5** | F4 +3 · F5 +1.5 · F6 +2 · F7 +1.5 · F8 +1.5 recovered and verified; drift bundle recovered (+1, all fixed across the two doc audits and re-verified). Remaining: long-tail batch incl. this pass's two additions (−2.5) · blank-grid 429 (−1) · F2's revert-insensitive proofs (−0.5) · invitee-side signal when email is unconfigured (−0.5, the F6-contrarian B3 row) |
| | **Overall (mean)** | **98.6** | **99.3** | 2086 / 21 |

## Backlog delta

**No new rows.** Every open deduction already has a row. Two rows edited in
[BACKLOG.md](../BACKLOG.md):

| Band | Row | Edit |
| --- | --- | --- |
| B2 | Assertion-blind-spot sweep | Residual sharpened per F2: the two named revert-insensitive predicates (`softDeleteEvent` recipients, `respondToEvent` UPDATE) + the class sweep; cheapest closures named. Rises within B2 — it now protects two shipped HIGH-class fixes |
| B3 | Long-tail correctness batch | +2 smalls per F5: actor-self cancellation in the mixed state (and the contradicted comment) · `loadRecipients` organizer-exclusion comment/filter decision |

**Owner-carry (dated, canonical in MAINTENANCE → Watch → dated takes):**
**2026-08-07 ~09:17 UTC** — fast-uri 3.1.5: promote the override, delete the
park (pre-authorized). **2026-08-10 ~20:34 UTC** — `next` 16.3.0 ages in:
plan → sign-off; **rider: retire the sharp override, check postcss
inertness**. **2026-08-11 ~21:20 UTC** — `better-auth` 1.6.26 (routine).
**Undated** — the Renovate Mend-side diagnosis (B1, owner's half) remains the
standing gate on the whole dependency lane.

## Considered & excluded

- **A runtime guard for the F8 census class** (derived projects scaffolded
  pre-fix whose users minted unpaired `YEARLY;BYMONTHDAY` rules via the raw
  action API): the family is UI-unmintable, this repo's DB censused zero, and
  the behavior change is documented in recurrence.md + CHANGELOG. A
  detector/migration is disproportionate for a starter; recorded, not scored.
- **A positive-hydration-signal rewrite of `settleThenSubmit`**: the fix
  empirically holds (8/8 repro → 0) and a recurrence now fails loudly with a
  trace — the diagnosability machinery exists precisely to catch it. Revisit
  on evidence, not speculation; the Watch row carries the caveat.
- **Scoring Security below 100 for the parked fast-uri HIGH**: the park is
  route (1) of the repo's own written rule, dated, path-analyzed
  (build-tooling only), pre-authorized to promote tomorrow. Competent
  execution of a stated policy is the bar, not the absence of open advisories
  the ecosystem hasn't aged yet.
- **A backlog row for `better-auth` 1.6.26**: routine cadence → dated Watch
  bullet, not a row.
- **Carried from 08-04 unchanged**: Phase 6 Band 2 (owner-gated); guest
  reminders + inbound iTIP (owner-closed extension points); `main` branch
  protection (standing owner decision); styling Uploadthing's `readying`
  button in-place (config-gating row exists).

## Prioritization

Unchanged band order, three dated items lead: **08-07 fast-uri**
(pre-authorized, smallest possible change) → **08-10 `next` 16.3.0** (plan
against live registry state; the override-retirement rider makes it a
two-birds change) → **08-11 better-auth 1.6.26**. Among the B2 band, the
**sharpened assertion-sweep row moves to the front** — it is the only row
whose absence can silently un-fix two shipped HIGH-class corrections; then
blank-grid 429, rate-limit completeness, localized reminders. B3 is polish
(README calendar currency first — it is the public front door). The Renovate
diagnosis row (B1, owner) still precedes everything in the dependency lane.
Band order maps to the backlog doc's B1 > B2 > B3 convention unchanged.
