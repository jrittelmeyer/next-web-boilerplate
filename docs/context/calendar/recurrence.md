# Calendar — recurrence

Load when working on repeating events: the `RRULE` grammar, expansion, per-occurrence
overrides, or the edit and delete scopes. The time model underneath it all is
[model.md](model.md); leaf rules are in
[`packages/calendar/AGENTS.md`](../../../packages/calendar/AGENTS.md) and
[`packages/db/AGENTS.md`](../../../packages/db/AGENTS.md).

> **Status:** Phase 2 is complete — schema (`0021`), the engine (`rrule.ts`, `expand.ts`,
> `occurrences.ts`), the scoped actions, the expanded month grid and the builder UI.
> Attendees on overrides are Phase 3 and ICS import is Phase 6.

## The grammar we support, and the parts we refuse

`FREQ` ∈ `DAILY` | `WEEKLY` | `MONTHLY` | `YEARLY`, plus `INTERVAL`, `COUNT`, `UNTIL`,
`WKST`, `BYMONTH`, `BYMONTHDAY` (negatives included), `BYDAY` (ordinals included, e.g.
`-1FR`) and `BYSETPOS`. One caveat inside that grammar (audit 2026-08-04, a B3 row in
[BACKLOG.md](../../BACKLOG.md)): `DAILY`+`BYMONTHDAY` is **refused** (loudly — though the
refusal's RFC attribution is wrong; the combination is valid). `YEARLY;BYMONTHDAY`
*without* `BYMONTH` expands the day in **every** month — RFC semantics, fixed 2026-08-06
(audit F8), and the frozen corpus samples the unpaired family since the same change.

**Refused, explicitly, rather than silently mis-expanded:** `BYWEEKNO`, `BYYEARDAY`,
`BYHOUR` / `BYMINUTE` / `BYSECOND`, sub-daily `FREQ`, `EXRULE`, RFC 7529 `RSCALE`.
Dropping an unsupported part would render *wrong* dates, which is worse than rendering
fewer. `parseRRule` throws; on ICS import (Phase 6) the rule is parked verbatim and the
event imports as non-recurring, with the import report saying so.

**The grammar has exactly one owner: `packages/calendar/src/rrule.ts`.**
`@repo/validators/calendar` constrains only the *shape* of the string — the same split
`localDateTimeSchema` and `parseLocalDateTime` already use, where Zod rejects what a form
can show a message for and `@repo/calendar` owns what is actually true. Two RFC 5545
parsers in two packages would be two answers.

`parseRRule` is strict on purpose, because the obvious reference implementation is not.
Measured against `rrule@2.8.1`, all of these are **accepted** by it: a rule with no
`FREQ`; `COUNT` and `UNTIL` together (RFC 5545 forbids it); `INTERVAL=0`; and `COUNT=-1`,
which yields 416,011 occurrences. Ours rejects each with a distinguishable error, and
`MAX_RECURRENCE_COUNT` (1000) bounds `COUNT` because `series_end_at` is computed by
expanding to it.

## Expansion is civil arithmetic

Occurrences are generated in **civil** space — `civil.ts`, no zones — and each one
resolves its own instant afterwards through `deriveEventInstants`. That is the entire
reason a 09:00 weekly meeting reads 09:00 on both sides of a DST transition rather than
drifting an hour. An expander working in instants reports a uniform 7 days between
occurrences and is silently wrong twice a year.

Order of operations, and it matters:

1. Expand the `RRULE`. **`COUNT` is consumed here**, before any exclusion.
2. Union the `RDATE`s.
3. Subtract the `EXDATE`s.
4. Subtract every occurrence that already has an override row — those arrive as real
   rows from the concrete branch of the range query, so emitting them here would paint
   them twice.

Step 1 before step 3 is not an implementation detail: **an `EXDATE`d occurrence consumes
`COUNT`.** `COUNT=5` with one `EXDATE` yields four occurrences, not five. RFC 5545 says
so and most implementations get it wrong.

Expansion is **always window-bounded**. Rules with `COUNT` iterate from `DTSTART` because
`COUNT` is positional and no seek preserves it; every other rule seeks arithmetically to
the first period overlapping the window, because the period grid is anchored at `DTSTART`.
Under `match: "overlaps"` the seek reaches back a full occurrence span plus zone slack
(`seekBackDays`) — the accept predicate can only judge occurrences generation produced,
and a seek sized for selection-by-start starved it of every straddler more than one
period out (audit F7, fixed 2026-08-06).

### An occurrence's end is the master's end shifted by whole days

```
dayDelta = toDayNumber(occurrenceStart) - toDayNumber(masterStart)
endWall  = addCivilDays(masterEndCivil, dayDelta)
```

Not `civilDiffMinutes`. Every supported occurrence differs from `DTSTART` by a whole
number of days at the same wall time (we support no `BYHOUR`), so the shift is exact —
and it is the only formulation that survives **independent start and end zones**. A
flight that departs 09:00 New York and arrives 11:30 Los Angeles has no meaningful
"duration in wall minutes"; the two formulations agree whenever the zones match.

## `series_end_at` may over-estimate. It must never under-estimate.

The range query uses it to *exclude* masters, so the error directions are not
symmetric: over-estimating costs a wasted expansion, under-estimating makes an entire
series vanish from the grid.

It is computed **from the `RRULE` alone and is deliberately blind to `EXDATE`s**, so it
is a permanent over-estimate. (Not "an `EXDATE` can only shorten it" — removing an
`EXDATE` shortens nothing, and a maintainer who believed that reasoning would
"optimise" `series_end_at` to track a trailing `EXDATE` and break the invariant.)

- Unbounded → `NULL`.
- `UNTIL` → `UNTIL` plus the nominal span; no expansion needed. ⚠️ Not quite an
  over-estimate in one case: a final occurrence *straddling a fall-back transition* is
  up to the transition delta longer than its nominal span, so the true end can exceed
  `series_end_at` by ~1 h (audit 2026-08-04; fix rides the long-tail B3 row in
  [BACKLOG.md](../../BACKLOG.md)).
- `COUNT` → expand to the count, take the last end. ⚠️ A value stored **before
  2026-08-06** for a `COUNT`ed `YEARLY;BYMONTHDAY`-without-`BYMONTH` series is a
  permanent over-estimate: the F8 fix consumes `COUNT` monthly rather than yearly, so
  the corrected series ends far earlier than the stored instant says. The safe
  direction — this column only *excludes* — so it is not backfilled, the same
  no-backfill posture as the pre-F6 attendee stamps.
- **Only an `RDATE` past the rule's own end invalidates it.** `EXDATE` writes never
  recompute.

## Overrides are child rows

A per-occurrence override is a full `calendar_events` row: `recurrence_parent_id` points
at the master, `recurrence_id` is the occurrence's **original** civil start — never the
moved-to time — and `rrule` is NULL. It carries the master's `uid` and lives in the
master's calendar. Because it is an ordinary row, a moved occurrence is found by the same
range scan as anything else, and Phase 3's per-occurrence RSVP needs no extra schema.

Three integrity rules, and only one of them is enforced by the database:

| Rule | Enforced by |
| --- | --- |
| An override lives in its master's calendar | **`calendar_events_parent_same_calendar`** — a composite FK, with `ON UPDATE CASCADE` so a master that changes calendar takes its overrides with it |
| An override carries its master's `uid` | The writer, plus a detection assertion in the integration suite |
| An override's parent is a recurring event | The writer, plus the same detection assertion |

The last two are cross-row predicates a `CHECK` cannot express. They are **detected and
reported, never blocked** — the same posture `model.md` takes for the derived-instant
residual, and for the same reason: a guard that can make an existing row un-editable is
worse than the drift it prevents.

⚠️ **Soft-deleting a master does not soft-delete its overrides.** An override matches the
concrete branch's `rrule IS NULL AND deleted_at IS NULL` exactly, so the grid would keep
painting the occurrences of a deleted series. The writer must do both in one transaction.
Postgres could enforce this with a trigger and deliberately does not: the schema here
enforces *invariants*, not *behaviour*.

## The three scopes, and the identity contract underneath them

The full table of what each scope writes is in [api.md → The three scopes](api.md); the
part that belongs here is *why the contract exists at all*.

The grid renders a virtual occurrence and a materialised override as **identical chips**.
That is the point — a moved occurrence should look like an occurrence, not like a
different kind of thing. It is also what makes an id ambiguous, because both are `uuid`.
So: **`id` is always the series master's**, `recurrenceId` names the occurrence, and the
action resolves the override row itself. A write whose target is an override is refused
*whether or not it carries a scope*, and the unscoped half is what stops an override being
soft-deleted while its master is live — the state the warning above describes, closed at
the writer rather than papered over in the query.

Two consequences worth stating separately:

- **The suppression query carries no `deleted_at` predicate**, deliberately. A
  soft-deleted override still means *this occurrence is not a plain occurrence*, so
  filtering it would resurrect the base occurrence at its original time — the opposite of
  what the user asked for. The writer contract is what guarantees that state never exists.
- **`scope: "all"` that moves the series drops the overrides and the skipped dates.** The
  rule, the start wall and the two zones are what generate occurrence identities; change
  any of them and every stored `recurrence_id` names an occurrence that no longer exists.
  Correct, and destructive, so the composer says so before submitting.

## Reading `calendar_recurrence_dates`

`EXDATE` and `RDATE` are rows, not a jsonb array. The deciding argument is concurrency:
as an array element, "skip this occurrence" is read-modify-write, so two users skipping
two different occurrences in the same second silently resurrect one. As a row it is
`INSERT … ON CONFLICT DO NOTHING` — idempotent and race-free — and `RDATE` has no
cancellation equivalent, so the table has to exist regardless.

`date_wall` lives in the same space as `recurrence_id`: the occurrence's original civil
start, read in the master's `start_tzid`. An `RDATE` carries no duration; the added
occurrence takes the master's nominal span.

⚠️ **Partition these rows by `kind`. Never filter with `WHERE kind = 'exdate'`.** There
is no CHECK on the column — `status`, `visibility` and `transparency` carry none either —
so an unrecognised value is possible, and a filter would drop it silently: the user's
skip would quietly do nothing, forever, while the unique constraint happily accepted the
row. That is the shape that drops notifications today (`notification-bus.ts` `safeParse`s
and fails closed with no log). The lesson from `NOTIFICATION_TYPES` is about the
**reader**; the union-parity test alone does not carry it.

## The engine swap window is closed

`packages/calendar/AGENTS.md` has carried a note that the recurrence engine is only
swappable until the first `recurrence_id` row exists, because `recurrence_id` is
*produced by the engine* — a different engine computing one occurrence differently
orphans its override. **Phase 2 writes those rows, so that option is now spent.** The
package boundary is a code seam, not a data seam; swapping engines from here costs a data
migration.
