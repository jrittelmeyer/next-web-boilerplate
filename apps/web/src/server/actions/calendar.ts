"use server";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import {
  canonicalizeTimeZone,
  deriveEventInstants,
  expandRRule,
  formatRRule,
  isLocalDateTime,
  type LocalDateTime,
  MAX_RECURRENCE_COUNT,
  parseLocalDateTime,
  parseRRule,
  type RecurrenceRule,
  resolveCivil,
  seriesEndInstantMs,
  untilInstantMs,
} from "@repo/calendar";
import { type Database, db } from "@repo/db";
import {
  calendarEventAttendees,
  calendarEventReminders,
  calendarEvents,
  calendarRecurrenceDates,
  calendars,
  user,
} from "@repo/db/schema";
import { type ActionResult, type FieldErrors, zodFieldErrors } from "@repo/validators";
import {
  type AttendeeInput,
  type AttendeeResponse,
  type CreateCalendarValues,
  type CreateEventInput,
  type CreateEventValues,
  createCalendarSchema,
  createEventSchema,
  type DeleteEventValues,
  deleteCalendarSchema,
  deleteEventSchema,
  type RecurrenceDateKind,
  type RecurrenceDateValues,
  type ReminderInput,
  type RespondToEventValues,
  recurrenceDateSchema,
  respondToEventSchema,
  type UpdateCalendarValues,
  type UpdateEventInput,
  type UpdateEventValues,
  updateCalendarSchema,
  updateEventSchema,
} from "@repo/validators/calendar";
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { partitionRecurrenceDates } from "@/lib/calendar/recurrence-dates";
import {
  classifyEventChange,
  type EventChange,
  RECURRENCE_DATES_CHANGED,
} from "@/lib/calendar/significant-change";
import {
  canAdministerCalendar,
  canRespondToEvent,
  canWriteCalendar,
  getCalendarRole,
  getEventAccess,
} from "@/lib/calendar-acl";
import { diffAttendees } from "@/lib/calendar-attendees";
import { diffReminders } from "@/lib/calendar-reminders";
import { getActiveOrganizationId } from "@/lib/organization";
import { rateLimit } from "@/lib/rate-limit";
import {
  enqueueCancellations,
  enqueueInvitations,
  enqueueSeriesUpdate,
} from "@/server/calendar/invitations";
import {
  createNotifications,
  type NewNotificationInput,
  publishNotifications,
} from "@/server/notifications/create";

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
/** `id` is the id the caller sent — always a series master's, never an override's. */
type EventResult = ActionResult<{ id: string; calendarId: string }>;
type DeleteResult = ActionResult<{ id: string }>;
type RecurrenceDateResult = ActionResult<{ eventId: string; kind: RecurrenceDateKind }>;

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

// --- Recurrence --------------------------------------------------------------

/**
 * The civil span every occurrence of a series is shifted from. Exactly the fields
 * `@repo/calendar`'s `SeriesInput` needs, and the columns a scoped write reads off the
 * master.
 */
interface SeriesCivil {
  readonly startWall: LocalDateTime;
  readonly startTzid: string;
  readonly endWall: LocalDateTime;
  readonly endTzid: string;
}

/** `rrule` + `series_end_at` — the pair that turns an ordinary row into a series master. */
interface DerivedRecurrence {
  readonly rrule: string | null;
  readonly seriesEndAt: Date | null;
}

/**
 * Reads an `RRULE`, reporting failure **under the `rrule` field**.
 *
 * The same split `deriveTimes` uses for zones and wall readings: `@repo/validators`
 * checks the string's *shape* so a form can mark the input, `parseRRule` owns the
 * grammar, and this attributes its `RangeError` — whose message names the offending
 * part — to the one field the user can fix.
 */
function parseSubmittedRule(
  rrule: string | null,
): { data: RecurrenceRule | null } | { fieldErrors: FieldErrors } {
  if (rrule === null) return { data: null };
  try {
    return { data: parseRRule(rrule) };
  } catch (error) {
    log.warn("calendar.rrule rejected", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      fieldErrors: {
        rrule: error instanceof RangeError ? error.message : "That repeat rule could not be read",
      },
    };
  }
}

/**
 * The two columns a series master carries beyond an ordinary event.
 *
 * The rule is stored **canonical** (`formatRRule`), so two users building the same
 * recurrence through the UI get byte-identical rows, a split can compare rules as text,
 * and Phase 6's ICS upsert can too.
 *
 * `rdates` is a required parameter rather than an optional one on purpose.
 * `series_end_at` may over-estimate and must **never** under-estimate — the range query
 * uses it to *exclude* masters — and an `RDATE` past the rule's own end is the one thing
 * that can extend it. A caller that forgot to pass the master's `RDATE` rows would
 * shorten the series and make it vanish from the grid.
 */
function seriesColumns(
  rule: RecurrenceRule | null,
  civil: SeriesCivil,
  rdates: readonly LocalDateTime[],
): DerivedRecurrence {
  if (rule === null) return { rrule: null, seriesEndAt: null };
  const rrule = formatRRule(rule);
  const endMs = seriesEndInstantMs({
    ...civil,
    rrule,
    exdates: [],
    rdates,
    overriddenRecurrenceIds: [],
  });
  return { rrule, seriesEndAt: endMs === null ? null : new Date(endMs) };
}

/** The master's `EXDATE`/`RDATE` rows, partitioned exhaustively and loudly. */
async function loadRecurrenceDates(eventId: string) {
  const rows = await db
    .select({
      kind: calendarRecurrenceDates.kind,
      dateWall: calendarRecurrenceDates.dateWall,
    })
    .from(calendarRecurrenceDates)
    .where(eq(calendarRecurrenceDates.eventId, eventId));

  const partitioned = partitionRecurrenceDates(rows);
  if (partitioned.unknown.length > 0) {
    // Loud, never a silent skip: the row was accepted by the unique constraint, so the
    // user believes their skip stuck. See lib/calendar/recurrence-dates.ts.
    log.error("calendar.recurrence-date kind not recognised", {
      eventId,
      kinds: [...new Set(partitioned.unknown.map((row) => row.kind))],
    });
  }
  return partitioned;
}

/**
 * The columns `classifyEventChange` reads, selected only by the whole-event writer.
 *
 * Kept out of `EVENT_TARGET_COLUMNS` on purpose: that set is loaded by every scoped write,
 * and none of the others needs a colour or a description to decide what it owes.
 */
const CHANGE_COLUMNS = {
  title: calendarEvents.title,
  description: calendarEvents.description,
  location: calendarEvents.location,
  url: calendarEvents.url,
  color: calendarEvents.color,
  status: calendarEvents.status,
  visibility: calendarEvents.visibility,
  transparency: calendarEvents.transparency,
  allDay: calendarEvents.allDay,
  startWall: calendarEvents.startWall,
  startTzid: calendarEvents.startTzid,
  endWall: calendarEvents.endWall,
  endTzid: calendarEvents.endTzid,
  rrule: calendarEvents.rrule,
  calendarId: calendarEvents.calendarId,
} as const;

/** Everything a scoped write needs to know about its target before it touches it. */
const EVENT_TARGET_COLUMNS = {
  id: true,
  calendarId: true,
  uid: true,
  deletedAt: true,
  rrule: true,
  recurrenceParentId: true,
  startWall: true,
  startTzid: true,
  endWall: true,
  endTzid: true,
} as const;

interface EventTarget {
  readonly id: string;
  readonly calendarId: string;
  readonly uid: string;
  readonly deletedAt: Date | null;
  readonly rrule: string | null;
  readonly recurrenceParentId: string | null;
  readonly startWall: LocalDateTime;
  readonly startTzid: string;
  readonly endWall: LocalDateTime;
  readonly endTzid: string;
}

