import "server-only";
import { db } from "@repo/db";
import {
  type AttendeeStatus,
  calendarEventAttendees,
  calendarEvents,
  calendars,
  user,
} from "@repo/db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";

/**
 * Who may do what to a calendar. One function, one authority for *calendar*-scoped
 * questions — every calendar read and write in `apps/web` asks `getCalendarRole` and
 * nothing else.
 *
 * **Phase 3 adds a second, narrower authority for *event*-scoped questions,
 * `getEventAccess`, implemented on top of this one and answering only two questions.**
 * The split is the point: an attendee is not a member of the calendar an event lives on,
 * so "may this person see this event" stopped being answerable from a calendar role
 * alone. See the block above `getEventAccess` and docs/context/calendar/acl.md.
 *
 * Ships its **full** shape in Phase 1 even though only the owner branch can return a
 * role. The share and organization branches are written, commented and dead, which is
 * deliberate: an ACL that grows a second branch later is an ACL whose call sites were
 * written assuming there was only one. Phase 6 fills the bodies in; nothing above has
 * to change shape when it does.
 *
 * **There is deliberately no platform-admin override here, and its absence is the
 * decision, not an oversight.** Every sibling authority module has one — `lib/rbac`'s
 * `requireAdmin`, `deletePost`'s documented one-liner — so silence would read as a gap
 * somebody helpfully fills in later. An admin who can list every user's meeting titles
 * and locations is a privacy incident with a UI. Admins get `/admin/audit` and the
 * organization-deletion cascade instead. See docs/context/calendar/acl.md.
 */

/**
 * Ordered by authority, weakest first — `CALENDAR_ROLE_RANK` below depends on that
 * order, so a new role must be inserted at its true position rather than appended.
 */
export const CALENDAR_ROLES = ["reader", "writer", "owner"] as const;
export type CalendarRole = (typeof CALENDAR_ROLES)[number];

const CALENDAR_ROLE_RANK: Record<CalendarRole, number> = {
  reader: 0,
  writer: 1,
  owner: 2,
};

/** The only columns any grant decision reads. */
interface CalendarOwnership {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string | null;
}

/**
 * A resolver may become asynchronous in Phase 6 (both of the unimplemented ones
 * will), so the loop awaits every result and the type admits either.
 */
type CalendarRoleResolver = (
  calendar: CalendarOwnership,
  userId: string,
) => CalendarRole | null | Promise<CalendarRole | null>;

/** Ownership is the `user_id` column. It is transferred, never shared. */
const resolveOwnerRole: CalendarRoleResolver = (calendar, userId) =>
  calendar.userId === userId ? "owner" : null;

/**
 * Phase 6. `calendar_shares` does not exist yet, so this grants nothing. When it
 * lands, it selects the caller's row for this calendar and returns its stored role —
 * `reader` or `writer`, never `owner`.
 */
const resolveSharedRole: CalendarRoleResolver = () => null;

/**
 * Phase 6. An org calendar (`organization_id IS NOT NULL`) becomes visible to that
 * organization's members, with owner/admin mapping to `writer`.
 *
 * Deliberately NOT the `isOrgAdminRole` shortcut `updatePost` uses: a calendar holds
 * personal data even inside an organization, so this will be gated on an explicit
 * per-calendar visibility setting rather than on membership alone.
 */
const resolveOrganizationRole: CalendarRoleResolver = () => null;

/**
 * Ordered strongest-first so the first non-null answer is also the best one. Phase 6
 * fills in resolvers 2 and 3; every call site above is already written against a
 * function that can return any of the three roles, which is the point of shipping the
 * full shape now.
 */
const RESOLVERS: readonly CalendarRoleResolver[] = [
  resolveOwnerRole,
  resolveSharedRole,
  resolveOrganizationRole,
];

