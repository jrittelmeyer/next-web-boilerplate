# Plan: B3 calendar long-tail correctness batch (9 smalls)

**Status: DRAFT — awaiting sign-off. Not yet built.**

Source: `docs/BACKLOG.md` → B3 "Long-tail correctness batch" row, seeded by
`archive/PROJECT_AUDIT_2026-08-04.md` F10 and `archive/PROJECT_AUDIT_2026-08-06.md`
F5. None of the nine items are user-visible on a standard configured deploy today
(`organizerName` is always null; the UI never emits a DATE-form `UNTIL`; the
self-cancellation case needs a specific mixed unverified+configured state) — this
is a correctness batch, not an incident response.

All nine were re-verified against the current tree this session (not just the
5-week-old audit text) — no drift where the audit's diagnosis no longer matches
the code. Six are genuine "smalls" (bounded diff, existing test file to extend,
no open design question). Three carry an explicit decision the audits themselves
punted on; this plan proposes a default for each and flags the alternative.

## The six straightforward fixes

1. **RFC 6868 param quoting + mailto hygiene** — `packages/calendar/src/ics.ts`
   `organizerProperty`/`textProperty` (~226-239). `CN=` currently runs the TEXT
   escaper (backslash-escapes) on a param-value, which uses a different grammar
   (RFC 5545 §3.2: a value needing `"`, `;`, `,`, or `:` must be
   `DQUOTE`-quoted; RFC 6868 separately caret-encodes only `^`→`^^`, `"`→`^'`,
   and a literal newline→`^n` *inside* that quoted form). `mailto:` addresses
   are emitted with no encoding at all.
   ⚠️ **Revised per contrarian (CONFIRMED):** the quoter must NOT caret-encode
   `;`, `,`, or `:` — RFC 6868 defines no escape for them, and doing so ships a
   new corruption bug in the exact property this item exists to fix (a
   conforming reader decoding `^,` gets undefined behavior). The two rules are
   independent: **(1)** wrap in `"…"` if the value contains `"`, `;`, `,`, or
   `:` (or, after step 2, any caret sequence); **(2)** only `^`, `"`, and
   newline get literally transformed, and only when already inside the quoted
   form. Fix: a new param-value quoter implementing both rules, replacing the
   TEXT escaper for `CN`; percent-encode/validate the mailto address. The
   existing `ics.test.ts` "escaping"/`ORGANIZER` cases pin the *wrong* current
   shape and need rewriting, not just extending — **add a comma/semicolon-in-
   `CN` case whose expected output is quoted but NOT caret-escaped**, so a
   regression here fails loudly rather than shipping behind a rewritten
   assertion (the F4 audit's own failure shape).

2. **DATE-form `UNTIL` zone semantics** — `packages/calendar/src/rrule.ts`
   `untilInstantMs` (~394-407), consumed in `expand.ts` (~321,352) and
   `occurrences.ts`'s `ruleEndInstantMs` (~290-294). The `"date"` branch computes
   UTC end-of-day with no zone, compared against zone-resolved occurrence
   instants — a UTC+ zone can accept an occurrence one calendar day past the
   stated UNTIL. Fix: thread the series' `timeZone` into `untilInstantMs`'s
   `"date"` branch and resolve via `resolveCivil` (next local midnight − 1ms),
   not raw UTC arithmetic — a signature change reaching both call sites.
   Extend `rrule.test.ts`'s existing DATE-kind case with a UTC+ zone, plus an
   `occurrences.test.ts`/expand-level case.

3. **One-off events' RSVP tokens never expire** —
   `apps/web/src/server/calendar/invitations.ts` `loadSeriesForEmail`
   (~170-177) passes `seriesEndAt ?? null` through for every event; `null` is a
   *deliberate* "unbounded recurring series" signal
   (`lib/calendar-tokens.ts:88-92`) but also fires for every ordinary one-off
   event (whose `series_end_at` is always NULL by schema), accidentally minting
   a non-expiring token for something with a perfectly good end time sitting in
   the same row. Fix: when `master.rrule === null` (one-off), fall back to
   `master.endAt` (+ the existing `GRACE_SECONDS`) instead of `null`; only a
   true unbounded series (`rrule !== null && seriesEndAt === null`) keeps
   `exp=0`. Strictly *shortens* an already-issued capability window — no
   backwards-compat concern. New case in `invitations.test.ts` (no direct
   `loadRecipients`/`rsvpUrlFor` coverage exists today per the research pass —
   confirm before writing, in case it's covered elsewhere and just missed).

4. **`updateOccurrence` accepts a non-member `recurrenceId`** —
   `apps/web/src/server/actions/calendar.ts` (~1066-1080 routes to it,
   ~1296-1344 is the function). No validation that the caller-supplied
   `recurrenceId` is an actual generated occurrence of the target's `rrule` —
   an `INSERT ... ON CONFLICT DO UPDATE` accepts anything, creating a "phantom
   chip" never produced by the rule. The sibling `scope: "thisAndFollowing"`
   path (`planSeriesCut`, ~424-458) already does this validation correctly
   (returns a `notInSeries` field error). Fix: extract or reuse that check
   ahead of `updateOccurrence`, same field-error shape. Extend
   `calendar.test.ts`'s `scope: "this"` describe block with a
   not-in-series-recurrenceId case.

5. **`seriesEndInstantMs` fall-back slack + COUNT `truncated` bit** — see
   "Needs a decision" below; the design question is bundled with the fix
   itself here, not a separate policy call the owner needs to make blind.

6. *(folded into 5 above — the audit's "nine smalls" count treats the ICS
   quoting + mailto items as two sub-fixes of #1, which is where the ninth
   count comes from.)*

## Needs a decision (three items — recommending a default for each)

**A. DAILY+BYMONTHDAY refusal — support it, or just fix the false RFC citation?**
`rrule.ts:337-341` refuses `DAILY`+`BYMONTHDAY` citing "RFC 5545 §3.3.10
forbids outright" — but §3.3.10 only forbids `BYMONTHDAY` with `WEEKLY`; DAILY
is legal RFC syntax (expand daily, filter to matching month-days).
`docs/context/calendar/recurrence.md:19-20` already documents the false
attribution candidly. Two ways to close it:
  - **(a) Cheap — recommended.** Split the guard so only WEEKLY cites the RFC;
    refuse DAILY separately with an honest reason ("not supported by this
    engine"), or drop the DAILY half of the message entirely, matching the
    docs. Small diff, one test update.
  - **(b) Real feature.** Actually support it: `expand.ts`'s `"DAILY"` case in
    `periodDays` would need a `byMonthDay` filter added (reusing the existing
    `monthDayNumbers` negative-from-end-of-month helper). This is a genuine
    engine feature addition, gated behind the frozen differential corpus's
    reviewer-approved regen protocol (`packages/calendar/AGENTS.md`) if
    BYMONTHDAY+DAILY becomes a generated family — same weight as the F8 corpus
    change. Real effort, not a "small."
  - **Recommendation: (a).** Nothing in the product today needs DAILY+BYMONTHDAY
    (the composer never offers it); fixing the lie costs a few lines, and (b)
    can be re-filed as its own row on real demand rather than smuggled into a
    "smalls" batch.

**B. Actor-self cancellation in the mixed unverified+configured state — exclude by email, or fix the comment?**
`calendar.ts` `softDeleteEvent`'s guest-selection comment says "every guest but
the person doing the deleting"; the query excludes by `userId`
(`or(isNull(userId), ne(userId, actor.id))`), which is the correct F4 fix for
*resolved* rows — but an unverified self-guest row (F6's `userId: NULL` shape)
slips through, and email-configured deploys would send the deleter a
cancellation about their own action.
  - **(a) Exclude by email too — recommended.** Add an
    `and(ne(calendarEventAttendees.email, actor.email))`-shaped clause
    alongside the existing `userId` exclusion, so the actor is never emailed
    regardless of verification state.
    ⚠️ **Revised per contrarian (CONFIRMED):** must be
    `ne(calendarEventAttendees.email, sql\`lower(${actor.email})\`)`, not a
    bare comparison. `calendar_event_attendees.email` is DB-CHECK-guaranteed
    lowercase (`packages/db/src/schema/calendar-attendees.ts:106`); `user
    .email` (the source of `actor.email`) is only lowercase "in practice" via
    Better Auth's sign-up path, not DB-enforced — and every other same-file
    comparison of these two columns already wraps the user-side value in
    `lower()` (`calendar.ts:1593`, mirrored in `calendar-acl.ts:225` and
    `routers/calendar.ts:701`). Skipping it here would be the one comparison
    site in the batch that silently no-ops for a mixed-case account (OAuth-
    provided email, an admin-seeded account) — shipping a fix that *looks*
    closed while remaining exactly the bug it targets, the same shape as F4/
    F6. **Add a mixed-case-email test case** alongside the existing one.
  - **(b) Leave behavior, fix the comment.** Reword to describe the actual
    guarantee and its one known gap, on the theory that a self-directed
    "you cancelled this" email is harmless.
  - **Recommendation: (a), with the `lower()` correction above.** It's a
    one-clause addition, removes a real (if minor) annoyance, and "the
    deleter gets emailed about their own delete" has no upside worth
    documenting as accepted behavior.

**C. `loadRecipients`'s organizer-exclusion comment vs. its filterless SELECT — fix the comment, or add the filter?**
`invitations.ts:180-187`'s comment claims an organizer exclusion the `WHERE
eventId = masterId`-only SELECT doesn't perform. Docs were already corrected
2026-08-04; only the code comment still lies.
  - **(a) Fix the comment — recommended, pending one verification.** Before
    committing to "the organizer can never be a row here," trace the
    invite-write path (`resolveAttendeeUserIds`/`addAttendees`) to confirm an
    organizer genuinely cannot end up as their own attendee row today. If
    confirmed, reword the comment to state reality ("every attendee row of the
    series — the organizer is not normally a row in this table").
  - **(b) Add the filter.** If the trace turns up a path where the organizer
    *can* become a row (e.g. self-invite), thread the organizer's email into
    `loadRecipients` and exclude it.
  - **Recommendation: (a)**, contingent on the verification step above (build
    this one first in the batch — it's cheap to check and determines which of
    (a)/(b) is even correct).

## `seriesEndInstantMs` fall-back slack + COUNT truncated bit (item 5, detail)

`occurrences.ts` `ruleEndInstantMs` (~283-313) has two distinct sub-bugs under
one invariant ("never under-estimate", ~258-267):
- **UNTIL branch** (290-294): adds the *master's* `spanMs` to
  `untilInstantMs(...)`, but a later occurrence straddling a fall-back
  transition can have a true instant-span up to an hour longer than the
  master's (same wall-clock duration, larger elapsed-ms across the transition)
  — under-estimates, violating the invariant. Fix: add a fixed slack constant
  (reuse or mirror `OVERLAP_SEEK_SLACK_DAYS`'s pattern), sized to the largest
  fall-back in `derive.test.ts`'s DST corpus (Antarctica/Troll, 120 minutes —
  contrarian-verified directly against the fixture file, not just the plan's
  claim).
  ⚠️ **Caveat added per contrarian:** "covers the existing corpus" is a fact
  about the tested fixture set, not a proof about all IANA tzdata this package
  will ever resolve — tzdata is external, versioned data, and a future zone
  change (a one-time dateline-style shift, an untested historical rule) is a
  real class this framing doesn't rule out, on a hard "never under-estimate"
  invariant. Document the constant honestly as "bounded by the largest
  fall-back in the tested corpus, not a guaranteed tzdata ceiling" rather than
  presenting it as provably safe. (A computed-slack alternative — compare the
  occurrence's actual resolved offset against the master's — was considered
  but is a larger change than this batch's scope; leaving as a flagged
  constant, revisit if a real-world under-estimate is ever reported.)
- **COUNT branch** (300-311): reads `expanded.occurrences.at(-1)` without
  checking `expanded.truncated`. A sparse, high-COUNT rule that hits
  `MAX_EXPANSION_PERIODS` (10,000) before generating `count` occurrences
  returns a partial "last" as if it were the real one — can under-estimate (or
  wrongly report "can never occur" if `last` is `undefined`). Fix: check
  `truncated`; if true, don't trust the partial last element — fall back to an
  explicit unbounded-safe sentinel (matching whatever this file's existing
  "genuinely unbounded" return shape is) rather than a wrong finite estimate.

This is the one item that's more than a "small": picking the slack bound and
the truncated-COUNT policy both interact with `series_end_at`'s range-query
optimization, so both choices get written down here rather than left to
implementation-time judgment. **No further owner decision needed** — the slack
size and truncated-fallback shape above are mechanical enough to build directly
once signed off, but flag in review if either constant needs revisiting.

## Build sequencing

One batch, ordered cheapest/most-isolated to most involved (all in
`packages/calendar` or `apps/web/src/server`, no schema/migration, no new
package):

1. Decision C's verification trace (cheap, determines scope) → comment fix.
2. Item 4 (`updateOccurrence` membership check) — pattern already exists to
   copy from the same file.
3. Item 3 (RSVP token expiry for one-off events) — one branch, one file.
4. Decision B (actor-self cancellation exclude-by-email).
5. Decision A(a) (DAILY+BYMONTHDAY honest refusal).
6. Item 2 (DATE-form UNTIL zone semantics) — touches two call sites.
7. Item 5 (`seriesEndInstantMs` slack + truncated handling) — most involved,
   built last so earlier reviewer feedback on style/approach carries forward.
8. Item 1 (RFC 6868 quoting + mailto hygiene) — the most self-contained but
   also the one requiring a genuinely new helper function; independent of
   everything else, could also run first.
   ⚠️ **Narrowed per contrarian:** items 1, 3, 4, and B are independent of
   each other and of 2/5, and can be reordered or grouped freely — but **2 and
   5 must stay in this relative order** (item 5's UNTIL branch in
   `occurrences.ts` calls `untilInstantMs`, whose signature item 2 changes;
   building 5 before 2 lands hits a stale signature). Grouped as roughly 2-4
   commits by file area rather than 8 individual commits, owner's call at
   sign-off, respecting that one ordering constraint.

Full gate (lint/type-check/build) + `packages/calendar`'s + `apps/web`'s test
suites after each commit. No live-verify needed for the pure-function fixes
(1, 2, 5 in `packages/calendar`); items 3/4/B do touch Server Actions and
should get a quick live-verify pass (create a one-off event, check its RSVP
token payload; edit a single occurrence with a tampered recurrenceId via the
UI to confirm the new refusal; soft-delete an event as an unverified self-guest
in a local email-configured run).

## Explicitly out of scope

- DAILY+BYMONTHDAY as a real supported feature (option A(b)) — re-file as its
  own row if real demand appears; this batch takes the honest-refusal fix only.
- Any change to `packages/calendar`'s frozen differential corpus
  (`rrule-corpus.json`) — none of the chosen fixes add a new generated rule
  family, so no regen is needed this pass.

## Contrarian disposition

Full review invoked per CLAUDE.md's "frictionless consensus is the trigger"
clause (this plan came together without friction) and because item 5 touches
the `series_end_at` range-query correctness invariant. Verdict: **Sound with
caveats.** Two findings were CONFIRMED and folded above (not overruled); two
more were noted without changing the plan's shape:

- **[Major, CONFIRMED, folded] Item 1's quoter would caret-encode `;`/`,`/`:`**,
  which RFC 6868 defines no escape for — would have shipped a new corruption
  bug in the property it's fixing. Folded: the quoting/caret-encoding rules
  split into two independent steps, plus a new required test case.
- **[Major, CONFIRMED, folded] Decision B's clause needed `lower()`** on the
  `actor.email` side to match this file's own established comparison
  convention (`calendar.ts:1593` and two other sites) — without it, a
  mixed-case account would silently defeat the fix. Folded: clause spec
  corrected, mixed-case test case added to the item's requirements.
- **[Minor, noted] The 2-hour slack constant is corpus-verified, not tzdata-
  proof** — folded as a documentation requirement (state the bound honestly)
  rather than a design change, since a computed alternative is out of this
  batch's scope.
- **[Minor, noted] The "order isn't load-bearing" claim was too broad** —
  narrowed above to name the one real ordering constraint (2 before 5).
- **Checked, found NOT to hold:** contrarian's own suspicion that item 3
  (RSVP token shortening) might break a persistent webcal-style integration —
  traced `apps/web/src/app/[locale]/rsvp/[token]/route.ts` directly and
  confirmed the token is exchanged for a short-lived cookie on first click,
  never polled long-term. Item 3's "no backwards-compat concern" framing
  holds as originally written.

No further contrarian pass needed before build unless implementation surfaces
a behavior change beyond what's specified above.
