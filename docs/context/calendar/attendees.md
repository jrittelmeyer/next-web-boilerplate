# Calendar — attendees and RSVP

> **Reminders share this file's inheritance rule and nothing else about it.** They hang off
> the series master exactly as attendees do (resolve `recurrence_parent_id ?? id`), but they
> are **private to one user** rather than visible to every reader, and Phase 5 writes them
> only for the calendar's owner — a guest gets none until Phase 6. See
> [reminders.md](reminders.md).

Load when touching the guest list, invitations or responses. Who may read or write a
calendar: [acl.md](acl.md). Endpoints: [api.md](api.md). Domain model:
[model.md](model.md). Series, overrides and the three edit scopes:
[recurrence.md](recurrence.md).

> **Status: Phase 4, complete.** The table and its constraints, the guest-list diff,
> `respondToEvent`, `calendar.listInvites` and `/calendar/invites` shipped in Phase 3;
> emailed invitations and the public `/rsvp` page in Phase 4
> ([invitations.md](invitations.md)). Per-occurrence RSVP, guest permissions and invitations
> on the month grid are **Phase 6**.

## The identity is the email

`calendar_event_attendees` stores `email` NOT NULL always, and `user_id` NULL-able with
`ON DELETE SET NULL`. **`unique(event_id, email)` is the real key.**

An invitation names an address. Whether that address happens to have an account here is a
separate and changeable fact, so it is stored separately and may be absent:

- **Phase 4 is purely additive.** An external attendee — someone with no account at all —
  is already just a row with `user_id IS NULL`. Nothing about the table changes when
  emailed invitations arrive.
- **A deleted user degrades into an external attendee** rather than vanishing from a
  guest list the organizer still needs. This is the `post_revisions.author_id` precedent.
- **No `nullsNotDistinct()` is needed**, because `email` is NOT NULL. Keying on `user_id`
  would have needed it, and would still have made two rows for one person legal.
- `event_id` leads the unique, so it also serves the foreign key — the same reason
  `calendar_recurrence_dates` carries no second index despite the "index every FK" rule
  in [`packages/db/AGENTS.md`](../../../packages/db/AGENTS.md).

**`CHECK (email = lower(email))` is not belt-and-braces.** The Zod `.toLowerCase()` on the
composer's path is a UX affordance; Phase 4's ICS import, a seed helper and a support
script all write this column without passing through it, and any of them could otherwise
insert `John@Example.com` beside `john@example.com` — two guest rows, two invitations and
two RSVP states for one person, which the unique cannot catch because to Postgres those
are different strings.

**When comparing this column to `user.email`, put `lower()` on the parameter, not the
column.** `user.email` carries no lowercase constraint of its own (`schema/auth.ts`), so
the comparison needs normalising — but `lower(attendees.email) = …` would make
`calendar_event_attendees_email_idx` unusable, and `attendees.email = lower($param)`
keeps it.

## One attendee list per series: overrides inherit, they never copy

**The rule: every attendee read and write resolves `recurrence_parent_id ?? id` first.**
An override carries no attendee rows of its own.

The alternative — copying the master's list onto an override when it materialises — was
considered and rejected on four counts:

1. **The rows would be unreadable.** Nothing reads attendees by an override id; the detail
   route and `calendar.byId` both read `calendar_event_masters`, which excludes overrides
   by construction.
2. **They would diverge immediately.** RSVP is series-level, so a response updates the
   master's row and every copy freezes at whatever it was copied at.
3. **First materialisation is not detectable.** `updateOccurrence` is a single
   `onConflictDoUpdate`, so a plain `INSERT … SELECT` of attendees would raise `23505` on
   the second edit of the same occurrence and surface as the generic write error.
4. **It destroys a distinction Phase 6 needs.** With inheritance, an attendee row on an
   override means exactly one thing: *someone deliberately set a per-occurrence response.*
   Copying makes organizer-invited and copied-at-materialisation rows indistinguishable —
   `created_at` does not separate them and neither does `responded_at IS NULL`.

**`splitSeries` is the one writer that copies, and it copies verbatim.** The master it
creates is a real, addressable, RSVP-able event with its own id and its own URL, so that
copy is observable and correct. `role`, `status`, `comment` and `responded_at` all carry
over.

> **That debt is PAID (Phase 4), and not by the reset it warned against.** `splitSeries`
> still copies `status` and `responded_at` verbatim; what changed is that the new master now
> carries a **`reask_at`** stamp when the cut moved the time, and staleness is *derived* as
> `responded_at < reask_at`. So the guest's answer and their comment survive, the guest list
> renders "accepted — answered for an earlier version", and a pure title edit still re-asks
> nobody. [invitations.md](invitations.md) has the three-boolean classifier.

## Roles and statuses

`ATTENDEE_ROLES = organizer · required · optional`. `chair` and `resource` are in the ICS
vocabulary and are deliberately absent, for the same reason `visibility: "public"` is
absent from `calendar_events`: a union member no surface can produce or render is a lie in
the schema. A `text` union extends in one line with no `ALTER TYPE` when Phase 6's ICS
import needs them.