/**
 * The caller's role on a calendar, or `null` for no access at all.
 *
 * Read fresh from Postgres on every call rather than cached on the session: the
 * Better Auth cookie cache is up to five minutes stale, and "revoked five minutes
 * ago" is not a property you want in an authorization answer. This is the same
 * posture `getOrgRole` and `getUserRole` take.
 */
export async function getCalendarRole(
  calendarId: string,
  userId: string,
): Promise<CalendarRole | null> {
  const calendar = await db.query.calendars.findFirst({
    where: eq(calendars.id, calendarId),
    columns: { id: true, userId: true, organizationId: true },
  });
  if (!calendar) return null;

  for (const resolve of RESOLVERS) {
    const role = await resolve(calendar, userId);
    if (role) return role;
  }
  return null;
}

/** True when the role may create, edit or soft-delete events on the calendar. */
export function canWriteCalendar(role: CalendarRole | null): boolean {
  return role !== null && CALENDAR_ROLE_RANK[role] >= CALENDAR_ROLE_RANK.writer;
}

/**
 * True when the role may rename, recolour or delete the calendar **itself**.
 * Distinct from `canWriteCalendar` on purpose — a Phase-6 writer may add events to a
 * calendar they must not be able to delete out from under its owner.
 */
export function canAdministerCalendar(role: CalendarRole | null): boolean {
  return role === "owner";
}

/**
 * The answer to an *event*-scoped access question, and **deliberately opaque**.
 *
 * `role` is not a member, and that is structural rather than stylistic. A caller holding
 * an event id will reach for `getEventAccess`, and the guarantee this phase depends on —
 * **attendance never grants write** — has to survive someone reading this type looking
 * for a way to authorize an edit. There is no `canWriteEvent` in this module and
 * `calendar-acl.test.ts` asserts the module exports none; writes keep asking
 * `getCalendarRole` + `canWriteCalendar`, which is a question about a *calendar*.
 *
 * `masterId` is the series master the answer is about: an override id resolves to its
 * master (attendees hang off the master — docs/context/calendar/attendees.md), so a
 * caller that got here with either id can write against the right row. It is `null`
 * exactly when there is no access.
 *
 * `response` is the caller's **own** stored RSVP, and it is here rather than left to the
 * route because the route would have to re-derive "which of these rows is me" — the exact
 * composition this module exists to own. Matching on the address alone would get it wrong
 * for someone whose row was stamped with their account id and who has since changed
 * address. `null` means "not a guest", which is the same thing `responds: false` says.
 */
export interface EventAccess {
  readonly __brand: "EventAccess";
  readonly reads: boolean;
  readonly responds: boolean;
  readonly response: AttendeeStatus | null;
  readonly masterId: string | null;
  readonly calendarId: string | null;
}

const NO_EVENT_ACCESS: EventAccess = {
  __brand: "EventAccess",
  reads: false,
  responds: false,
  response: null,
  masterId: null,
  calendarId: null,
};

/** What `getEventAccess` needs about its target; a caller holding it skips one query. */
export interface EventAccessTarget {
  readonly id: string;
  readonly calendarId: string;
  readonly recurrenceParentId: string | null;
  readonly deletedAt: Date | null;
}

const EVENT_ACCESS_COLUMNS = {
  id: true,
  calendarId: true,
  recurrenceParentId: true,
  deletedAt: true,
} as const;

/**
 * The caller's own row on this event — by resolved account, or by an address they have
 * proved they own — as the status it carries, or `null` if they hold none.
 *
 * **Both halves of the predicate matter.** `user_id` is the durable arm and answers for
 * anyone invited after they had an account. The email arm is the claim path for someone
 * invited *before* they signed up, whose row therefore carries `user_id IS NULL`; the
 * writer stamps `user_id` on the first successful claim, so that arm answers once and
 * the durable one answers forever after. Without the stamp an accepted invitation would
 * silently disappear the day that person changed their address.
 *
 * **`emailVerified` is not optional.** Without it, signing up as `victim@example.com`
 * and never verifying would expose that person's invitations.
 *
 * **`lower()` goes on the parameter, not the column.** `calendar_event_attendees.email`
 * is CHECK-lowercased; `user.email` carries no such constraint, so the comparison needs
 * normalising — but `lower(a.email)` would put a function on the indexed side and lose
 * `calendar_event_attendees_email_idx`.
 *
 * Read from Postgres rather than from the session on purpose, the same posture
 * `getCalendarRole` takes: the Better Auth cookie cache is up to five minutes stale, and
 * the one snapshot that matters here is `(old address, verified)` held briefly after
 * someone moves away from an address another person may now be able to claim.
 */
