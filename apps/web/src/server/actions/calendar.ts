"use server";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { canonicalizeTimeZone, deriveEventInstants, isLocalDateTime } from "@repo/calendar";
import { db } from "@repo/db";
import { calendarEvents, calendars } from "@repo/db/schema";
import { type ActionResult, type FieldErrors, zodFieldErrors } from "@repo/validators";
import {
  type CreateCalendarValues,
  type CreateEventValues,
  createCalendarSchema,
  createEventSchema,
  deleteCalendarSchema,
  deleteEventSchema,
  type UpdateCalendarValues,
  type UpdateEventValues,
  updateCalendarSchema,
  updateEventSchema,
} from "@repo/validators/calendar";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { canAdministerCalendar, canWriteCalendar, getCalendarRole } from "@/lib/calendar-acl";
import { getActiveOrganizationId } from "@/lib/organization";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Calendar writes. Reads live in `server/trpc/routers/calendar.ts` — the repo-wide
 * split (API.md).
 *
 * Every action here follows the same six steps, in this order: session gate → rate
 * limit → schema parse → `getCalendarRole` authorization → `deriveEventInstants` →
 * write. The order is not cosmetic: authorizing before parsing would leak whether a
 * calendar id exists to a caller sending garbage, and deriving before authorizing
 * would burn zone maths on a request that is about to be refused.
 */

type CalendarResult = ActionResult<{ id: string; name: string }>;
type EventResult = ActionResult<{ id: string; calendarId: string }>;
type DeleteResult = ActionResult<{ id: string }>;

const UNAUTHORIZED = "Unauthorized" as const;
const FORBIDDEN = "Forbidden" as const;
const RATE_LIMITED = "Too many requests. Please wait a moment and try again." as const;
const FIELD_ERRORS = "Please fix the fields below." as const;

/** Postgres check-constraint violation — a guard the app should have caught first. */
const SQLSTATE_CHECK_VIOLATION = "23514";
/** `invalid_parameter_value` — what `AT TIME ZONE` raises for a zone it doesn't know. */
const SQLSTATE_INVALID_PARAMETER = "22023";

/**
 * Turns a driver error into something a form can show.
 *
 * Both codes mean the same thing operationally: a value reached Postgres that the
 * application layer was supposed to have rejected. They are mapped rather than
 * swallowed because the alternative — a 500 — tells the user nothing and tells us
 * nothing either. Drizzle puts the violated constraint on `error.cause.constraint`,
 * **not** in the message, which is why this reads the cause.
 */
function mapWriteError(error: unknown, fallback: string): { error: string } {
  const cause = (error as { cause?: { code?: string; constraint?: string } } | null)?.cause;
  const code = cause?.code;
  if (code === SQLSTATE_CHECK_VIOLATION || code === SQLSTATE_INVALID_PARAMETER) {
    log.error("calendar.constraint violation", { code, constraint: cause?.constraint });
    return { error: "That event isn't valid. Check the dates and time zones and try again." };
  }
  log.error("calendar.write failed", { error: error instanceof Error ? error.message : error });
  return { error: fallback };
}

interface DerivedTimes {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly startOffsetMinutes: number;
  readonly endOffsetMinutes: number;
}

/**
 * Resolves both ends of an event, reporting failures **per field**.
 *
 * `deriveEventInstants` throws a single `RangeError` for any of four bad inputs, so
 * the two zones and the two readings are pre-checked here to attribute the failure to
 * the input the user can actually fix. The `try` around the call itself stays as the
 * honest catch-all: it is the only thing standing between an unexpected `RangeError`
 * and a 500.
 *
 * Ordering and span are checked here too, on the derived **instants** — the only
 * place the comparison is meaningful when the two ends carry different zones. Both
 * are also enforced by `calendar_events_end_not_before_start` and
 * `calendar_events_span_bounded`; this layer exists so the user sees a sentence
 * instead of a SQLSTATE.
 */