async function findEventTarget(id: string): Promise<EventTarget | undefined> {
  return await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, id),
    columns: EVENT_TARGET_COLUMNS,
  });
}

/**
 * The occurrence-identity contract, enforced (docs/context/calendar/api.md).
 *
 * The grid renders virtual occurrences and materialised overrides as identical chips,
 * and both ids are `uuid` — so nothing in the type system stops a client sending an
 * override's id where the master's belongs, and `updateEvent(scope: "all")` given one
 * would update the override, return `{ data }`, and do nothing the user asked for.
 *
 * `id` is therefore **always the series master's**. A call whose target is itself an
 * override is refused **whether or not it carries a scope**, and the unscoped half is
 * the load-bearing one: it is the only path by which an override could be soft-deleted
 * while its master is still live, which is the state that leaves the grid painting the
 * occurrences of a deleted series.
 */
function rejectOverrideTarget(target: EventTarget) {
  if (target.recurrenceParentId === null) return null;
  const message = "Change the repeating event this occurrence belongs to, not the occurrence.";
  return { error: message, fieldErrors: { id: message } };
}

/** A scope only means something against a series master. */
function rejectUnrepeated(field: "scope" | "eventId") {
  const message = "This event doesn't repeat, so there are no other occurrences to change.";
  return { error: message, fieldErrors: { [field]: message } };
}

/**
 * An override lives in its master's calendar by construction
 * (`calendar_events_parent_same_calendar`), and a split would strand the rows it
 * re-parents. Moving the whole series is the supported way, and it is correct
 * automatically — the composite FK's `ON UPDATE CASCADE` takes the overrides with it.
 */
function rejectCalendarMove() {
  const message = "Move the whole repeating event to another calendar, not one occurrence.";
  return { error: message, fieldErrors: { calendarId: message } };
}

const civilOf = (target: EventTarget): SeriesCivil => ({
  startWall: target.startWall,
  startTzid: target.startTzid,
  endWall: target.endWall,
  endTzid: target.endTzid,
});

/**
 * Where a `thisAndFollowing` write cuts a series.
 *
 * **Split by `COUNT` when the source rule uses `COUNT`, by `UNTIL` otherwise.**
 * Translating a `COUNT` split into an `UNTIL` would drag the UTC-`UNTIL`-versus-zoned-
 * `DTSTART` question into the most common edit in the product for no benefit.
 *
 * `before === 0` means the cut is the series' own first occurrence, which is not a split
 * at all — it is `scope: "all"`, and the callers treat it as one rather than writing a
 * `COUNT=0` rule the reader would then refuse to parse.
 */
interface SeriesCut {
  /** Occurrences the first half keeps. */
  readonly before: number;
  readonly boundedRule: RecurrenceRule;
}

function planSeriesCut(
  target: EventTarget,
  rule: RecurrenceRule,
  recurrenceId: LocalDateTime,
): { data: SeriesCut } | { fieldErrors: FieldErrors } {
  const dtstart = parseLocalDateTime(target.startWall);
  const cutMs = resolveCivil(parseLocalDateTime(recurrenceId), target.startTzid).instantMs;
  const startMs = resolveCivil(dtstart, target.startTzid).instantMs;

  const notInSeries = { recurrenceId: "That date isn't part of this repeating event." };
  if (rule.until !== null && cutMs > untilInstantMs(rule.until))
    return { fieldErrors: notInSeries };

  // Occurrences STRICTLY before the cut. A COUNT rule cannot seek — COUNT is positional —
  // so this walk is the only way to learn how many the first half keeps.
  const before = expandRRule({
    rule,
    dtstart,
    timeZone: target.startTzid,
    fromMs: startMs,
    toMs: cutMs - 1,
    limit: rule.count ?? MAX_RECURRENCE_COUNT,
  }).occurrences.length;

  if (rule.count !== null && before >= rule.count) return { fieldErrors: notInSeries };

  const boundedRule: RecurrenceRule =
    rule.count === null
      ? // One second before the cut: occurrences carry second precision, so nothing can
        // fall between the two, and `formatRRule` emits UNTIL at exactly that precision.
        { ...rule, until: { kind: "utc", instantMs: cutMs - 1000 } }
      : { ...rule, count: before };

  return { data: { before, boundedRule } };
}

/**
 * The rule the second half of a split carries.
 *
 * The submitted rule wins, because the user may have changed it in the same edit — with
 * one exception: when they left it alone, a `COUNT` has to be re-based, or a `COUNT=10`
 * series split after its fourth occurrence would run to fourteen. The comparison is text
 * against text because both sides are canonical (`formatRRule`), which is exactly what
 * canonicalising on write is for.
 */
function remainderRule(
  target: EventTarget,
  submitted: RecurrenceRule,
  before: number,
): RecurrenceRule {
  if (submitted.count === null || formatRRule(submitted) !== target.rrule) return submitted;
  return { ...submitted, count: submitted.count - before };
}

/**
 * The columns an event write sets from user input.
 *
 * `uid` and `sequence` are deliberately absent everywhere this is spread: the UID is
 * immutable (Phase 6 subscribers identify an event by it — changing it reads as
 * delete-and-recreate) and `SEQUENCE` is bumped only on a *significant* change, which
 * Phase 4 defines. The one place a `uid` IS written to an existing row is the split
 * below, and it is written explicitly so it cannot happen by accident.
 */
function eventColumns(values: CreateEventInput) {
  return {
    title: values.title,
    description: values.description,
    location: values.location,
    url: values.url,
    color: values.color,
    status: values.status,
    visibility: values.visibility,
    transparency: values.transparency,
    allDay: values.allDay,
    startWall: values.startWall,
    startTzid: values.startTzid,
    endWall: values.endWall,
    endTzid: values.endTzid,
  };
}

// --- Attendees ---------------------------------------------------------------

/** The transaction handle Drizzle hands a `db.transaction` callback. */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Who is doing the writing. The **email** fills the `body` slot of every calendar
 * notification (there is no stored display name and no stored locale — the sentence is
 * picked in the reader's locale at render time), and the **id** is how the delete path
 * leaves the person doing the deleting off their own cancellation list. Functions that
 * need only the address still take a bare `actorEmail`, so each signature says which half
 * it actually uses.
 */
interface Actor {
  readonly id: string;
  readonly email: string;
}

/**
 * Resolve submitted addresses to account ids, in one query.
 *
 * Matched on `user.email` directly rather than `lower(user.email)`: Better Auth
 * lower-cases on its sign-up path, so the column is lowercase in practice, and putting a
 * function on it here would seq-scan `user` on every event save.
 *
 * **`emailVerified` is the second half of the match, not a filter on top of it.** The
 * `user_id` this returns is stamped onto the attendee row, and a stamp is a durable
 * identity claim: every later read answers by `user_id` alone, with no verified conjunct
 * to re-check (`getEventAccess`, `calendar.listInvites`). So resolving an unproved
 * address here would mint exactly the fact the token path refuses to record — that
 * whoever holds an address owns it — and on an email-unconfigured deploy, where
 * unverified accounts sign in freely (`requireEmailVerification: isEmailConfigured()`),
 * signing up as someone else's address would capture their invitations for good.
 *
 * A miss is **benign** in both of its shapes — no account, or an unverified one. The row
 * keeps `user_id NULL` and behaves as an external attendee, which is a real invitation
 * reached by email; and the claim path compares `attendees.email = lower(user.email)`
 * *with* the verified conjunct, so the person is picked up the moment they verify.
 * `respondToEvent` then stamps on their first answer — the one unverified-to-durable
 * promotion, and it happens under proof.
 */
async function resolveAttendeeUserIds(
  tx: Transaction,
  emails: readonly string[],
): Promise<Map<string, string>> {
  if (emails.length === 0) return new Map();
  const rows = await tx
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(inArray(user.email, [...emails]), eq(user.emailVerified, true)));
  return new Map(rows.map((row) => [row.email.toLowerCase(), row.id]));
}

