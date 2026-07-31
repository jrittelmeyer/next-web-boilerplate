import "server-only";
import { db } from "@repo/db";
import { calendars } from "@repo/db/schema";
import { eq } from "drizzle-orm";

/**
 * Who may do what to a calendar. One function, one authority — every calendar read
 * and write in `apps/web` asks this and nothing else.
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
