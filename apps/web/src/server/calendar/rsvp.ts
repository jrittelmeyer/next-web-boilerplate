import "server-only";
import { db } from "@repo/db";
import type { AttendeeStatus } from "@repo/db/schema";
import { calendarEventAttendees, calendarEvents, calendars, user } from "@repo/db/schema";
import { formatEventWhen } from "@repo/email";
import { and, eq, isNull } from "drizzle-orm";
import { verifyRsvpToken } from "@/lib/calendar-tokens";

/**
 * Resolving an RSVP token into something the public page can render.
 *
 * **Every failure returns `null`, and the page renders one indistinguishable "this link is
 * no longer valid" at HTTP 200.** Malformed, forged, expired, guest-removed and
 * event-deleted all look the same on purpose: a 404 — or any copy that separated them —
 * would confirm which attendee ids and which events exist, turning the one unauthenticated
 * route in the app into an enumeration oracle. Same posture as `respondToEvent`'s flat
 * "Event not found" (attendees.md).
 */

export interface RsvpView {
  readonly attendeeId: string;
  readonly email: string;
  readonly eventTitle: string;
  readonly when: string;
  readonly location: string | null;
  readonly organizerEmail: string;
  readonly status: AttendeeStatus;
  /** True when the event moved after this guest answered — see `calendar_events.reask_at`. */
  readonly stale: boolean;
}

/**
 * The attendee row a token names, if it still exists on a live event.
 *
 * The join filters `deleted_at`, so a cancelled event's links stop working the moment it is
 * deleted rather than resolving to a page about a meeting that is not happening.
 */
export async function loadRsvpView(token: string, nowMs: number): Promise<RsvpView | null> {
  const attendeeId = verifyRsvpToken(token, nowMs);
  if (attendeeId === null) return null;

  const [row] = await db
    .select({
      attendeeId: calendarEventAttendees.id,
      email: calendarEventAttendees.email,
      status: calendarEventAttendees.status,
      respondedAt: calendarEventAttendees.respondedAt,
      eventTitle: calendarEvents.title,
      location: calendarEvents.location,
      startWall: calendarEvents.startWall,
      startTzid: calendarEvents.startTzid,
      allDay: calendarEvents.allDay,
      reaskAt: calendarEvents.reaskAt,
      organizerEmail: user.email,
    })
    .from(calendarEventAttendees)
    .innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventAttendees.eventId))
    .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
    .innerJoin(user, eq(user.id, calendars.userId))
    .where(and(eq(calendarEventAttendees.id, attendeeId), isNull(calendarEvents.deletedAt)))
    .limit(1);
  if (!row) return null;

  return {
    attendeeId: row.attendeeId,
    email: row.email,
    eventTitle: row.eventTitle,
    when: formatEventWhen(row),
    location: row.location,
    organizerEmail: row.organizerEmail,
    status: row.status,
    stale: isStaleResponse(row.respondedAt, row.reaskAt),
  };
}

/**
 * Whether an answer predates the last time the event moved.
 *
 * Derived rather than stored, which is the whole point of `reask_at`: re-asking never
 * overwrites `status`, so "declined — clashes with my flight" survives a reschedule and can
 * still be shown beside the request to answer again.
 *
 * Strictly `<`, so an answer given in the same instant as the stamp counts as fresh.
 */
export function isStaleResponse(respondedAt: Date | null, reaskAt: Date | null): boolean {
  if (respondedAt === null || reaskAt === null) return false;
  return respondedAt.getTime() < reaskAt.getTime();
}