/** The invitation notification for one new guest. `body` is the actor, `title` the event. */
function inviteNotification(
  userId: string,
  actorEmail: string,
  eventTitle: string,
  eventId: string,
): NewNotificationInput {
  return {
    userId,
    type: "calendar_invite",
    body: actorEmail,
    title: eventTitle,
    link: `/calendar/event/${eventId}`,
  };
}

/**
 * The cancellation notification. **`link` is null by construction** — the event is either
 * soft-deleted or the recipient is no longer on its guest list, so `calendar_event_masters`
 * excludes it or `getEventAccess` refuses it, and any link would 404 on click.
 *
 * `title` carries the event and `body` the actor, the same way round as every other
 * calendar type, even though `calendarCancelled` renders only `{event}`. The contract
 * beside `NOTIFICATION_TYPES` reads `title IS NULL ⇒ body is already a complete sentence`,
 * and the feed applies it literally — so putting the title in `body` and leaving `title`
 * NULL would render the bare words "Standup" rather than "Standup was cancelled". `body`
 * is NOT NULL, so it needs a real value regardless, and the actor is the honest one.
 */
function cancelNotification(
  userId: string,
  actorEmail: string,
  eventTitle: string,
): NewNotificationInput {
  return { userId, type: "calendar_cancelled", body: actorEmail, title: eventTitle, link: null };
}

/**
 * Insert a guest list and return the invitations to publish **after** the transaction
 * commits.
 *
 * Nothing is published from in here: `notify()` runs `pg_notify` on the pooled
 * connection, not this transaction's, so a push issued inside the transaction can reach a
 * subscriber before the row it describes is visible — a live invitation whose link 404s.
 * `createNotifications`/`publishNotifications` split those legs; the caller owns the
 * ordering.
 */
async function addAttendees(
  tx: Transaction,
  eventId: string,
  eventTitle: string,
  attendees: readonly AttendeeInput[],
  actorEmail: string,
  // Filled with the inserted rows so the caller can enqueue their emails AFTER the commit.
  // The ids have to come back from the INSERT: an RSVP token is minted from the attendee
  // row id, and re-reading for it after the transaction would race a concurrent edit.
  invited: { attendeeId: string; email: string }[],
) {
  if (attendees.length === 0) return [];
  const resolved = await resolveAttendeeUserIds(
    tx,
    attendees.map((a) => a.email),
  );
  const inserted = await tx
    .insert(calendarEventAttendees)
    .values(
      attendees.map((attendee) => ({
        eventId,
        email: attendee.email,
        role: attendee.role,
        userId: resolved.get(attendee.email) ?? null,
      })),
    )
    .returning({ attendeeId: calendarEventAttendees.id, email: calendarEventAttendees.email });
  invited.push(...inserted);

  // Only a resolved account can receive an in-app notification. An external attendee is
  // a real row with a real invitation; Phase 4 is what reaches them, by email.
  const rows = attendees
    .map((attendee) => resolved.get(attendee.email))
    .filter((id): id is string => id !== undefined)
    .map((id) => inviteNotification(id, actorEmail, eventTitle, eventId));
  return await createNotifications(tx, rows);
}

/**
 * The caller's own reminders on an event.
 *
 * **Reminders hang off the SERIES MASTER**, exactly as attendees do — every caller resolves
 * `recurrence_parent_id ?? id` before arriving here, so an override inherits its master's
 * reminders rather than carrying copies. The sweeper reads them the same way.
 *
 * Phase 5 writes reminders only for the acting user, which is the calendar's owner: the
 * schema would accept any `user_id`, and Phase 6 widens this deliberately when shared
 * calendars arrive. Nothing here is notified or emailed — a reminder is a future delivery,
 * and the sweeper is what makes it happen.
 */
async function applyReminders(
  tx: Transaction,
  eventId: string,
  userId: string,
  submitted: readonly ReminderInput[],
) {
  const existing = await tx
    .select({
      id: calendarEventReminders.id,
      channel: calendarEventReminders.channel,
      anchor: calendarEventReminders.anchor,
      offsetMinutes: calendarEventReminders.offsetMinutes,
    })
    .from(calendarEventReminders)
    .where(
      and(eq(calendarEventReminders.eventId, eventId), eq(calendarEventReminders.userId, userId)),
    );

  const diff = diffReminders(existing, submitted);

  // `unchanged` is untouched on purpose: re-inserting would mint a new row id, and
  // `calendar_reminder_deliveries` cascades on it — the ledger that stops a re-send would
  // go with it, and the next sweep would re-deliver every occurrence still inside the
  // grace window. See lib/calendar-reminders.ts.
  if (diff.removed.length > 0) {
    await tx
      .delete(calendarEventReminders)
      .where(inArray(calendarEventReminders.id, [...diff.removed]));
  }
  if (diff.added.length > 0) {
    await tx.insert(calendarEventReminders).values(
      diff.added.map((reminder) => ({
        eventId,
        userId,
        channel: reminder.channel,
        anchor: reminder.anchor,
        offsetMinutes: reminder.offsetMinutes,
      })),
    );
  }
}

/**
 * Cancellations for guests being dropped from an event that still exists.
 *
 * **The deleted addresses are returned to the caller, and that is load-bearing.** This is a
 * hard `DELETE` inside the write transaction, and the cancellation email is enqueued after
 * the commit — so by the time the job exists there is no row left to read, not even a race
 * window. A job payload carrying only ids would find nothing and complete silently, telling
 * the dropped guest nothing at all.
 */
async function removeAttendees(
  tx: Transaction,
  eventId: string,
  eventTitle: string,
  emails: readonly string[],
  actorEmail: string,
  // Filled with the addresses actually removed (not the requested ones) — the DELETE is the
  // authority on which rows existed.
  dropped: string[],
) {
  if (emails.length === 0) return [];
  const removed = await tx
    .delete(calendarEventAttendees)
    .where(
      and(
        eq(calendarEventAttendees.eventId, eventId),
        inArray(calendarEventAttendees.email, [...emails]),
      ),
    )
    .returning({ userId: calendarEventAttendees.userId, email: calendarEventAttendees.email });
  dropped.push(...removed.map((row) => row.email));

  const rows = removed
    .map((row) => row.userId)
    .filter((id): id is string => id !== null)
    .map((id) => cancelNotification(id, actorEmail, eventTitle));
  return await createNotifications(tx, rows);
}

/** What `createNotifications` hands back — payloads awaiting a post-commit publish. */
type NotificationPayloads = Awaited<ReturnType<typeof createNotifications>>;

/**
 * The response type splits three ways rather than carrying a status field, because a
 * one-slot notification cannot express "Alice declined Standup" — two variables and a
 * status. `satisfies` over the submittable statuses, so a fourth answer stops this file
 * compiling instead of silently rendering nothing.
 */
const RESPONSE_TYPES = {
  accepted: "calendar_response_accepted",
  declined: "calendar_response_declined",
  tentative: "calendar_response_tentative",
} as const satisfies Record<AttendeeResponse, NewNotificationInput["type"]>;

/** The stored guest list for a series master, which is the only place one lives. */
async function loadAttendees(tx: Transaction, eventId: string) {
  return await tx
    .select({ email: calendarEventAttendees.email })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId));
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