async function attendeeResponse(masterId: string, userId: string): Promise<AttendeeStatus | null> {
  const [row] = await db
    .select({ status: calendarEventAttendees.status })
    .from(calendarEventAttendees)
    .innerJoin(
      user,
      or(
        eq(calendarEventAttendees.userId, user.id),
        and(
          eq(calendarEventAttendees.email, sql`lower(${user.email})`),
          eq(user.emailVerified, true),
        ),
      ),
    )
    .where(and(eq(calendarEventAttendees.eventId, masterId), eq(user.id, userId)))
    .limit(1);
  return row?.status ?? null;
}

/**
 * May this caller see this event, and may they RSVP to it?
 *
 * Composition happens **inside** here, never at a call site: a route that asked
 * `getCalendarRole` *or* checked an attendee row itself would be one forgotten `||` away
 * from a leak, and the two questions have different answers for the same person.
 *
 * **Three behaviours of the masters view are preserved, because the view's predicate is
 * part of the authorization answer rather than a projection** (`calendar/event/[id]`
 * documents that a `notFound()` for an override is the *correct* answer):
 *
 * - **a soft-deleted event grants nothing** — otherwise a `calendar_cancelled`
 *   notification could link straight to a deleted event;
 * - **an override id resolves to its master**, then the master is answered for;
 * - **no row is no access**, indistinguishable from not-permitted.
 *
 * `target` is the already-loaded row a caller may have (the detail route joins it
 * anyway), which keeps that route at two queries rather than four.
 */
export async function getEventAccess(
  eventId: string,
  userId: string,
  target?: EventAccessTarget,
): Promise<EventAccess> {
  const loaded =
    target ??
    (await db.query.calendarEvents.findFirst({
      where: eq(calendarEvents.id, eventId),
      columns: EVENT_ACCESS_COLUMNS,
    }));
  if (!loaded || loaded.deletedAt !== null) return NO_EVENT_ACCESS;

  // An override is only ever reachable through a live master — but "only ever" is a
  // writer-enforced invariant, not a database one, so the master is re-read rather than
  // assumed. The composite FK guarantees the two share a calendar, so this read is about
  // `deleted_at`, not about ownership.
  let masterId = loaded.id;
  let calendarId = loaded.calendarId;
  if (loaded.recurrenceParentId !== null) {
    const master = await db.query.calendarEvents.findFirst({
      where: and(
        eq(calendarEvents.id, loaded.recurrenceParentId),
        isNull(calendarEvents.deletedAt),
      ),
      columns: EVENT_ACCESS_COLUMNS,
    });
    if (!master) return NO_EVENT_ACCESS;
    masterId = master.id;
    calendarId = master.calendarId;
  }

  const role = await getCalendarRole(calendarId, userId);
  const response = await attendeeResponse(masterId, userId);
  if (role === null && response === null) return NO_EVENT_ACCESS;

  return {
    __brand: "EventAccess",
    reads: true,
    // The organizer is an attendee row of their own event, so they answer like anyone
    // else. Holding a calendar role without a row does not make you a guest.
    responds: response !== null,
    response,
    masterId,
    calendarId,
  };
}

/** May the caller see this event at all? */
export function canReadEvent(access: EventAccess): boolean {
  return access.reads;
}

/** May the caller record an RSVP against it? */
export function canRespondToEvent(access: EventAccess): boolean {
  return access.responds;
}
