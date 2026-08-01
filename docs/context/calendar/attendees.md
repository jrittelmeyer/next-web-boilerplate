# Calendar — attendees and RSVP

Load when touching the guest list, invitations or responses. Who may read or write a
calendar: [acl.md](acl.md). Endpoints: [api.md](api.md). Domain model:
[model.md](model.md). Series, overrides and the three edit scopes:
[recurrence.md](recurrence.md).

> **Status: Phase 3, schema half.** This file lands with
> `packages/db/src/schema/calendar-attendees.ts` and documents the table and the rules
> the writers must honour. The writers themselves — `respondToEvent`, the guest-list
> diff, `/calendar/invites` — arrive in the same PR's second commit and are documented in
> [api.md](api.md).

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

> **The debt that creates, stated rather than hidden:** a "this and following" edit that
> moves the time leaves everyone still `accepted` for a meeting whose time changed.
> Resetting them instead would pre-decide Phase 4's significant-change rules from inside
> Phase 3, and would also re-ask every guest after a pure title edit. **Phase 4 owns
> re-asking.**

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