/**
 * Create an event, or a series when `rrule` is present.
 *
 * A brand-new series has no `EXDATE`/`RDATE` rows yet, so `series_end_at` comes from the
 * rule alone — the only moment in this file where passing no `RDATE`s is safe by
 * construction rather than by a check.
 */
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

  const rule = parseSubmittedRule(parsed.data.rrule);
  if ("fieldErrors" in rule) return { error: FIELD_ERRORS, fieldErrors: rule.fieldErrors };

  let created: { id: string; calendarId: string };
  let invitations: Awaited<ReturnType<typeof createNotifications>> = [];
  const invited: { attendeeId: string; email: string }[] = [];
  try {
    // One transaction: an event whose guest list failed to insert is an event the
    // organizer believes they invited people to.
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(calendarEvents)
        .values({
          calendarId: parsed.data.calendarId,
          // A bare UUID is a conformant RFC 5545 UID: the spec asks for global
          // uniqueness, and the domain-qualified form is one way to get it, not a
          // requirement. Generated on create and never regenerated — Phase 6 feed
          // subscribers identify an event by this, so changing it reads as
          // delete-and-recreate in every subscriber's client.
          uid: crypto.randomUUID(),
          ...eventColumns(parsed.data),
          ...derived.data,
          ...seriesColumns(rule.data, parsed.data, []),
        })
        .returning({ id: calendarEvents.id, calendarId: calendarEvents.calendarId });
      if (!row) throw new Error("event insert returned no row");
      const payloads = await addAttendees(
        tx,
        row.id,
        parsed.data.title,
        parsed.data.attendees,
        gate.session.user.email,
        invited,
      );
      await applyReminders(tx, row.id, gate.session.user.id, parsed.data.reminders);
      return { row, payloads };
    });
    created = result.row;
    invitations = result.payloads;
  } catch (error) {
    return mapWriteError(error, "Failed to create the event.");
  }

  // Strictly after the commit — see `addAttendees`. The emails go the same way and for the
  // same reason: an invitation whose event is not yet visible is a link that 404s.
  await publishNotifications(invitations);
  await enqueueInvitations(created.id, invited);
  revalidatePath("/calendar");
  return { data: created };
}

/**
 * Edit an event — or one occurrence, this and the following ones, or the whole series.
 *
 * `id` is **always the series master's** and `recurrenceId` names the occurrence; see
 * `rejectOverrideTarget`. `scope: null` and `scope: "all"` deliberately share one
 * implementation: an unscoped call against a master is still an edit to the whole
 * series, and routing it anywhere else would leave the "did the occurrence identities
 * change?" question — and the override rows that depend on it — unanswered.
 */
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

  const target = await findEventTarget(parsed.data.id);
  if (!target || target.deletedAt) return { error: "Event not found" };

  const isOverride = rejectOverrideTarget(target);
  if (isOverride) return isOverride;

  // Both sides of a move are authorized: the calendar the event is in now, and the
  // one it is being moved to. Checking only the destination would let anyone with a
  // calendar of their own drag someone else's event into it.
  const userId = gate.session.user.id;
  const sourceRole = await getCalendarRole(target.calendarId, userId);
  if (!canWriteCalendar(sourceRole)) return { error: sourceRole ? FORBIDDEN : "Event not found" };
  if (parsed.data.calendarId !== target.calendarId) {
    const targetRole = await getCalendarRole(parsed.data.calendarId, userId);
    if (!canWriteCalendar(targetRole)) return { error: FORBIDDEN };
  }

  const derived = deriveTimes(parsed.data);
  if ("fieldErrors" in derived) return { error: FIELD_ERRORS, fieldErrors: derived.fieldErrors };

  const { scope, recurrenceId } = parsed.data;
  let result: EventResult;

  const actorEmail = gate.session.user.email;
  if ((scope === "this" || scope === "thisAndFollowing") && recurrenceId !== null) {
    if (target.rrule === null) return rejectUnrepeated("scope");
    if (parsed.data.calendarId !== target.calendarId) return rejectCalendarMove();
    result =
      scope === "this"
        ? await updateOccurrence(target, parsed.data, derived.data, recurrenceId)
        : await splitSeries(
            target,
            target.rrule,
            parsed.data,
            derived.data,
            recurrenceId,
            actorEmail,
            userId,
          );
  } else {
    result = await updateWholeEvent(target, parsed.data, derived.data, actorEmail, userId);
  }

  if ("error" in result) return result;
  revalidatePath("/calendar");
  revalidatePath(`/calendar/event/${target.id}`);
  return result;
}

/**
 * `scope: "all"`, and every unscoped edit.
 *
 * **If the rule, the start wall or either zone changed, the overrides and the
 * recurrence-date rows are dropped.** Their `recurrence_id`s are written in terms of the
 * occurrence identities those four inputs generate, so after such an edit they name
 * occurrences that no longer exist — a moved occurrence would keep painting at a time
 * nothing produces. Correct, and destructive; the composer confirms it explicitly before
 * submitting, because a silent drop is data loss.
 *
 * A **hard** delete, not a soft one: an override that is soft-deleted while its master
 * is live is precisely the state the identity contract and the suppression query exist
 * to prevent.
 */
