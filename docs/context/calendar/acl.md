# Calendar — access control

Load when touching who may read or write a calendar. Endpoints:
[api.md](api.md). Domain model: [model.md](model.md). The guest list:
[attendees.md](attendees.md).

**Two authorities, in `apps/web/src/lib/calendar-acl.ts`, and the split is the point.**

| Question | Ask | Answers |
| --- | --- | --- |
| *calendar*-scoped — may this person write here, rename this, delete this? | `getCalendarRole(calendarId, userId)` | a role, or `null` |
| *event*-scoped — may this person see this event, and may they RSVP? | `getEventAccess(eventId, userId, target?)` | an opaque `EventAccess` |

Before Phase 3 there was one, and the sentence here read *"every calendar read and write
in `apps/web` asks it and nothing else"*. That stopped being true the moment attendees
existed: an attendee is **not** a member of the calendar an event lives on, so "may this
person see this event" is no longer answerable from a calendar role alone. It is rewritten
rather than quietly falsified.

Every *calendar*-scoped decision still asks `getCalendarRole` and nothing else.

## The roles

`reader` → `writer` → `owner`, ordered weakest-first because `CALENDAR_ROLE_RANK` is
derived from that order. A new role must be **inserted at its true position**, not
appended, or `canWriteCalendar` silently inverts.

| Predicate | True for | Guards |
| --- | --- | --- |
| `canWriteCalendar` | `writer`, `owner` | Creating, editing and soft-deleting **events** |
| `canAdministerCalendar` | `owner` only | Renaming, recolouring and deleting the **calendar** |

The two are separate on purpose. From Phase 6 a writer may add events to a calendar they
must not be able to delete out from under its owner.

**An override authorizes against its master's calendar — now by construction, not by
convention.** `calendar_events_parent_same_calendar` is a composite FK on
`(recurrence_parent_id, calendar_id)`, so an override *cannot* exist in a different
calendar from its master, and its `ON UPDATE CASCADE` moves the overrides when a master
changes calendar. Scoped writes never take a `calendarId` of their own for the same reason:
`updateEvent` refuses a calendar change under `scope: "this"` or `"thisAndFollowing"`
([api.md](api.md)), because moving the whole series is the operation that is correct
automatically.

## `getEventAccess` — and it exposes no role

```ts
interface EventAccess {           // opaque on purpose
  readonly reads: boolean;
  readonly responds: boolean;
  readonly response: AttendeeStatus | null;  // the caller's OWN answer
  readonly masterId: string | null;
  readonly calendarId: string | null;
}
canReadEvent(access) · canRespondToEvent(access)
```

**There is no `canWriteEvent`, and `calendar-acl.test.ts` asserts the module exports
none.** The guarantee this phase rests on — *attendance never grants write* — has to
survive someone reading the type looking for a way to authorize an edit, so it is
structural rather than one obvious-looking line away from being wrong. Writes keep asking
`getCalendarRole` + `canWriteCalendar`, which is a question about a *calendar*.

`role` is not a member for the same reason.

**Composition happens inside `getEventAccess`, never at a call site.** A route that asked
`getCalendarRole` *or* checked an attendee row itself would be one forgotten `||` away
from a leak, and the two questions have different answers for the same person. `response`
is on the answer for the same reason: a route deriving "which of these rows is me" from
the address alone would get it wrong for someone whose row was stamped with their account
id and who has since changed address.

**Three behaviours of `calendar_event_masters` are preserved, because the view's predicate
is part of the authorization answer rather than a projection:**

- **a soft-deleted event grants nothing** — otherwise a `calendar_cancelled` notification
  could link straight to a deleted event;
- **an override id resolves to its master**, then the master is answered for (attendees
  hang off the master — [attendees.md](attendees.md));
- **no row is no access**, indistinguishable from not-permitted.

**Cost: three queries, not the two an earlier estimate claimed** — the event, the calendar
role, and the attendee probe. A caller that already holds the event row passes it as
`target` and pays two; `/calendar/event/[id]` and `calendar.byId` both do, because they
join the event anyway. Folding the role read into the page's existing `calendars` join
would need a second exported entry point, and correctness was preferred to the estimate.

**Every attendee sees the full guest list.** That is Google's default and a deliberate
Phase-3 decision, not an omission: the alternative is the per-guest permission columns
(may-invite / may-modify / may-see-list) the program assigns to Phase 6, and shipping half
of that model would mean migrating it twice.

## Phase 1 grants exactly one thing

Ownership is the `calendars.user_id` column. It is **transferred, never shared**.

