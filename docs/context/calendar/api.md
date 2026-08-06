# Calendar — reads and writes

Load when adding or changing a calendar endpoint. The domain model (civil vs instant,
the derived-instant guard, the constraints) is
[model.md](model.md); who may do what is [acl.md](acl.md); the guest list, the RSVP rules
and the five notification types are [attendees.md](attendees.md).

Follows the repo-wide split ([API.md](../API.md)): **reads are tRPC procedures**,
**writes are Server Actions**. Nothing calendar-related is public — `/calendar` is in
`PROTECTED_PREFIXES` and `proxy.ts` matches it with `startsWith`.

## The occurrence-identity contract

**`id` is always the series master's id. Never an override's.**

The month grid renders two things as identical chips: **virtual occurrences** (no row, no
id of their own) and **materialised overrides** (a real row with a real id). Both ids are
`uuid`, so nothing in the type system distinguishes them — and `updateEvent(scope: "all")`
handed an override's id would update the override, return `{ data }`, and do nothing the
user asked for.

So the contract is enforced on both sides of the wire:

- `calendar.range` projects `coalesce(recurrence_parent_id, id)` as the item's `id`, and
  carries the occurrence's original civil start as `recurrenceId` (`null` for a one-off).
  An override's own row id is never sent to a client.
- `updateEvent` / `deleteEvent` / `setRecurrenceDate` **reject a target whose
  `recurrence_parent_id` is not NULL**, with a field error on `id` — *whether or not the
  call carries a scope*. The unscoped half is the load-bearing one: it is the only path by
  which an override could be soft-deleted while its master is still live, which is the
  state that leaves the grid painting the occurrences of a deleted series.