function deriveTimes(input: {
  startWall: string;
  startTzid: string;
  endWall: string;
  endTzid: string;
}): { data: DerivedTimes } | { fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  for (const field of ["startTzid", "endTzid"] as const) {
    if (canonicalizeTimeZone(input[field]) === null) {
      fieldErrors[field] = "This time zone isn't one the server recognises";
    }
  }
  for (const field of ["startWall", "endWall"] as const) {
    if (!isLocalDateTime(input[field])) {
      fieldErrors[field] = "This isn't a real date and time";
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  let derived: ReturnType<typeof deriveEventInstants>;
  try {
    derived = deriveEventInstants(input);
  } catch (error) {
    log.warn("calendar.derive failed after pre-checks", {
      error: error instanceof Error ? error.message : error,
    });
    return { fieldErrors: { startWall: "This event's times could not be resolved" } };
  }

  if (derived.endAtMs < derived.startAtMs) {
    return { fieldErrors: { endWall: "The end must not be before the start" } };
  }
  // Mirrors calendar_events_span_bounded, which measures ELAPSED time
  // (`end_at - start_at`), so this comparison is on instants, not on calendar days.
  if (derived.endAtMs - derived.startAtMs > 366 * 86_400_000) {
    return { fieldErrors: { endWall: "An event can span at most 366 days" } };
  }

  return {
    data: {
      startAt: new Date(derived.startAtMs),
      endAt: new Date(derived.endAtMs),
      startOffsetMinutes: derived.startOffsetMinutes,
      endOffsetMinutes: derived.endOffsetMinutes,
    },
  };
}

async function requireSession() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  return session ? { session, reqHeaders } : null;
}

// --- Calendars ---------------------------------------------------------------

/**
 * Create a calendar in the caller's active workspace.
 *
 * `organization_id` is stamped from the ACTIVE organization read authoritatively
 * (never off the session, whose cached pointer lags up to five minutes) — the
 * `createPost` precedent, and the reason a brand-new org's first calendar doesn't
 * land in the personal workspace.
 */
export async function createCalendar(input: CreateCalendarValues): Promise<CalendarResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const limit = await rateLimit(`calendar:create:${gate.session.user.id}`, {
    limit: 10,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = createCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: FIELD_ERRORS, fieldErrors: zodFieldErrors(parsed.error) };
  }
  if (canonicalizeTimeZone(parsed.data.timeZone) === null) {
    const message = "This time zone isn't one the server recognises";
    return { error: message, fieldErrors: { timeZone: message } };
  }

  const organizationId = await getActiveOrganizationId(gate.reqHeaders);
  const userId = gate.session.user.id;

  let created: { id: string; name: string };
  try {
    // Promoting to primary demotes the incumbent, and `calendars_one_primary_idx` is
    // unique — so the demote and the insert must be one transaction or the insert can
    // collide with the row it is about to replace.
    created = await db.transaction(async (tx) => {
      if (parsed.data.isPrimary) {
        await tx
          .update(calendars)
          .set({ isPrimary: false })
          .where(
            and(
              eq(calendars.userId, userId),
              organizationId
                ? eq(calendars.organizationId, organizationId)
                : isNull(calendars.organizationId),
              eq(calendars.isPrimary, true),
            ),
          );
      }
      const [row] = await tx
        .insert(calendars)
        .values({
          userId,
          organizationId,
          name: parsed.data.name,
          description: parsed.data.description,
          color: parsed.data.color,
          timeZone: parsed.data.timeZone,
          isPrimary: parsed.data.isPrimary,
        })
        .returning({ id: calendars.id, name: calendars.name });
      if (!row) throw new Error("calendar insert returned no row");
      return row;
    });
  } catch (error) {
    return mapWriteError(error, "Failed to create the calendar.");
  }

  revalidatePath("/calendar");
  return { data: created };
}