async function updateWholeEvent(
  target: EventTarget,
  values: UpdateEventInput,
  times: DerivedTimes,
  actorEmail: string,
  // Separate from `actorEmail` because reminders are keyed by user id, not address. Threaded
  // in rather than re-read: this is the same session the ACL gate already resolved.
  actorUserId: string,
): Promise<EventResult> {
  const rule = parseSubmittedRule(values.rrule);
  if ("fieldErrors" in rule) return { error: FIELD_ERRORS, fieldErrors: rule.fieldErrors };

  // Both sides canonical, so this compares rules rather than spellings.
  const canonical = rule.data === null ? null : formatRRule(rule.data);
  const identityChanged =
    canonical !== target.rrule ||
    values.startWall !== target.startWall ||
    values.startTzid !== target.startTzid ||
    values.endTzid !== target.endTzid;

  const dates = target.rrule === null ? null : await loadRecurrenceDates(target.id);
  const dropModifiers = identityChanged && target.rrule !== null;
  const series = seriesColumns(
    rule.data,
    values,
    dropModifiers || dates === null ? [] : dates.rdates,
  );

  // `uid` stays absent — it is immutable, and changing it reads as delete-and-recreate in
  // every subscriber's client. `sequence` and `reask_at` are decided per edit below.
  const columns = {
    calendarId: values.calendarId,
    ...eventColumns(values),
    ...times,
    ...series,
  };

  // **Always transactional from Phase 3**, where revision 1 had a non-transactional fast
  // path for the common edit. The guest-list diff is two writes of its own, and a title
  // edit that committed while its invitations did not is a worse failure than the extra
  // BEGIN costs.
  let result: {
    row: { id: string; calendarId: string };
    payloads: NotificationPayloads;
    change: EventChange;
    invited: { attendeeId: string; email: string }[];
    dropped: string[];
  };
  try {
    result = await db.transaction(async (tx) => {
      // Read before writing: the classifier compares the stored row against the values
      // going in, and this is the last moment the old ones exist. Scoped to this writer
      // rather than widened into EVENT_TARGET_COLUMNS, which would make every scoped write
      // pay for columns only the whole-event path reads.
      const [before] = await tx
        .select(CHANGE_COLUMNS)
        .from(calendarEvents)
        .where(eq(calendarEvents.id, target.id))
        .limit(1);
      if (!before) throw new Error("event vanished before update");

      const change = classifyEventChange(before, {
        title: values.title,
        description: values.description,
        location: values.location,
        url: values.url,
        color: values.color,
        status: values.status,
        visibility: values.visibility,
        transparency: values.transparency,
        allDay: values.allDay,
        startWall: values.startWall,
        startTzid: values.startTzid,
        endWall: values.endWall,
        endTzid: values.endTzid,
        rrule: canonical,
        calendarId: values.calendarId,
      });

      const [row] = await tx
        .update(calendarEvents)
        .set({
          ...columns,
          // A client IGNORES a re-import whose UID matches and whose SEQUENCE has not
          // risen, so an update that does not bump ships an attachment nobody applies.
          ...(change.bumpsSequence ? { sequence: sql`${calendarEvents.sequence} + 1` } : {}),
          // Re-asking stamps a timestamp instead of overwriting the guest list: a stored
          // "declined, clashes with my flight" survives, and staleness is derived as
          // `responded_at < reask_at`. See calendar-events.ts.
          //
          // **`now()`, not `new Date()`, and that is not a style choice.** The other half
          // of that comparison — `responded_at` — is written by Postgres, so stamping this
          // one from the Node process compares two clocks. Caught by the e2e on a machine
          // whose Docker Postgres ran 4.5 s ahead of the host: the guest answered, the
          // organizer then moved the event, and the answer still read as newer than the
          // move. Any deployment with the app and the database on separate hosts has the
          // same skew permanently.
          ...(change.reasks ? { reaskAt: sql`now()` } : {}),
        })
        .where(eq(calendarEvents.id, target.id))
        .returning({ id: calendarEvents.id, calendarId: calendarEvents.calendarId });
      if (!row) throw new Error("event update returned no row");

      if (dropModifiers) {
        // A master whose identity moved while its overrides survived is the corrupt
        // state, and it is exactly what a failure between these writes leaves. The
        // override rows go with them — `ON DELETE CASCADE` takes any attendee row that a
        // future phase attached to one.
        await tx.delete(calendarEvents).where(eq(calendarEvents.recurrenceParentId, target.id));
        await tx
          .delete(calendarRecurrenceDates)
          .where(eq(calendarRecurrenceDates.eventId, target.id));
      }

      // Diff by email; an address in both sets is left strictly alone, which is what
      // keeps a re-save from resetting everyone's RSVP (lib/calendar-attendees.ts).
      const diff = diffAttendees(await loadAttendees(tx, target.id), values.attendees);
      const invited: { attendeeId: string; email: string }[] = [];
      const dropped: string[] = [];
      const added = await addAttendees(
        tx,
        target.id,
        values.title,
        diff.added,
        actorEmail,
        invited,
      );
      const cancelled = await removeAttendees(
        tx,
        target.id,
        values.title,
        diff.removed,
        actorEmail,
        dropped,
      );
      // `target.id` is already the series master (every caller resolves
      // `recurrence_parent_id ?? id`), so an override edit adjusts the series' reminders
      // rather than creating a second set nothing would ever reconcile.
      await applyReminders(tx, target.id, actorUserId, values.reminders);
      return { row, payloads: [...added, ...cancelled], change, invited, dropped };
    });
  } catch (error) {
    return mapWriteError(error, "Failed to update the event.");
  }

  // Outside the `try` on purpose: the write has committed, and a publish failure must
  // not be reported to the user as "Failed to update the event."
  await publishNotifications(result.payloads);
  await emitSeriesEmails(target.id, result.change, result.invited, result.dropped);
  return { data: result.row };
}

/**
 * The three emails a whole-event save can owe, in the one order that reads correctly.
 *
 * A guest added by this save gets a full invitation and is **excluded** from the update
 * fan-out — otherwise they receive "this event changed" about an event they have not been
 * told about yet.
 */
async function emitSeriesEmails(
  masterId: string,
  change: EventChange,
  invited: readonly { attendeeId: string; email: string }[],
  dropped: readonly string[],
): Promise<void> {
  await enqueueInvitations(masterId, invited);
  await enqueueCancellations(masterId, dropped, "removed");
  if (change.resends) {
    await enqueueSeriesUpdate(
      masterId,
      change.reasks,
      invited.map((row) => row.attendeeId),
    );
  }
}

/**
 * `scope: "this"` — materialise one occurrence as an override row.
 *
 * The row carries its master's `calendar_id` and `uid` and a NULL `rrule`, which is what
 * makes it an ordinary row to every reader: the range query finds it by the same scan as
 * anything else, and a Phase-6 feed emits it as a `RECURRENCE-ID` of the right series.
 *
 * `ON CONFLICT` targets `calendar_events_calendar_id_uid_recurrence_id_key`, which
 * already identifies an override uniquely precisely *because* it carries its master's
 * calendar and uid — no second unique index is needed. It also makes editing the same
 * occurrence twice an update rather than a duplicate-key error.
 *
 * The returned id is the **master's**. It is the id the caller sent, the only one with a
 * URL, and the only one a subsequent scoped call may use.
 */
async function updateOccurrence(
  target: EventTarget,
  values: UpdateEventInput,
  times: DerivedTimes,
  recurrenceId: LocalDateTime,
): Promise<EventResult> {
  const columns = { ...eventColumns(values), ...times };
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(calendarEvents)
        .values({
          calendarId: target.calendarId,
          uid: target.uid,
          recurrenceParentId: target.id,
          recurrenceId,
          rrule: null,
          seriesEndAt: null,
          ...columns,
        })
        .onConflictDoUpdate({
          target: [calendarEvents.calendarId, calendarEvents.uid, calendarEvents.recurrenceId],
          // `deleted_at` is cleared because an occurrence being edited is an occurrence
          // that exists. Nothing else can reach this row: an override is never
          // soft-deleted while its master is live, and a soft-deleted master is already
          // "Event not found" two frames up.
          set: { ...columns, deletedAt: null },
        });

      // The MASTER's sequence, not the override's. The `.ics` is one calendar: the override
      // rides in it as a `RECURRENCE-ID` sibling, and a client decides whether to apply the
      // whole thing from the master's `SEQUENCE`. Bump the override's instead and the
      // sibling arrives inside a calendar the client has already decided to ignore.
      await tx
        .update(calendarEvents)
        .set({ sequence: sql`${calendarEvents.sequence} + 1` })
        .where(eq(calendarEvents.id, target.id));
    });
  } catch (error) {
    return mapWriteError(error, "Failed to update the event.");
  }

  // Resends, never re-asks. RSVP is series-level through Phase 4 — a "yes" is to the series,
  // so one occurrence moving does not invalidate it, and marking fifty people stale because
  // next Tuesday shifted is the noise the three-way classifier exists to avoid.
  // Per-occurrence re-asking arrives with per-occurrence RSVP, in Phase 6.
  await enqueueSeriesUpdate(target.id, RECURRENCE_DATES_CHANGED.reasks);
  return { data: { id: target.id, calendarId: target.calendarId } };
}

/**
 * `scope: "thisAndFollowing"` — a real series split, in one transaction.
 *
 * **The `uid` rewrite on re-parented overrides is not optional.** Without it, every split
 * with an override past the cut leaves rows carrying the old master's `uid` under the new
 * master — the exact corruption the schema leaves writer-enforced, manufactured by our
 * own writer, and reported by a detection assertion that reports and never blocks. Phase
 * 6's feed would then emit `RECURRENCE-ID` overrides whose `UID` names a series they are
 * no longer part of.
 *
 * The new master gets a **new `uid`**: it is a different series, and a subscriber that
 * saw one UID split into two events at the same UID would show a duplicate.
 */