`ATTENDEE_STATUSES = needs-action · accepted · declined · tentative` — all four, and every
one is produced by something on day one. The split matters:

| List | Where | Members |
| --- | --- | --- |
| `ATTENDEE_STATUSES` | the column | all four; `needs-action` is the default an invitation starts at |
| `ATTENDEE_RESPONSES` | `@repo/validators/calendar`, the RSVP input | the other three |

**`needs-action` is deliberately not submittable.** No control offers "un-answer", and
`calendar_event_attendees_responded_pair` requires `responded_at IS NULL` exactly when the
status is `needs-action` — so a submitted `needs-action` alongside the `responded_at`
stamp the action writes would raise `23514` and surface as the generic write error.
Narrowing the input makes that path unreachable instead of merely unlikely. The two lists
are asserted exhaustive against each other in `packages/validators/src/calendar.test.ts`,
so a fifth status forces a decision rather than arriving unanswerable.

Both unions are duplicated into `@repo/validators` (which must stay DB-free) and guarded
member-for-member by `apps/web/src/lib/union-parity.test.ts`.

## The two CHECKs

| Constraint | Rejects |
| --- | --- |
| `calendar_event_attendees_email_lower` | `John@Example.com` — see above |
| `calendar_event_attendees_responded_pair` | `(responded_at IS NULL) <> (status = 'needs-action')` |

The `responded_pair` CHECK is **bidirectional**, and that is the point: the one-directional
spelling permits `accepted` with a NULL `responded_at`, which is exactly what a careless
`splitSeries` copy produces.

## The `user_id` index is partial, and that was measured

`calendar_event_attendees_user_id_idx` carries `WHERE user_id IS NOT NULL`. A plain btree
**stores its NULL keys** — the assumption that burned `0021`, where "only overrides are
non-NULL, so the index is the same size" was simply false. Measured on postgres 18 over
10,000 rows:

| Population | plain | partial |
| --- | --- | --- |
| 5,000 resolved / 5,000 external | 248 kB | 216 kB |
| 1,000 resolved / 9,000 external | 120 kB | 56 kB |

Nothing is given up for it: both variants plan `WHERE user_id = $1` as the same
single-search index scan, and the partial index still serves the foreign key's
`ON DELETE SET NULL` scan, whose predicate is never NULL. A "list the external guests"
read is scoped by event and served by the unique.

The 90 %-external row is the population **Phase 4 creates**, since an external attendee is
exactly a NULL `user_id`.

## The diff is by address, and an address in both sets is untouched

`apps/web/src/lib/calendar-attendees.ts` holds `diffAttendees` as a **pure function**, so
the rule that matters most can be proved without a database.

**The composer posts the whole guest list on every save.** So the naive writer — delete
everything, re-insert — silently returns every guest to `needs-action` on a title edit,
and so does an upsert that sets `status` in its conflict branch. The diff buckets by
`email`:

| Bucket | The writer |
| --- | --- |
| `added` | inserts the row, then notifies each resolved account |
| `removed` | deletes the row, then sends each resolved account a cancellation |
| `unchanged` | **touches nothing** — not updated, not re-inserted, not re-notified |

A **role** change on an otherwise-unchanged address lands in `unchanged` too. Phase 3 has
no surface that edits a role, and treating a role edit as remove-then-add would reset that
person's response — the exact bug the diff exists to prevent. Phase 6 gets a role editor
and can add a third bucket.

A duplicate address inside one submission collapses to a single `added` entry rather than
reaching `unique(event_id, email)` as a `23505`.

## Which writers apply a submitted guest list, and which discard it

**Only `createEvent` and `updateWholeEvent`** — that is, a plain save and `scope: "all"`.
The other two recurrence writers ignore `values.attendees`, and neither raises an error
when one is submitted:

| Writer | What happens to a submitted list |
| --- | --- |
| `createEvent` | inserted, invitations published after the commit |
| `updateWholeEvent` (`scope: "all"`, and every unscoped save) | diffed as above |
| `updateOccurrence` (`scope: "this"`) | **discarded.** Overrides inherit; an attendee row on one would mean a per-occurrence response, which Phase 3 does not offer |
| `splitSeries` (`scope: "thisAndFollowing"`) | **discarded.** The new second-half master receives a verbatim `INSERT … SELECT` copy of the *source's* list instead |

Both discards are silent, and that is a stated Phase-3 limitation rather than an
oversight: the alternative in each case is a per-occurrence attendee model
(`updateOccurrence`) or applying an edit to one half of a split and not the other
(`splitSeries`), and both are Phase 6's to decide. The composer's help text says changes
apply to the whole series. `packages/db/__tests__/integration/calendar-attendees.test.ts`
asserts `updateOccurrence` creates no attendee rows **positively**, so a future copy-based
"fix" fails there rather than shipping.

`splitSeries` publishes **no invitations** for its copy — those people are already on the
series, and telling them they were invited to something would be noise.

## RSVP: `respondToEvent`, and the attendee row is the authorization

