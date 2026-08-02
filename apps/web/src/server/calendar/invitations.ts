import "server-only";
import { type IcsOverride, type IcsSeries, serializeIcs } from "@repo/calendar";
import { db } from "@repo/db";
import {
  calendarEventAttendees,
  calendarEvents,
  calendarRecurrenceDates,
  calendars,
  user,
} from "@repo/db/schema";
import { enqueue, JOBS } from "@repo/jobs";
import { and, eq, isNotNull } from "drizzle-orm";
import { partitionRecurrenceDates } from "@/lib/calendar/recurrence-dates";
import { mintRsvpToken } from "@/lib/calendar-tokens";
import { siteUrl } from "@/lib/site";

/**
 * Turning a stored series into an emailed invitation.
 *
 * **Everything happens here, at enqueue time, and the job payload is self-contained.** Two
 * reasons, both structural rather than stylistic:
 *
 * 1. `removeAttendees` hard-deletes the attendee row inside the write transaction, and
 *    enqueueing happens after that commits — so a cancellation job handed only ids would
 *    have nothing left to read and would silently tell nobody.
 * 2. `@repo/jobs` depends on `@repo/db` and `@repo/email` only. It cannot reach the token
 *    module, and `BETTER_AUTH_SECRET` is validated in `apps/web`'s env schema alone — a
 *    worker holding a different secret would mint a **wrong** RSVP link rather than fail to
 *    boot. Signing stays in one process.
 *
 * See docs/context/calendar/invitations.md.
 */

const PRODUCT_ID = "-//next-web-boilerplate//calendar//EN";

/** What a guest needs told, minted per recipient. */
interface Recipient {
  readonly attendeeId: string;
  readonly email: string;
}

/**
 * The event's own time, in the event's own zone, with the zone named.
 *
 * Deliberately **not** the reader's locale: an external guest has no account, so no stored
 * locale and no stored zone. Naming the zone is what keeps "09:00" unambiguous for someone
 * three time zones away, and it is the honest thing a calendar can say about a meeting whose
 * organizer picked a wall-clock time.
 */
export function formatEventWhen(event: {
  startWall: string;
  startTzid: string;
  allDay: boolean;
}): string {
  const [datePart = "", timePart = ""] = event.startWall.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    // Formatting the civil reading as if it were UTC is what keeps the wall clock intact:
    // the zone is stated separately below, never applied twice.
  }).format(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));

  if (event.allDay) return `${formatted} (all day)`;
  return `${formatted} at ${timePart.slice(0, 5)} (${event.startTzid})`;
}

/** The public link for one attendee row. */
export function rsvpUrlFor(attendeeId: string, seriesEndAt: Date | null): string {
  return `${siteUrl}/rsvp/${mintRsvpToken(attendeeId, seriesEndAt?.getTime() ?? null)}`;
}

interface LoadedSeries {
  readonly ics: string;
  readonly eventTitle: string;
  readonly location: string | null;
  readonly when: string;
  readonly organizerEmail: string;
  readonly seriesEndAt: Date | null;
}

/**
 * Read one series master and everything the `.ics` needs, then serialize it.
 *
 * `cancelled` forces `STATUS:CANCELLED` for the delete path — `softDeleteEvent` leaves the
 * stored `status` alone on purpose (deletion is one fact in one column), so it is derived
 * here at emission time exactly as that writer's comment says it would be. That is also why
 * this read does **not** filter `deleted_at`: a cancellation has to be able to describe the
 * event it is cancelling.
 */