/** Rename, recolour or re-zone a calendar. Owner-only (`canAdministerCalendar`). */
export async function updateCalendar(input: UpdateCalendarValues): Promise<CalendarResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const limit = await rateLimit(`calendar:update:${gate.session.user.id}`, {
    limit: 10,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = updateCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: FIELD_ERRORS, fieldErrors: zodFieldErrors(parsed.error) };
  }
  if (canonicalizeTimeZone(parsed.data.timeZone) === null) {
    const message = "This time zone isn't one the server recognises";
    return { error: message, fieldErrors: { timeZone: message } };
  }

  const userId = gate.session.user.id;
  const role = await getCalendarRole(parsed.data.id, userId);
  if (!canAdministerCalendar(role)) return { error: role ? FORBIDDEN : "Calendar not found" };

  const existing = await db.query.calendars.findFirst({
    where: eq(calendars.id, parsed.data.id),
    columns: { organizationId: true },
  });
  if (!existing) return { error: "Calendar not found" };

  let updated: { id: string; name: string };
  try {
    updated = await db.transaction(async (tx) => {
      if (parsed.data.isPrimary) {
        await tx
          .update(calendars)
          .set({ isPrimary: false })
          .where(
            and(
              eq(calendars.userId, userId),
              existing.organizationId
                ? eq(calendars.organizationId, existing.organizationId)
                : isNull(calendars.organizationId),
              eq(calendars.isPrimary, true),
              ne(calendars.id, parsed.data.id),
            ),
          );
      }
      const [row] = await tx
        .update(calendars)
        .set({
          name: parsed.data.name,
          description: parsed.data.description,
          color: parsed.data.color,
          timeZone: parsed.data.timeZone,
          isPrimary: parsed.data.isPrimary,
        })
        .where(eq(calendars.id, parsed.data.id))
        .returning({ id: calendars.id, name: calendars.name });
      if (!row) throw new Error("calendar update returned no row");
      return row;
    });
  } catch (error) {
    return mapWriteError(error, "Failed to update the calendar.");
  }

  revalidatePath("/calendar");
  return { data: updated };
}

/**
 * Delete a calendar **and its events**, for real.
 *
 * Deliberately a hard delete where an event gets a soft one: `calendar_events.calendar_id`
 * cascades, and a soft-deleted calendar would leave its events reachable by id while
 * invisible in every list — a worse state than gone. Events are soft-deleted because
 * Phase 6 feed subscribers need to learn that a *deletion happened*; nobody subscribes
 * to a calendar that no longer exists.
 */
export async function deleteCalendar(input: { id: string }): Promise<DeleteResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const parsed = deleteCalendarSchema.safeParse(input);
  if (!parsed.success) return { error: "Calendar not found" };

  const role = await getCalendarRole(parsed.data.id, gate.session.user.id);
  if (!canAdministerCalendar(role)) return { error: role ? FORBIDDEN : "Calendar not found" };

  try {
    await db.delete(calendars).where(eq(calendars.id, parsed.data.id));
  } catch (error) {
    return mapWriteError(error, "Failed to delete the calendar.");
  }

  revalidatePath("/calendar");
  return { data: { id: parsed.data.id } };
}

// --- Events ------------------------------------------------------------------