async function splitSeries(
  target: EventTarget,
  seriesRrule: string,
  values: UpdateEventInput,
  times: DerivedTimes,
  recurrenceId: LocalDateTime,
  actorEmail: string,
  actorUserId: string,
): Promise<EventResult> {
  const source = parseSubmittedRule(seriesRrule);
  if ("fieldErrors" in source || source.data === null) {
    return { error: "This repeating event's rule could not be read." };
  }
  const submitted = parseSubmittedRule(values.rrule);
  if ("fieldErrors" in submitted) {
    return { error: FIELD_ERRORS, fieldErrors: submitted.fieldErrors };
  }
  if (submitted.data === null) {
    // Turning repetition off from a date onward is a deletion, not an edit — and doing
    // it here would leave the re-parented overrides pointing at a non-recurring parent,
    // manufacturing the second invariant the schema leaves writer-enforced.
    const message =
      "To stop a repeating event from a date onward, delete this and the ones after it.";
    return { error: message, fieldErrors: { rrule: message } };
  }

  const cut = planSeriesCut(target, source.data, recurrenceId);
  if ("fieldErrors" in cut) return { error: FIELD_ERRORS, fieldErrors: cut.fieldErrors };
  // Cutting at the series' own first occurrence is not a split — it is "all". Taking it
  // literally would write `COUNT=0`, a rule `parseRRule` then refuses to read back.
  if (cut.data.before === 0)
    return await updateWholeEvent(target, values, times, actorEmail, actorUserId);

  // Partitioned here rather than re-read inside the transaction: string comparison on
  // `"YYYY-MM-DD HH:MM:SS"` is chronological because every field is zero-padded.
  const dates = await loadRecurrenceDates(target.id);
  const keptRDates = dates.rdates.filter((date) => date < recurrenceId);
  const movedRDates = dates.rdates.filter((date) => date >= recurrenceId);

  const firstHalf = seriesColumns(cut.data.boundedRule, civilOf(target), keptRDates);
  const secondHalf = seriesColumns(
    remainderRule(target, submitted.data, cut.data.before),
    values,
    movedRDates,
  );
  const uid = crypto.randomUUID();

  let reasks = false;
  try {
    const created = await db.transaction(async (tx) => {
      // **Where the Phase-3 debt gets paid** (attendees.md): the copy below carries
      // `status` and `responded_at` verbatim, so a cut that moved the time would otherwise
      // leave everyone still `accepted` for a meeting that changed. Classifying the source
      // against the second half answers whether that happened, without re-asking after a
      // pure title edit — the failure the debt note warned a naive reset would cause.
      const [before] = await tx
        .select(CHANGE_COLUMNS)
        .from(calendarEvents)
        .where(eq(calendarEvents.id, target.id))
        .limit(1);
      if (!before) throw new Error("event vanished before split");
      reasks = classifyEventChange(before, {
        title: values.title,
        description: values.description,
        location: values.location,
        url: values.url,
        color: values.color,
        status: values.status,
        visibility: values.visibility,
        transparency: values.transparency,
        allDay: values.allDay,
        startWall: values.startWall,
        startTzid: values.startTzid,
        endWall: values.endWall,
        endTzid: values.endTzid,
        rrule: secondHalf.rrule,
        // The insert below uses the target's calendar, not the submitted one.
        calendarId: target.calendarId,
      }).reasks;

      const [row] = await tx
        .insert(calendarEvents)
        .values({
          calendarId: target.calendarId,
          uid,
          ...eventColumns(values),
          ...times,
          ...secondHalf,
          // Stamped at insert so the copied `responded_at` values — all of which predate
          // this moment — read as stale the instant the row exists. `now()` for the same
          // reason as `updateWholeEvent`: the timestamps being compared must come from one
          // clock, and `responded_at` is Postgres's.
          ...(reasks ? { reaskAt: sql`now()` } : {}),
        })
        .returning({ id: calendarEvents.id, calendarId: calendarEvents.calendarId });
      if (!row) throw new Error("series split insert returned no row");

      await tx
        .update(calendarEvents)
        .set({ recurrenceParentId: row.id, uid })
        .where(
          and(
            eq(calendarEvents.recurrenceParentId, target.id),
            gte(calendarEvents.recurrenceId, recurrenceId),
          ),
        );
      await tx
        .update(calendarRecurrenceDates)
        .set({ eventId: row.id })
        .where(
          and(
            eq(calendarRecurrenceDates.eventId, target.id),
            gte(calendarRecurrenceDates.dateWall, recurrenceId),
          ),
        );

      // **The one place attendees are copied rather than inherited**, because the master
      // this creates is a real, addressable, RSVP-able event with its own id and its own
      // URL — so unlike an override, a row on it is observable. Copied VERBATIM: `role`,
      // `status`, `comment` and `responded_at` all carry over.
      //
      // The consequence is recorded rather than hidden (attendees.md): a "this and
      // following" edit that moves the time leaves everyone still `accepted` for a
      // meeting whose time changed. Resetting them here would pre-decide Phase 4's
      // significant-change rules from inside Phase 3 and would re-ask every guest after a
      // pure title edit. No invitations are published either — these people are already
      // on this series; telling them they were invited to something would be noise.
      await tx.execute(sql`
        INSERT INTO calendar_event_attendees
          (event_id, user_id, email, role, status, comment, responded_at)
        SELECT ${row.id}, user_id, email, role, status, comment, responded_at
          FROM calendar_event_attendees
         WHERE event_id = ${target.id}
      `);

      // The first half keeps its own civil span, its own uid and its own overrides;
      // only its bound moves. The edit applies from the cut forward, which is what
      // "this and following" means. Its `SEQUENCE` bumps because that bound is in the
      // emitted `.ics`: without it a guest's client keeps expanding the old rule and shows
      // occurrences past the cut, at the old time, forever.
      await tx
        .update(calendarEvents)
        .set({ ...firstHalf, sequence: sql`${calendarEvents.sequence} + 1` })
        .where(eq(calendarEvents.id, target.id));
      return row;
    });

    // **Two emails, one per UID, and that is not noise.** The guest's client holds the
    // original series; it needs the first half's new bound *and* the second half, which is
    // a different event with a different UID. Sending only one leaves the other half wrong
    // in their calendar.
    await enqueueSeriesUpdate(created.id, reasks);
    await enqueueSeriesUpdate(target.id, false);
    return { data: created };
  } catch (error) {
    return mapWriteError(error, "Failed to update the event.");
  }
}

/**
 * RSVP to an event you were invited to.
 *
 * **The attendee row is the authorization.** There is no `getCalendarRole` call here and
 * there must not be one: an invitee is not a member of the organizer's calendar, and
 * asking a calendar-scoped question about an event-scoped permission is how "attendance
 * grants write" gets built by accident. `getEventAccess` answers the narrow question and
 * exposes no role to be tempted by.
 *
 * A caller who is not an attendee gets the same `"Event not found"` the rest of this file
 * uses, so "not invited" and "does not exist" are indistinguishable.
 *
 * Series-level in Phase 3: the response attaches to the master. Per-occurrence RSVP would
 * require an attendee — who by design has no write access to the organizer's calendar —
 * to trigger an INSERT into `calendar_events` to materialise the override the response
 * would hang off, which is a privilege-escalation shape rather than a free feature.
 */