export async function loadSeriesForEmail(
  masterId: string,
  options: { cancelled: boolean },
): Promise<LoadedSeries | null> {
  const [row] = await db
    .select({
      event: calendarEvents,
      organizerEmail: user.email,
    })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
    .innerJoin(user, eq(user.id, calendars.userId))
    .where(eq(calendarEvents.id, masterId))
    .limit(1);
  if (!row) return null;

  const master = row.event;

  const overrideRows = await db
    .select({
      id: calendarEvents.id,
      sequence: calendarEvents.sequence,
      title: calendarEvents.title,
      description: calendarEvents.description,
      location: calendarEvents.location,
      url: calendarEvents.url,
      status: calendarEvents.status,
      transparency: calendarEvents.transparency,
      allDay: calendarEvents.allDay,
      startWall: calendarEvents.startWall,
      startTzid: calendarEvents.startTzid,
      endWall: calendarEvents.endWall,
      endTzid: calendarEvents.endTzid,
      recurrenceId: calendarEvents.recurrenceId,
      deletedAt: calendarEvents.deletedAt,
    })
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.recurrenceParentId, masterId), isNotNull(calendarEvents.recurrenceId)),
    );

  const dateRows = await db
    .select({ kind: calendarRecurrenceDates.kind, dateWall: calendarRecurrenceDates.dateWall })
    .from(calendarRecurrenceDates)
    .where(eq(calendarRecurrenceDates.eventId, masterId));
  const partitioned = partitionRecurrenceDates(dateRows);

  const overrides: IcsOverride[] = [];
  // A soft-deleted override is an ABSENCE, not a component: it becomes an EXDATE beside the
  // stored ones. Without this an override the organizer deleted keeps showing at the
  // series' original time in the guest's client, forever.
  const exdates = [...partitioned.exdates];

  for (const override of overrideRows) {
    // Non-null by the `isNotNull` above; narrowed here so the type carries it.
    const recurrenceId = override.recurrenceId;
    if (recurrenceId === null) continue;
    if (override.deletedAt !== null) {
      exdates.push(recurrenceId);
      continue;
    }
    overrides.push({
      uid: master.uid,
      sequence: override.sequence,
      title: override.title,
      description: override.description,
      location: override.location,
      url: override.url,
      status: override.status,
      transparency: override.transparency,
      allDay: override.allDay,
      startWall: override.startWall,
      startTzid: override.startTzid,
      endWall: override.endWall,
      endTzid: override.endTzid,
      recurrenceId,
      recurrenceTzid: master.startTzid,
    });
  }

  const series: IcsSeries = {
    master: {
      uid: master.uid,
      sequence: master.sequence,
      title: master.title,
      description: master.description,
      location: master.location,
      url: master.url,
      status: options.cancelled ? "cancelled" : master.status,
      transparency: master.transparency,
      allDay: master.allDay,
      startWall: master.startWall,
      startTzid: master.startTzid,
      endWall: master.endWall,
      endTzid: master.endTzid,
    },
    rrule: master.rrule,
    exdates,
    rdates: partitioned.rdates,
    overrides,
    organizerEmail: row.organizerEmail,
    organizerName: null,
  };

  return {
    ics: serializeIcs({ series, dtstampMs: Date.now(), productId: PRODUCT_ID }),
    eventTitle: master.title,
    location: master.location,
    when: formatEventWhen(master),
    organizerEmail: row.organizerEmail,
    seriesEndAt: master.seriesEndAt,
  };
}

/** Every guest of a series except the organizer's own row, which needs no invitation. */
export async function loadRecipients(masterId: string): Promise<Recipient[]> {
  const rows = await db
    .select({ attendeeId: calendarEventAttendees.id, email: calendarEventAttendees.email })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, masterId));
  return rows;
}

/**
 * Enqueue one job per recipient — never one job for the batch, so a single hard-bounced
 * address cannot force the other forty-nine to be re-sent on a retry. `enqueue()` swallows
 * its own failures by design, so a down worker delays invitations rather than failing a save.
 */
async function fanOut(
  kind: "invite" | "update",
  masterId: string,
  recipients: readonly Recipient[],
  reask: boolean,
): Promise<void> {
  if (recipients.length === 0) return;
  const loaded = await loadSeriesForEmail(masterId, { cancelled: false });
  if (!loaded) return;

  await Promise.all(
    recipients.map((recipient) =>
      enqueue(JOBS.calendarInvitation, {
        kind,
        to: recipient.email,
        organizerEmail: loaded.organizerEmail,
        eventTitle: loaded.eventTitle,
        when: loaded.when,
        location: loaded.location,
        rsvpUrl: rsvpUrlFor(recipient.attendeeId, loaded.seriesEndAt),
        ics: loaded.ics,
        ...(kind === "update" ? { reask } : {}),
      }),
    ),
  );
}

/** Invitations for guests just added to a series. */
export async function enqueueInvitations(
  masterId: string,
  recipients: readonly Recipient[],
): Promise<void> {
  await fanOut("invite", masterId, recipients, false);
}

/**
 * An update for every guest of a series whose emitted `.ics` changed.
 *
 * `exclude` is the attendee ids invited by the very same save. They are already getting a
 * full invitation carrying the new times; an update email beside it would be a second
 * message about an event they have not heard of yet.
 */
export async function enqueueSeriesUpdate(
  masterId: string,
  reask: boolean,
  exclude: readonly string[] = [],
): Promise<void> {
  const skip = new Set(exclude);
  const recipients = (await loadRecipients(masterId)).filter(
    (recipient) => !skip.has(recipient.attendeeId),
  );
  await fanOut("update", masterId, recipients, reask);
}

/**
 * Cancellations. **The addresses are passed in, not read**, because the two callers have
 * both already destroyed what a read would need: `removeAttendees` hard-deletes the rows,
 * and `softDeleteEvent` stamps `deleted_at` on the event.
 *
 * `reason` decides whether an attachment goes at all. A deleted **event** carries
 * `STATUS:CANCELLED` so a guest who added it can have their client remove it; a **removed
 * guest** gets none, because the event is still going ahead for everyone else and a client
 * applying `STATUS:CANCELLED` would delete a live event out of their calendar.
 */
export async function enqueueCancellations(
  masterId: string,
  emails: readonly string[],
  reason: "cancelled" | "removed",
): Promise<void> {
  if (emails.length === 0) return;
  const loaded = await loadSeriesForEmail(masterId, { cancelled: reason === "cancelled" });
  if (!loaded) return;

  await Promise.all(
    emails.map((email) =>
      enqueue(JOBS.calendarInvitation, {
        kind: "cancel",
        to: email,
        organizerEmail: loaded.organizerEmail,
        eventTitle: loaded.eventTitle,
        when: loaded.when,
        reason,
        ics: reason === "cancelled" ? loaded.ics : null,
      }),
    ),
  );
}