- A scope on an event with no `rrule` is a field error on `scope`; a scoped write that
  also changes `calendarId` is a field error on `calendarId` (an override lives in its
  master's calendar by construction, and moving the whole series is correct automatically
  through the composite FK's `ON UPDATE CASCADE`).

The client never needs an override's id, because `calendar.byId` takes `{ id, recurrenceId }`
and resolves the override row itself.

## Writes — `apps/web/src/server/actions/calendar.ts`

`createCalendar` · `updateCalendar` · `deleteCalendar` · `createEvent` · `updateEvent` ·
`deleteEvent` · `setRecurrenceDate` · `respondToEvent`. Every one returns
`ActionResult<T>` and runs the same six steps **in this order** (`respondToEvent` is the
one exception, and step 4 is where it differs — see below; and `deleteCalendar` currently
**skips step 2** — the one write with no limiter, a tracked gap:
[BACKLOG.md → rate-limit completeness](../../BACKLOG.md)):

1. **Session gate** → `{ error: "Unauthorized" }`.
2. **`rateLimit`** per user (10/min for calendars, 20/min for events) → the typed
   too-many-requests error, since a Server Action cannot set a 429 status.
3. **Schema parse** with `@repo/validators/calendar`; failures become a `fieldErrors`
   map via `zodFieldErrors` so the form marks each input.
4. **`getCalendarRole`** authorization.
5. **`deriveEventInstants`** — the only writer of `start_at` / `end_at` /
   `*_offset_minutes` anywhere in the codebase.
6. **Write**, then `revalidatePath`.

The order is load-bearing. Authorizing before parsing would tell a caller sending
garbage whether a calendar id exists; deriving before authorizing would spend zone
maths on a request about to be refused.

### Errors a form can act on

| Failure | Surfaces as |
| --- | --- |
| Zod issue | `fieldErrors[field]`, inline |
| Zone the runtime doesn't know | `fieldErrors.startTzid` / `.endTzid` — checked with `canonicalizeTimeZone`, which the Zod grammar cannot do |
| Impossible civil reading (Feb 30) | `fieldErrors.startWall` / `.endWall` — `parseLocalDateTime` throws; the action attributes it |
| End before start, or a span over 366 days | `fieldErrors.endWall`, compared on **instants** |
| SQLSTATE `23514` / `22023` | One form-level message; logged with the constraint name |

`deriveEventInstants` throws one `RangeError` for four different bad inputs, so the
action pre-checks each input separately to attribute the failure. Drizzle puts the
violated constraint on **`error.cause.constraint`**, not in the message — a
`toThrow(/name/)` assertion would pass for any constraint at all.

### The three scopes

`updateEventSchema` and `deleteEventSchema` carry `scope` and `recurrenceId` as a
**both-or-neither** pair, refused rather than defaulted: a `scope` with no `recurrenceId`
cannot name an occurrence, and a `recurrenceId` with no `scope` doesn't say what to do
with it. Silently defaulting either is how "edit this occurrence" quietly becomes "edit
the whole series".

| Scope | `updateEvent` | `deleteEvent` |
| --- | --- | --- |
| `this` | Upserts an **override row** at `recurrence_id` — the master's `uid` and `calendar_id`, `rrule` NULL, the edited fields. `ON CONFLICT` targets `calendar_events_calendar_id_uid_recurrence_id_key`, which already identifies an override uniquely *because* it carries its master's calendar and uid | Inserts an `exdate` (`ON CONFLICT DO NOTHING`) **and hard-deletes** any override at that `recurrence_id` — the `EXDATE` is the durable record of the skip, so a soft-deleted override beside it would be redundant state that can disagree |
| `thisAndFollowing` | A **real series split**, one transaction: bound the old master, create a new master with a **new `uid`**, re-parent every override and recurrence-date row at or after the cut **and rewrite each re-parented override's `uid`**, recompute both `series_end_at`s | Bound the old master; hard-delete overrides and recurrence-dates at or after the cut |
| `all` (and every **unscoped** write) | Update the master in place. **If the rule, the start wall or either zone changed, drop the overrides and the recurrence-date rows** — their `recurrence_id`s no longer name occurrences that exist. The composer confirms this before submitting | **Soft-delete the master *and* its override rows in one transaction** |

Four rules behind that table are not obvious:

- **The `uid` rewrite on a split is not optional.** Without it every split with an
  override past the cut leaves rows carrying the old master's `uid` under the new master —
  the exact corruption `recurrence.md` leaves writer-enforced, manufactured by our own
  writer, and reported by a detection assertion that reports and never blocks.
- **Split by `COUNT` when the source rule uses `COUNT`, by `UNTIL` otherwise.** Old master
  gets `COUNT=k`, new master `COUNT=n−k`. Translating a `COUNT` split into an `UNTIL`
  would drag the UTC-`UNTIL`-versus-zoned-`DTSTART` question into the commonest edit in
  the product for no benefit.
- **A cut at the series' own first occurrence is not a split — it is `all`.** Taking it
  literally would write `COUNT=0`, a rule `parseRRule` then refuses to read back.
- **`thisAndFollowing` requires a rule.** Turning repetition off from a date onward is a
  deletion, not an edit: doing it as an edit would leave the re-parented overrides
  pointing at a non-recurring parent.

### `respondToEvent`, and the writes that became transactional

`respondToEvent({ eventId, status, comment })` is the one action that **does not** call
`getCalendarRole`. Step 4 is `getEventAccess` + `canRespondToEvent` instead: the attendee
row is the authorization, an invitee is not a member of the organizer's calendar, and a
missing row answers `"Event not found"` like everything else in the file. Rate-limited at
`calendar:event:respond:<userId>`, 20/min. The rules, the claim path and the notification
it emits are in [attendees.md](attendees.md).

**`createEvent`, `updateWholeEvent` and `softDeleteEvent` are now always transactional**,
including the fast paths two of them used to take. An event whose guest list failed to
insert is an event the organizer believes they invited people to, and a title edit that
committed while its cancellations did not is worse than the extra `BEGIN` costs. The
notification rows are built **inside** the transaction and published **after** it commits
— `notify()` runs `pg_notify` on the pooled connection, so a push issued inside the
transaction can beat the row it describes.

The publish is deliberately **outside** the `try`: the write has already committed, and a
publish failure must not be reported to the user as "Failed to update the event."

**The email fan-out sits beside the publish, and outside the transaction for the same
reason** (Phase 4): `enqueue()` is graceful by construction, so a down worker delays an
invitation rather than failing a save, and an invitation whose event is not yet visible is a
link that 404s. Which writer owes which email — and why `updateOccurrence`, `skipOccurrence`
and `setRecurrenceDate` all bump the master's `SEQUENCE` — is in
[invitations.md](invitations.md).

### `respondByToken` — the one action with no session gate

`respondByToken({ handle, status, comment })` lives in its **own file**,
`server/actions/calendar-rsvp.ts`, because every export in `calendar.ts` opens with
`requireSession()` and the one function that must not would read as an oversight beside
them. Its authorization is the RSVP token, read from an httpOnly cookie the `/rsvp/[token]`
route handler exchanged it into — the caller sends only a non-secret handle.

It never stamps `user_id`: a session proves who the caller is, a token proves only that
whoever holds the link was sent it. Rate-limited at `calendar:rsvp:respond:<clientKey>`,
20/min — abuse dampening, not the defence. Every refusal is one sentence at HTTP 200; see
[invitations.md](invitations.md) for why the route must not be an oracle.

### `setRecurrenceDate`

Skip an occurrence (`exdate`) or add one (`rdate`) without editing the series, rate-limited
under `calendar:event:recurrence-date:<userId>`. One `INSERT … ON CONFLICT DO NOTHING`, so
pressing the button twice — or two people pressing it at once — is idempotent rather than a
race. **Only an `RDATE` recomputes `series_end_at`**, and it reads the rows back inside the
same transaction so the row it just wrote is included.

### Three more write rules that are not obvious

- **`uid` and `sequence` are never written by `updateEvent`.** The UID is immutable
  (Phase 6 subscribers identify an event by it — changing it reads as
  delete-and-recreate), and `SEQUENCE` is bumped only on a *significant* change, which
  Phase 4 defines. Bumping it on a description edit would re-prompt every attendee. The
  one place a `uid` is written to an existing row is the split above, explicitly.
- **`deleteEvent` stamps `deleted_at` and nothing else.** It deliberately does not set
  `status = 'cancelled'`: deletion is one fact in one column, Phase 4 derives
  `STATUS:CANCELLED` from it at emission time, and the Phase-6 upsert resurrects
  soft-deleted rows — at which point an overwritten status would be unrecoverable.
- **The `rrule` string is stored canonical** (`formatRRule(parseRRule(input))`), so two
  users building the same recurrence through the UI get byte-identical rows, the split can
  compare rules as text, and Phase 6's ICS upsert can too. A rule the grammar refuses comes
  back as `fieldErrors.rrule`, carrying `parseRRule`'s message, which names the offending
  part.

`deleteCalendar`, by contrast, is a **hard** delete. Events cascade. A soft-deleted
calendar would leave its events reachable by id while invisible in every list, which is
a worse state than gone; and nobody subscribes to a calendar that no longer exists.

## Reads — `apps/web/src/server/trpc/routers/calendar.ts`

All four are `userRateLimitedProcedure`: authenticated, but a window query over twenty
calendars is expensive enough to want a per-account bucket rather than a per-IP one. Each
procedure gets its **own** 20/min per-user bucket — the limiter key includes the procedure
path (`trpc:${path}:user:${id}`), so driving `range` hard cannot starve `list`; a spec
that loops a single procedure (24 month-arrow presses in a minute) still trips that
procedure's bucket and must say so.

| Procedure | Reads | Notes |
| --- | --- | --- |
| `calendar.list` | `calendars` | Owner-scoped, primary first. Phase 6 widens the scope behind `lib/calendar-acl`. |
| `calendar.range` | **`calendar_events` directly** (three queries) | The documented exception — see below. |
| `calendar.byId` | `calendar_event_masters`, plus the override row when `recurrenceId` is given | The rule. The view already excludes soft-deleted rows and overrides. Authorized by `getEventAccess`, and returns the guest list. |
| `calendar.listInvites` | `calendar_event_attendees` joined to `calendar_event_masters` | Authorized by the **attendee row**, keyset-paginated on `(start_at, id)`. |

### `calendar.byId` and the two `select()`s

`byId` answers from **two different sources** — the masters view for a series master or a
one-off, `calendar_events` for a materialised override — and both feed the same consumer
through `event: override ?? master`. Each has an **explicit column list**, and the two
lists are key-checked against each other with `satisfies`, so adding a column to one and
not the other stops the file compiling. Narrowing one alone would hand the same consumer
two different shapes depending on which occurrence was clicked.

What the narrowing is *for* is `calendars.user_id`. From Phase 3 an attendee can read this
procedure, and the bare `select()` it used to run would have handed every invitee the
organizer's internal user id.

The attendee list it returns is **emails only** — a resolved `user_id` changes storage and
nothing on screen. Storing whatever address was typed and rendering it back keeps a
matched and an unmatched invitee visually identical at invite time. That protection is
real but partial, and [SECURITY.md](../SECURITY.md) states the residual limit rather than
claiming it away.

### `calendar.listInvites` — and where invitations do *not* appear

> **Through Phase 3, an invitation appears as a list at `/calendar/invites` and does not
> appear as a row on the invitee's month grid.** `calendar.range` scopes to
> `calendars.user_id = me` (below), and widening it would mean a fourth query on the
> feature's hottest path, its own recurrence expansion and suppression handling, and a
> share of `MAX_RANGE_ROWS`.
>
> ⚠️ **These are two changes, not one, and this file used to say otherwise.** Sharing
> changes *which calendar ids* feed the existing three queries — same shapes, same
> indexes, longer `IN` list. The fold is a **fourth query from a different source**
> (`calendar_event_attendees`, for events on calendars the invitee has no role on at all).
> They touch the same procedure and share no work beyond the file. Phase 6 owes both; it
> does not get the second free with the first.

It cannot reuse `byId`'s join, because an owner-scoped join *is* an authorization and an
invitee is not the owner. It scopes on the attendee rows themselves —
`user_id = :me OR (email = lower(:myEmail) AND :myEmailIsVerified)` — with both inputs read
from Postgres rather than off the session, and `lower()` on the **parameter** so
`calendar_event_attendees_email_idx` stays usable. The claim path and the reason
`emailVerified` is not optional are in [attendees.md](attendees.md).

The cursor's `id` is validated as a `uuid` **at the Zod boundary**: `calendar_events.id` is
a uuid column, so a hand-crafted cursor would otherwise reach `id > $1` and make Postgres
throw — a 500 carrying the query text where a 400 is the honest answer.

### `calendar.range`

Caps, all enforced in the schema so a hostile caller cannot widen them: **≤20
calendars**, a **≤400-day** window, and a hard **2,000-row** limit
(`MAX_RANGE_ROWS`), plus **≤200 series expanded per request** (`MAX_RANGE_SERIES`).

**Three queries, each on its own index:**

1. **Concrete rows**, on `calendar_events_concrete_idx` — the raw table with
   `rrule IS NULL AND deleted_at IS NULL` spelled out. It now legitimately returns
   per-occurrence overrides, which is the second half of why this query could never read
   through `calendar_event_masters`.
2. **Series masters**, on `calendar_events_recurring_idx` — plus their
   `calendar_recurrence_dates` rows, partitioned exhaustively by `kind`.
3. **The suppression scan**, on `calendar_events_override_idx`: which occurrences of
   those masters already have an override row, so expansion does not paint them twice.
   **No `calendar_id` predicate** (measured: +42% index size for noise, and the
   composite FK makes it redundant) and **no `deleted_at` predicate either** — a
   soft-deleted override still means *this occurrence is not a plain occurrence*, so
   filtering it would resurrect the base occurrence at its original time.

   Its bounds are the window read as UTC civil, `+1 day` at the top and
   **`−(MAX_SPAN_SLACK_DAYS + 1)` at the bottom** — the same slack the window's own
   redundant lower bound carries, and they share the constant. A day was right while
   expansion selected by start; it stopped being right when expansion moved to
   `overlaps`, because that emits occurrences whose `recurrence_id` precedes `from` by up
   to a maximum span. **Miss one of those and the user sees the occurrence they moved,
   still sitting in the slot they moved it out of** — the override paints at its new time
   through branch A while the base occurrence paints at its old one.

**Expansion runs in `match: "overlaps"`, and it did not always.** Branch A selects concrete
rows by overlap (`start_at <= to AND end_at >= from`) and branch B selects *masters* by
`series_end_at >= from`, but expansion selected occurrences by their **start** instant — the
one layer of three that disagreed. A recurring occurrence that began before the window and
was still running when it opened therefore vanished, while a byte-identical one-off in the
same slot rendered. The month grid's ±1 day of padding hid it for short events, so what
reached a user was the multi-day case: a recurring conference missing from a month it
genuinely overlaps. Fixed 2026-08-02 — selection and suppression; the *seek* still
assumed selection-by-start and starved the accept of straddlers more than one period
out, so spans over ~2 periods kept vanishing until the generation half landed
2026-08-06 (audit F7 — `expandSeries` now passes `seekBackDays`, the master's whole-day
span plus zone slack). The mode is opt-in because `limit` counts what expansion
*returns* ([reminders.md](reminders.md) — the sweeper keeps the default).

Expansion runs in the app, then **concrete and expanded rows merge into one time-ordered
stream and the first `MAX_RANGE_ROWS` are returned.** Merged, not concatenated: if the
concrete branch could consume the cap alone, a tenant with 2,000 one-off events in a month
would get zero occurrences from every series — including the daily standup they opened the
grid to see. That truncation is *category*-shaped, which is strictly worse than the
tail-shaped one the banner copy was written for.

The response distinguishes **`truncated`** from **`seriesTruncated`**, and the UI renders
them as two different sentences, because "some events are hidden" and "some repeating
events are hidden" are different problems to the reader.

A master whose rule no longer parses is **logged and skipped**, not thrown: one unreadable
rule is one series missing from the grid, not a 500 for the whole month.

An `EXPLAIN (FORMAT JSON)` assertion in `packages/db/__tests__/integration/` pins the index
choice for the concrete branch and the suppression scan, because nothing else catches a
regression here before it is wrong as well as slow.

The window also carries a redundant lower bound, `start_at >= from - 367 days`, which is
what lets Postgres range-scan `start_at` instead of scanning open-ended. **367, not
366**: `calendar_events_span_bounded` measures elapsed time (`end_at - start_at`), so a
366-day span crossing a DST transition is 366 days ± 1 hour, and a 366-day bound would
drop it.

Access is enforced by scoping to calendars the caller owns — one `IN` list against an
indexed `user_id` — rather than by asking the ACL per calendar. An id the caller cannot
see simply contributes nothing.

**That scope is also why an invitation is not on the grid.** An event on someone else's
calendar is not in the `IN` list, so through Phase 3 **invitations appear as a list at
`/calendar/invites` and do not appear as rows on the invitee's month grid** — see
`calendar.listInvites` above. Phase 6 owes the fold as **its own change**, separate from
widening this scope for sharing.

## The client boundary

`monthGridWindowMs` in `apps/web/src/lib/calendar/grid.ts` computes the window, padded a
day either side **in the viewer's zone**: the first cell's midnight in Tokyo is the
previous afternoon in UTC, so naive UTC bounds clip the corners of the grid.

The month view fetches from the client rather than being SSR-seeded, because the month
changes without a navigation. Editing an event loads it through `calendar.byId` rather
than reusing the grid row — `calendar.range` deliberately omits `description` and `url`,
so seeding the composer from a grid row would submit `null` for both and erase them.

Editing an **occurrence** needs both halves, and neither alone is enough:

- `calendar.byId({ id, recurrenceId })` returns the **override row** when one exists, so a
  user who changes only the title of an already-moved occurrence does not silently revert
  its description to the series'. It also always returns `seriesRrule` — the *master's*
  rule, even when the row it answers with is an override whose own `rrule` is NULL by
  constraint — because an editor that seeded its repeat field from the returned row would
  submit "no rule" for a `thisAndFollowing` edit.
- The **chip** supplies the occurrence's own `startWall`/`endWall`. For a materialised
  override the two agree; for a virtual occurrence the chip is the only place those times
  exist at all.

The grid's view type therefore carries a `key` (`id#recurrenceId`) separate from `id`:
`id` is not unique in the list **and must not be**, because every occurrence of a series
answers with its master's id.

**The composer seeds its guest list from `byId` too, and that is not cosmetic.** It posts
the whole list on every save and the action diffs it, so opening an existing event with an
empty guest field and pressing Save would read as "remove everyone" — cancelling the
meeting for every guest on a title change. The list it seeds is always the **series'**,
even when an occurrence was clicked, because overrides inherit attendees rather than
carrying their own.