export async function respondToEvent(input: RespondToEventValues): Promise<EventResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const limit = await rateLimit(`calendar:event:respond:${gate.session.user.id}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = respondToEventSchema.safeParse(input);
  if (!parsed.success) {
    return { error: FIELD_ERRORS, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const userId = gate.session.user.id;
  const access = await getEventAccess(parsed.data.eventId, userId);
  if (!canRespondToEvent(access) || access.masterId === null || access.calendarId === null) {
    return { error: "Event not found" };
  }
  const eventId = access.masterId;

  let payloads: NotificationPayloads;
  try {
    payloads = await db.transaction(async (tx) => {
      // `responded_at` is stamped unconditionally, which is safe because
      // `ATTENDEE_RESPONSES` excludes `needs-action` — the only status that would
      // contradict `calendar_event_attendees_responded_pair`.
      const [row] = await tx
        .update(calendarEventAttendees)
        .set({
          status: parsed.data.status,
          comment: parsed.data.comment,
          respondedAt: sql`now()`,
          // **The claim, made durable.** A row invited before this person had an account
          // carries `user_id NULL` and is reachable only by the verified-email arm of the
          // predicate. Stamping it here means that arm answers once: without this, an
          // invitation they have already ACCEPTED would silently vanish from their list
          // the day they changed their address.
          userId,
        })
        .where(
          and(
            eq(calendarEventAttendees.eventId, eventId),
            // Re-stating the identity rather than trusting the id: `getEventAccess` said
            // this person is an attendee, and this narrows the UPDATE to their own row.
            //
            // **The email arm carries `email_verified`, exactly as the read side does.**
            // Without it this UPDATE matches every row bearing the caller's *current*
            // address, and it is not bounded to one row: an attendee who moves their
            // account onto a co-invitee's address — free on a deploy where verification
            // is off — overwrites that person's status, comment and stamp along with
            // their own. The durable arm needs no such conjunct, because a stamp is only
            // ever minted under proof (`resolveAttendeeUserIds`, and this statement).
            sql`(${calendarEventAttendees.userId} = ${userId} OR EXISTS (
              SELECT 1 FROM "user" u
               WHERE u.id = ${userId}
                 AND u.email_verified
                 AND ${calendarEventAttendees.email} = lower(u.email)
            ))`,
          ),
        )
        .returning({ email: calendarEventAttendees.email });
      if (!row) throw new Error("attendee update returned no row");

      const [event] = await tx
        .select({ title: calendarEvents.title, ownerId: calendars.userId })
        .from(calendarEvents)
        .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
        .where(eq(calendarEvents.id, eventId))
        .limit(1);
      if (!event) throw new Error("event vanished mid-response");

      // The organizer hears about it; responding to your own event notifies nobody.
      if (event.ownerId === userId) return [];
      return await createNotifications(tx, [
        {
          userId: event.ownerId,
          type: RESPONSE_TYPES[parsed.data.status],
          body: row.email,
          title: event.title,
          link: `/calendar/event/${eventId}`,
        },
      ]);
    });
  } catch (error) {
    return mapWriteError(error, "Failed to save your response.");
  }

  await publishNotifications(payloads);
  revalidatePath("/calendar/invites");
  revalidatePath(`/calendar/event/${eventId}`);
  return { data: { id: eventId, calendarId: access.calendarId } };
}

/**
 * Delete an event — or skip one occurrence, drop this and the following ones, or the
 * whole series.
 *
 * Rate-limited like the other event writes: from Phase 2 this endpoint parses a rule and
 * walks a bounded expansion before it writes anything, which is work an unlimited action
 * should not do.
 */
export async function deleteEvent(input: DeleteEventValues): Promise<DeleteResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const limit = await rateLimit(`calendar:event:delete:${gate.session.user.id}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = deleteEventSchema.safeParse(input);
  // Deliberately terse: a delete has no form to mark up, and "not found" is the answer
  // that leaks least about ids the caller cannot see.
  if (!parsed.success) return { error: "Event not found" };

  const target = await findEventTarget(parsed.data.id);
  if (!target || target.deletedAt) return { error: "Event not found" };

  const isOverride = rejectOverrideTarget(target);
  if (isOverride) return isOverride;

  const role = await getCalendarRole(target.calendarId, gate.session.user.id);
  if (!canWriteCalendar(role)) return { error: role ? FORBIDDEN : "Event not found" };

  const { scope, recurrenceId } = parsed.data;
  let result: DeleteResult;
  const actor: Actor = { id: gate.session.user.id, email: gate.session.user.email };

  if ((scope === "this" || scope === "thisAndFollowing") && recurrenceId !== null) {
    if (target.rrule === null) return rejectUnrepeated("scope");
    result =
      scope === "this"
        ? await skipOccurrence(target, recurrenceId)
        : await truncateSeries(target, target.rrule, recurrenceId, actor);
  } else {
    result = await softDeleteEvent(target, actor);
  }

  if ("error" in result) return result;
  revalidatePath("/calendar");
  revalidatePath(`/calendar/event/${target.id}`);
  return result;
}

/**
 * Soft-delete an event — **and its override rows, in the same transaction**, when it is
 * a series master.
 *
 * `deleted_at` is stamped and the row stays. Every read filters it out, but Phase 6's
 * feed can still emit the `STATUS:CANCELLED` that tells a subscriber's client to remove
 * it, which a hard delete cannot: a row that is gone cannot announce that it went.
 *
 * The override half is a **measured** obligation, not a precaution. An override matches
 * the range query's concrete branch — `rrule IS NULL AND deleted_at IS NULL` — exactly,
 * so soft-deleting the master alone leaves the grid painting the occurrences of a deleted
 * series. Postgres could enforce this with a trigger and deliberately does not: the
 * schema enforces invariants, not behaviour.
 *
 * `status` is deliberately left alone. Deletion is one fact and it lives in one column;
 * Phase 4 derives `STATUS:CANCELLED` from `deleted_at IS NOT NULL` at emission time.
 * Writing both would make the user's own "tentative"/"confirmed" choice unrecoverable the
 * moment they delete — which matters because the Phase-6 ICS upsert resurrects
 * soft-deleted rows (see model.md).
 */
async function softDeleteEvent(target: EventTarget, actor: Actor): Promise<DeleteResult> {
  const deletedAt = new Date();
  let payloads: NotificationPayloads;
  // Collected inside the transaction because the guest list is what the cancellation email
  // needs and this is the last place it is known to be current.
  const guestEmails: string[] = [];
  try {
    payloads = await db.transaction(async (tx) => {
      await tx
        .update(calendarEvents)
        // `STATUS:CANCELLED` in the emitted `.ics` is derived from `deleted_at` rather than
        // written to `status` (see below), but the SEQUENCE still has to rise or the
        // cancellation attachment is one a conforming client ignores.
        .set({ deletedAt, sequence: sql`${calendarEvents.sequence} + 1` })
        .where(eq(calendarEvents.id, target.id));
      if (target.rrule !== null) {
        await tx
          .update(calendarEvents)
          .set({ deletedAt })
          .where(
            and(eq(calendarEvents.recurrenceParentId, target.id), isNull(calendarEvents.deletedAt)),
          );
      }

      // Every guest but the person doing the deleting, who does not need telling. The
      // attendee rows are NOT deleted: `deleted_at` is a soft delete, so the guest list
      // survives with the event, and Phase 6's ICS upsert can resurrect the row.
      //
      // `title` is read here rather than taken from `target` because `EVENT_TARGET_COLUMNS`
      // deliberately carries only what a scoped write needs to decide, and widening it
      // for one notification would make every scoped write pay for it.
      const [event] = await tx
        .select({ title: calendarEvents.title })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, target.id))
        .limit(1);
      const guests = await tx
        .select({
          userId: calendarEventAttendees.userId,
          email: calendarEventAttendees.email,
        })
        .from(calendarEventAttendees)
        .where(
          and(
            eq(calendarEventAttendees.eventId, target.id),
            // `user_id` is NULL for an external guest, and `NULL <> $actor` is NULL — a
            // bare `ne()` silently dropped exactly the guests whose only notice this
            // email is (audit F4). The NULL-safe spelling is proven against real
            // Postgres in @repo/db's calendar-attendees integration suite.
            or(isNull(calendarEventAttendees.userId), ne(calendarEventAttendees.userId, actor.id)),
          ),
        );
      // The addresses go out with the job, not an id to re-read: the event is soft-deleted
      // by the time the worker runs, and only a `cancelled` load is allowed to see it.
      guestEmails.push(...guests.map((guest) => guest.email));
      const rows = guests
        .map((guest) => guest.userId)
        .filter((id): id is string => id !== null)
        .map((id) => cancelNotification(id, actor.email, event?.title ?? ""));
      return await createNotifications(tx, rows);
    });
  } catch (error) {
    return mapWriteError(error, "Failed to delete the event.");
  }

  await publishNotifications(payloads);
  // `cancelled`, so the attachment carries STATUS:CANCELLED and a guest who added the event
  // can have their client remove it. A *removed guest* gets no attachment — different case,
  // handled by `emitSeriesEmails`.
  await enqueueCancellations(target.id, guestEmails, "cancelled");
  return { data: { id: target.id } };
}