`getCalendarRole` runs three resolvers strongest-first and returns the first non-null
answer. Two of them are written, commented and deliberately empty:

| Resolver | Phase 1 | Phase 6 |
| --- | --- | --- |
| `resolveOwnerRole` | live — `user_id` match → `owner` | unchanged |
| `resolveSharedRole` | returns `null` | selects the caller's `calendar_shares` row → `reader` or `writer`, never `owner` |
| `resolveOrganizationRole` | returns `null` | an org calendar becomes visible to that org's members; owner/admin map to `writer` |

Shipping the full shape now is the point: an ACL that grows a second branch later is an
ACL whose call sites were written assuming there was only one.

The organization branch will **not** reuse `updatePost`'s `isOrgAdminRole` shortcut. A
calendar holds personal data even inside an organization, so Phase 6 gates it on an
explicit per-calendar visibility setting rather than on membership alone.

## There is no platform-admin override, and that is the decision

Every sibling authority module has one — `lib/rbac`'s `requireAdmin`, the documented
one-liner in `deletePost` — so silence here would read as a gap for someone to helpfully
fill in. It is stated in the code, in `schema/calendars.ts`, and again here for the same
reason.

An admin who can list every user's meeting titles, locations and attendees is a privacy
incident with a UI. Admins get `/admin/audit` and the organization-deletion cascade
instead.

⚠️ **Read "instead" narrowly: `audit_log` currently records no calendar action at all.**
`AUDIT_ACTIONS` is eight `user.*` members and `server/actions/calendar.ts` writes none of
them. That costs nothing today — there is no admin read path for a trail to catch — but it
stops being free the moment access can be *granted*. **Phase 6 owes
`calendar.share_granted` / `calendar.share_revoked` in the same change as
`calendar_shares`**, because a share is the most audit-worthy calendar action there is and
the alternative record is a mutable row with an `updated_at`.

**If you are about to add one**, the thing to change is not this file: add a scoped,
audited capability (a specific admin action that records what was accessed and why),
never a blanket read.

## `visibility: 'private'` is stored, returned, and enforced nowhere

⚠️ `calendar_events.visibility` is `'default' | 'private'`, `NOT NULL`, and **no read
filters on it** — `calendar.range` and `calendar.byId` both select it and hand it back.

It is not inert because "only the owner reads", which would be false: `getEventAccess`
grants `reads: true` to an **attendee** holding no calendar role, so an invited non-owner
already reads the column today. It is tolerable because today's readers are the owner plus
people explicitly invited to that event — so the value is unobservable to anyone not
already entitled to see the event itself. There is also **no ICS `CLASS` mapping** in
`@repo/calendar`'s serializer, so it has no wire semantics either.

**Phase 6 owes three answers, not one**, and they are separate questions:

1. what a **share reader** sees (Google shows `private` events as busy blocks);
2. what an **attendee** sees — an invitee is conventionally exempt, which is why nothing
   is broken today;
3. what the **feed** emits — `CLASS:PRIVATE`, or exclusion, which the program's own feed
   verification already assumes.

Deciding only (1) because sharing is what prompted it would leave two live surfaces
answering by accident.

## Freshness

The role is read from Postgres on **every** call, never cached on the session. Better
Auth's cookie cache is up to five minutes stale, and "revoked five minutes ago" is not a
property you want in an authorization answer. Same posture as `getOrgRole` and
`getUserRole`.

## What enforces access on the read path

`calendar.range` does not call `getCalendarRole` per calendar — it scopes the query to
calendars the caller owns, so an id they cannot see contributes nothing. That is an
optimisation with a correctness obligation attached: **when Phase 6 widens visibility,
that scope must move behind `getCalendarRole`**, or shared calendars will authorize on
the write path and silently return nothing on the read path.

**`/calendar/event/[id]` and `calendar.byId` no longer authorize through their join.**
Both scoped it to `calendars.user_id = me`, which was exactly right while the only person
who could see an event was the person whose calendar it sat on — and exactly wrong the
moment attendees existed, because an invitee would have been handed a `notFound()` on the
very event they were invited to. Both ask `getEventAccess` now, and a refusal is still the
same `notFound()` / `null` a missing row returns, so "someone else's" and "does not exist"
stay indistinguishable.

`calendar.listInvites` is the one read that authorizes on **attendee rows** rather than on
a calendar: it cannot reuse an owner-scoped join, because that join *is* the
authorization. Its predicate and the claim path are in [attendees.md](attendees.md).
