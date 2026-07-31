# Calendar — access control

Load when touching who may read or write a calendar. Endpoints:
[api.md](api.md). Domain model: [model.md](model.md).

One authority: **`getCalendarRole(calendarId, userId)`** in
`apps/web/src/lib/calendar-acl.ts`. Every calendar read and write in `apps/web` asks it
and nothing else.

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

**If you are about to add one**, the thing to change is not this file: add a scoped,
audited capability (a specific admin action that records what was accessed and why),
never a blanket read.

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