`respondToEvent({ eventId, status, comment })` is a plain `UPDATE` of the caller's own row,
rate-limited at `calendar:event:respond:<userId>` (20/min). **There is no
`getCalendarRole` call in it and there must not be one:** an invitee is not a member of the
organizer's calendar, and answering a calendar-scoped question about an event-scoped
permission is how "attendance grants write" gets built by accident. `getEventAccess`
([acl.md](acl.md)) answers the narrow question and exposes no role to be tempted by.

A caller who holds no row gets the same `"Event not found"` the rest of the file uses, so
"not invited" and "does not exist" are indistinguishable.

**Series-level in Phase 3.** The response attaches to the master. Per-occurrence RSVP
would require an attendee — who by design has no write access to the organizer's calendar
— to trigger an `INSERT` into `calendar_events` in order to materialise the override the
response would hang off. That is a privilege-escalation shape, not a free feature.

### The claim, and why it is stamped

An invitation addressed to someone who signs up an hour later is found by
`user_id = :me OR (email = lower(:myEmail) AND :myEmailIsVerified)`.

- **The `emailVerified` conjunct is not optional.** Without it, signing up as
  `victim@example.com` and never verifying would expose that person's invitations.
- **The first successful email-arm claim stamps `user_id`, inside the same transaction.**
  Without the stamp that arm never becomes durable: someone invited before signing up
  claims by verified email, accepts, later changes address — and the row still reads
  `user_id NULL, email = <old address>`, so an **already-accepted** invitation silently
  disappears from their list. It fails closed, which is exactly why nobody would notice
  it. Stamping converts that arm from a standing authorization path into a one-time
  reconciliation, after which the durable `user_id = me` arm answers forever.
- Both inputs are read **from Postgres, not from the session**. The Better Auth cookie
  cache is up to five minutes stale and `changeEmail` is configured with
  `updateEmailWithoutVerification`, so the snapshot that matters is `(old address,
  verified)` held briefly after someone moves away from an address another person may now
  be able to claim.

## The five notifications, and the slots they fill

Every calendar notification goes through `createNotifications` **inside** the transaction
and `publishNotifications` **after it commits** — `notify()` issues `pg_notify` on the
pooled connection, so a push fired inside the transaction can reach a subscriber before
the row it describes is visible.

| Type | Recipient | Renders | `link` |
| --- | --- | --- | --- |
| `calendar_invite` | each newly added guest | `{body} invited you to {title}` | the event |
| `calendar_response_accepted` / `_declined` / `_tentative` | the calendar's owner | `{body} accepted/declined/may attend {title}` | the event |
| `calendar_cancelled` | each dropped guest, and every guest of a deleted event | `{title} was cancelled` | **`null`** |

`body` is the **actor's email** and `title` is the **event title**, in every one of them —
including `calendar_cancelled`, whose sentence uses only `{title}`. That is not
redundancy: the contract beside `NOTIFICATION_TYPES` reads *`title IS NULL` ⇒ `body` is
already a complete sentence*, and the feed applies it literally, so a cancellation
carrying the title in `body` renders as the bare word "Standup" instead of "Standup was
cancelled". `body` is NOT NULL, so it needs a real value either way.

`calendar_cancelled` carries `link: null` because its event is soft-deleted or the reader
is off its guest list — `calendar_event_masters` excludes the first and `getEventAccess`
refuses the second, so any link would 404 on click.

**Only a resolved account receives an in-app notification.** An external attendee is a real
row with a real invitation, and Phase 4 reaches them by email
([invitations.md](invitations.md)) — the in-app feed and the email fan-out are separate
paths, published and enqueued respectively, both strictly after the commit.

**The response type splits three ways rather than carrying a status field.** A one-slot
notification cannot express "Alice declined Standup" — two variables *and* a status — and
`RESPONSE_TYPES` is `satisfies Record<AttendeeResponse, …>`, so a fourth submittable
answer stops the file compiling instead of silently rendering nothing.

## Where an invitation is visible — and where it is not

**`/calendar/invites`, and nowhere else, through Phase 3.** `calendar.range` scopes the
month grid to `calendars.user_id = me`; widening it would mean a fourth query on the
hottest path in the feature, its own recurrence expansion and suppression handling, and a
share of `MAX_RANGE_ROWS`. Phase 6 owes the fold — **and owes it as its own change**,
separate from widening that query for shares (that one only lengthens the `IN` list; the
fold adds a fourth query from a different source). ⚠️ **This route is transitional by
design and the fold retires it**, which is also why `calendar.listInvites` carries no time
filter — so the fold is a scheduling commitment, not a nice-to-have.

The list is its own route rather than a panel beside the grid for a plainer reason:
"Invitations: Standup" next to a month that does not contain Standup reads as a bug, not
as a phase boundary.

`calendar.listInvites` is keyset-paginated on `(start_at, id)` ascending, reads through
`calendar_event_masters` (which excludes soft-deleted events and overrides for free), and
carries **no time filter** — an invitation is listed in the order it happens, rather than
having its contents depend on the request clock.