export async function createEvent(input: CreateEventValues): Promise<EventResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const limit = await rateLimit(`calendar:event:create:${gate.session.user.id}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return { error: FIELD_ERRORS, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const role = await getCalendarRole(parsed.data.calendarId, gate.session.user.id);
  if (!canWriteCalendar(role)) return { error: role ? FORBIDDEN : "Calendar not found" };

  const derived = deriveTimes(parsed.data);
  if ("fieldErrors" in derived) return { error: FIELD_ERRORS, fieldErrors: derived.fieldErrors };

  let created: { id: string; calendarId: string };
  try {
    const [row] = await db
      .insert(calendarEvents)
      .values({
        calendarId: parsed.data.calendarId,
        // A bare UUID is a conformant RFC 5545 UID: the spec asks for global
        // uniqueness, and the domain-qualified form is one way to get it, not a
        // requirement. Generated on create and never regenerated — Phase 6 feed
        // subscribers identify an event by this, so changing it reads as
        // delete-and-recreate in every subscriber's client.
        uid: crypto.randomUUID(),
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        url: parsed.data.url,
        color: parsed.data.color,
        status: parsed.data.status,
        visibility: parsed.data.visibility,
        transparency: parsed.data.transparency,
        allDay: parsed.data.allDay,
        startWall: parsed.data.startWall,
        startTzid: parsed.data.startTzid,
        endWall: parsed.data.endWall,
        endTzid: parsed.data.endTzid,
        ...derived.data,
      })
      .returning({ id: calendarEvents.id, calendarId: calendarEvents.calendarId });
    if (!row) throw new Error("event insert returned no row");
    created = row;
  } catch (error) {
    return mapWriteError(error, "Failed to create the event.");
  }

  revalidatePath("/calendar");
  return { data: created };
}

export async function updateEvent(input: UpdateEventValues): Promise<EventResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const limit = await rateLimit(`calendar:event:update:${gate.session.user.id}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success) {
    return { error: FIELD_ERRORS, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const existing = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, parsed.data.id),
    columns: { id: true, calendarId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) return { error: "Event not found" };

  // Both sides of a move are authorized: the calendar the event is in now, and the
  // one it is being moved to. Checking only the destination would let anyone with a
  // calendar of their own drag someone else's event into it.
  const userId = gate.session.user.id;
  const sourceRole = await getCalendarRole(existing.calendarId, userId);
  if (!canWriteCalendar(sourceRole)) return { error: sourceRole ? FORBIDDEN : "Event not found" };
  if (parsed.data.calendarId !== existing.calendarId) {
    const targetRole = await getCalendarRole(parsed.data.calendarId, userId);
    if (!canWriteCalendar(targetRole)) return { error: FORBIDDEN };
  }

  const derived = deriveTimes(parsed.data);
  if ("fieldErrors" in derived) return { error: FIELD_ERRORS, fieldErrors: derived.fieldErrors };

  let updated: { id: string; calendarId: string };
  try {
    const [row] = await db
      .update(calendarEvents)
      .set({
        calendarId: parsed.data.calendarId,
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        url: parsed.data.url,
        color: parsed.data.color,
        status: parsed.data.status,
        visibility: parsed.data.visibility,
        transparency: parsed.data.transparency,
        allDay: parsed.data.allDay,
        startWall: parsed.data.startWall,
        startTzid: parsed.data.startTzid,
        endWall: parsed.data.endWall,
        endTzid: parsed.data.endTzid,
        ...derived.data,
        // `uid` and `sequence` are deliberately absent. The UID is immutable, and
        // SEQUENCE is bumped only on a *significant* change (Phase 4 decides which
        // edits qualify) — bumping it on every description tweak would make every
        // subscriber's client re-prompt its attendees.
      })
      .where(eq(calendarEvents.id, parsed.data.id))
      .returning({ id: calendarEvents.id, calendarId: calendarEvents.calendarId });
    if (!row) throw new Error("event update returned no row");
    updated = row;
  } catch (error) {
    return mapWriteError(error, "Failed to update the event.");
  }

  revalidatePath("/calendar");
  revalidatePath(`/calendar/event/${updated.id}`);
  return { data: updated };
}

/**
 * Soft-delete an event: `deleted_at` is stamped and the row stays.
 *
 * Every read filters it out, but Phase 6's feed can still emit the `STATUS:CANCELLED`
 * that tells a subscriber's client to remove it — which a hard delete cannot, because
 * a row that is gone cannot announce that it went.
 *
 * `status` is deliberately left alone. Deletion is one fact and it lives in one
 * column; Phase 4 derives `STATUS:CANCELLED` from `deleted_at IS NOT NULL` at
 * emission time. Writing both would make the user's own "tentative"/"confirmed"
 * choice unrecoverable the moment they delete — which matters because the Phase-6
 * ICS upsert resurrects soft-deleted rows (see model.md).
 */
export async function deleteEvent(input: { id: string }): Promise<DeleteResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const parsed = deleteEventSchema.safeParse(input);
  if (!parsed.success) return { error: "Event not found" };

  const existing = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, parsed.data.id),
    columns: { id: true, calendarId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) return { error: "Event not found" };

  const role = await getCalendarRole(existing.calendarId, gate.session.user.id);
  if (!canWriteCalendar(role)) return { error: role ? FORBIDDEN : "Event not found" };

  try {
    await db
      .update(calendarEvents)
      .set({ deletedAt: new Date() })
      .where(eq(calendarEvents.id, parsed.data.id));
  } catch (error) {
    return mapWriteError(error, "Failed to delete the event.");
  }

  revalidatePath("/calendar");
  revalidatePath(`/calendar/event/${parsed.data.id}`);
  return { data: { id: parsed.data.id } };
}