/**
 * `scope: "this"` — skip one occurrence.
 *
 * The `EXDATE` row is the durable record of the skip, so any override at that
 * `recurrence_id` is **hard**-deleted rather than soft-deleted: a soft-deleted override
 * beside an `EXDATE` is redundant state that can disagree with it, and an override that
 * is soft-deleted while its master is live is the one thing the suppression query
 * refuses to paper over.
 *
 * `series_end_at` is deliberately **not** recomputed. It is computed from the rule alone
 * and is blind to `EXDATE`s by design, so it stays a permanent over-estimate; tracking a
 * trailing `EXDATE` would under-estimate and make the whole series vanish from the grid.
 */
async function skipOccurrence(
  target: EventTarget,
  recurrenceId: LocalDateTime,
): Promise<DeleteResult> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(calendarRecurrenceDates)
        // Idempotent and race-free — the entire reason these are rows rather than a
        // jsonb array. Two users skipping two occurrences in the same second cannot
        // resurrect one another's.
        .values({ eventId: target.id, kind: "exdate", dateWall: recurrenceId })
        .onConflictDoNothing();
      await tx
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.recurrenceParentId, target.id),
            eq(calendarEvents.recurrenceId, recurrenceId),
          ),
        );
      // An EXDATE is IN the emitted `.ics`, so this changes what a guest's client should
      // render while touching none of the columns the field classifier reads. Bump, or the
      // update ships an attachment every conforming client ignores and the guest keeps a
      // meeting that was cancelled.
      await tx
        .update(calendarEvents)
        .set({ sequence: sql`${calendarEvents.sequence} + 1` })
        .where(eq(calendarEvents.id, target.id));
    });
  } catch (error) {
    return mapWriteError(error, "Failed to delete the event.");
  }
  await enqueueSeriesUpdate(target.id, RECURRENCE_DATES_CHANGED.reasks);
  return { data: { id: target.id } };
}

/** `scope: "thisAndFollowing"` — bound the series and drop everything at or after the cut. */
async function truncateSeries(
  target: EventTarget,
  seriesRrule: string,
  recurrenceId: LocalDateTime,
  actor: Actor,
): Promise<DeleteResult> {
  const source = parseSubmittedRule(seriesRrule);
  if ("fieldErrors" in source || source.data === null) {
    return { error: "This repeating event's rule could not be read." };
  }

  const cut = planSeriesCut(target, source.data, recurrenceId);
  if ("fieldErrors" in cut) return { error: FIELD_ERRORS, fieldErrors: cut.fieldErrors };
  // Nothing before the cut means nothing survives — that is a deletion of the series.
  if (cut.data.before === 0) return await softDeleteEvent(target, actor);

  const dates = await loadRecurrenceDates(target.id);
  const bounded = seriesColumns(
    cut.data.boundedRule,
    civilOf(target),
    dates.rdates.filter((date) => date < recurrenceId),
  );

  try {
    await db.transaction(async (tx) => {
      // The new bound is in the emitted RRULE, so the SEQUENCE has to rise with it —
      // otherwise a guest's client keeps expanding the old rule and shows occurrences the
      // organizer has deleted.
      await tx
        .update(calendarEvents)
        .set({ ...bounded, sequence: sql`${calendarEvents.sequence} + 1` })
        .where(eq(calendarEvents.id, target.id));
      // Hard, and correct: these occurrences no longer exist, so there is nothing left
      // for a soft delete to announce that bounding the series has not already said.
      await tx
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.recurrenceParentId, target.id),
            gte(calendarEvents.recurrenceId, recurrenceId),
          ),
        );
      await tx
        .delete(calendarRecurrenceDates)
        .where(
          and(
            eq(calendarRecurrenceDates.eventId, target.id),
            gte(calendarRecurrenceDates.dateWall, recurrenceId),
          ),
        );
    });
  } catch (error) {
    return mapWriteError(error, "Failed to delete the event.");
  }
  await enqueueSeriesUpdate(target.id, RECURRENCE_DATES_CHANGED.reasks);
  return { data: { id: target.id } };
}

/**
 * Skip an occurrence (`exdate`) or add one (`rdate`) without editing the series.
 *
 * The same six steps as every other write here — session gate → `rateLimit` → parse →
 * `getCalendarRole` on the master's calendar → write → `revalidatePath`.
 *
 * **Only an `RDATE` recomputes `series_end_at`.** An added date past the rule's own end
 * is the one thing that can extend a series; an `EXDATE` never shortens it, because that
 * column is blind to exclusions by design and must stay a permanent over-estimate.
 */
export async function setRecurrenceDate(
  input: RecurrenceDateValues,
): Promise<RecurrenceDateResult> {
  const gate = await requireSession();
  if (!gate) return { error: UNAUTHORIZED };

  const limit = await rateLimit(`calendar:event:recurrence-date:${gate.session.user.id}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.success) return { error: RATE_LIMITED };

  const parsed = recurrenceDateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: FIELD_ERRORS, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const target = await findEventTarget(parsed.data.eventId);
  if (!target || target.deletedAt) return { error: "Event not found" };
  const isOverride = rejectOverrideTarget(target);
  if (isOverride) return isOverride;
  if (target.rrule === null) return rejectUnrepeated("eventId");

  const role = await getCalendarRole(target.calendarId, gate.session.user.id);
  if (!canWriteCalendar(role)) return { error: role ? FORBIDDEN : "Event not found" };

  const rule = parseSubmittedRule(target.rrule);
  if ("fieldErrors" in rule || rule.data === null) {
    return { error: "This repeating event's rule could not be read." };
  }
  const parsedRule = rule.data;
  const civil = civilOf(target);
  const { eventId, kind, dateWall } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(calendarRecurrenceDates)
        .values({ eventId, kind, dateWall })
        .onConflictDoNothing();
      // Both kinds are emitted in the `.ics`, so both bump — an EXDATE that does not is an
      // occurrence the guest's client keeps showing.
      await tx
        .update(calendarEvents)
        .set({ sequence: sql`${calendarEvents.sequence} + 1` })
        .where(eq(calendarEvents.id, eventId));
      if (kind !== "rdate") return;

      // Read back inside the transaction, so the row just inserted is included and a
      // concurrent skip cannot be lost between the two statements.
      const rows = await tx
        .select({ kind: calendarRecurrenceDates.kind, dateWall: calendarRecurrenceDates.dateWall })
        .from(calendarRecurrenceDates)
        .where(eq(calendarRecurrenceDates.eventId, eventId));
      const partitioned = partitionRecurrenceDates(rows);
      if (partitioned.unknown.length > 0) {
        log.error("calendar.recurrence-date kind not recognised", {
          eventId,
          kinds: [...new Set(partitioned.unknown.map((row) => row.kind))],
        });
      }
      await tx
        .update(calendarEvents)
        .set(seriesColumns(parsedRule, civil, partitioned.rdates))
        .where(eq(calendarEvents.id, eventId));
    });
  } catch (error) {
    return mapWriteError(error, "Failed to update the repeating event.");
  }

  await enqueueSeriesUpdate(target.id, RECURRENCE_DATES_CHANGED.reasks);
  revalidatePath("/calendar");
  revalidatePath(`/calendar/event/${target.id}`);
  return { data: { eventId, kind } };
}
