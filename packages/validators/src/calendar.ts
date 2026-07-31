import { z } from "zod";

/**
 * Calendar + event input schemas — shared by the client composer (React Hook Form)
 * and the server (Server Actions, tRPC input).
 *
 * Its own subpath (`@repo/validators/calendar`) rather than more surface on the
 * barrel: the calendar is one bounded subsystem out of many, and a client bundle
 * that imports `signInSchema` should not pull the event model in with it.
 *
 * Same DB-free posture as the barrel — no `@repo/db`, no `@repo/calendar`. The
 * literal unions below are therefore **duplicated** from their canonical home in
 * `@repo/db/schema`, which is the shape that silently drops notifications today
 * (`NOTIFICATION_TYPES` in `index.ts` vs `notifications.ts`, where the consumer
 * `safeParse`s and fails closed with no log). A parity test in `apps/web` — which
 * legitimately depends on both packages — asserts member-for-member equality, so
 * adding a status here and forgetting the schema goes red at the gate instead of
 * at 2 a.m. See `apps/web/src/lib/calendar/union-parity.test.ts`.
 */

// --- Unions duplicated from @repo/db/schema (canonical source) ---------------

/** Mirrors `CALENDAR_COLORS` in `@repo/db/schema/calendars.ts`. */
export const CALENDAR_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

/** Mirrors `EVENT_STATUSES` in `@repo/db/schema/calendar-events.ts`. */
export const EVENT_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Mirrors `EVENT_VISIBILITIES`. No `"public"` member — see that file for why. */
export const EVENT_VISIBILITIES = ["default", "private"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** Mirrors `EVENT_TRANSPARENCIES`. */
export const EVENT_TRANSPARENCIES = ["opaque", "transparent"] as const;
export type EventTransparency = (typeof EVENT_TRANSPARENCIES)[number];

/** Mirrors `RECURRENCE_DATE_KINDS` in `@repo/db/schema/calendar-recurrence-dates.ts`. */
export const RECURRENCE_DATE_KINDS = ["exdate", "rdate"] as const;
export type RecurrenceDateKind = (typeof RECURRENCE_DATE_KINDS)[number];

// --- Action-only unions (no DB column, so no parity row) ----------------------

/**
 * Which occurrences an edit or a delete applies to.
 *
 * Deliberately **not** in the parity test: that test asserts what the database also
 * declares, and a row for a union no column carries would teach the wrong rule about
 * what parity means.
 */
export const EDIT_SCOPES = ["this", "thisAndFollowing", "all"] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];

// --- Primitives --------------------------------------------------------------

/**
 * IANA zone id, constrained to the `Area/Location` form plus an explicit `UTC`.
 *
 * Deliberately narrower than what either engine accepts, because they do not
 * accept the same things. Postgres's `AT TIME ZONE` also takes POSIX specs whose
 * sign is **inverted** (`'UTC+5'` means UTC−5), while `canonicalizeTimeZone` in
 * `@repo/calendar` accepts aliases and abbreviations by design. Requiring a slash
 * closes the overlap where the two would disagree about the same string, at the
 * cost of rejecting the slashless legacy ids (`GMT`, `EST5EDT`, `Zulu`) — none of
 * which any picker emits, and `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * never returns. Aliases that carry a slash (`US/Eastern`) still pass.
 *
 * Shape only. Whether the runtime *knows* the zone is the caller's job, via
 * `canonicalizeTimeZone` — this package must stay free of `@repo/calendar`.
 */
const TZID_PATTERN = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2})$/;

export const timeZoneSchema = z
  .string()
  .trim()
  .max(64, "Time zone must be 64 characters or fewer")
  .regex(TZID_PATTERN, "Choose a time zone in Area/Location form, e.g. America/New_York");

/**
 * A wall-clock reading, normalised to the storage form `"YYYY-MM-DD HH:MM:SS"` —
 * what `formatLocalDateTime` emits and what Postgres renders for
 * `timestamp(0) without time zone`.
 *
 * Accepts the `T` separator and a missing `:SS` because that is exactly what
 * `<input type="datetime-local">` submits, and normalises both away so nothing
 * downstream has to care which shape arrived.
 *
 * Shape only, again: February 30 and hour 24 match this regex and are rejected by
 * `parseLocalDateTime` inside `deriveEventInstants`, which throws `RangeError` at
 * the action boundary. Reimplementing the calendar arithmetic here to fail one
 * step earlier would mean two implementations of "is this a real date", and the
 * one in `@repo/calendar` is the one with the 100% gate on it.
 */
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/;

export const localDateTimeSchema = z
  .string()
  .trim()
  .regex(LOCAL_DATE_TIME_PATTERN, "Enter a date and time")
  .transform((value) => `${value.length === 16 ? `${value}:00` : value}`.replace("T", " "));

/**
 * An `RRULE` value — **shape only**, exactly like `localDateTimeSchema` above.
 *
 * What a rule *means* is `parseRRule`'s in `@repo/calendar`, which is the grammar's one
 * owner; reimplementing RFC 5545 here would be a second answer, and the one over there
 * is the one with the 100% gate and a 528-rule differential corpus behind it. This
 * catches the shapes a form can show a message for — empty, absurdly long, not
 * `NAME=VALUE` pairs, no `FREQ` — and the action attributes everything else to the
 * `rrule` field by catching `parseRRule`'s `RangeError`, the way `deriveTimes` already
 * does for zones and wall readings.
 */
const RRULE_PATTERN = /^[A-Za-z]+=[^;=]+(?:;[A-Za-z]+=[^;=]+)*;?$/;

export const rruleSchema = z
  .string()
  .trim()
  .max(512, "That recurrence rule is too long")
  .regex(RRULE_PATTERN, "That isn't a recurrence rule")
  .refine((value) => /(^|;)FREQ=/i.test(value), "A recurrence rule needs a FREQ");

const MIDNIGHT_SUFFIX = " 00:00:00";

/**
 * A trimmed empty string is the browser's way of saying "absent", and these columns
 * are nullable. Normalising here keeps `""` out of the database, where it renders as
 * an empty paragraph rather than as nothing.
 */
const emptyToNull = (value: string | null): string | null =>
  value === null || value === "" ? null : value;

// --- Calendars ---------------------------------------------------------------

export const createCalendarSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer")
    .nullable()
    .transform(emptyToNull),
  color: z.enum(CALENDAR_COLORS, { message: "Choose a colour" }),
  timeZone: timeZoneSchema,
  /**
   * Promoting a calendar to primary demotes the current one. `calendars_one_primary_idx`
   * is a unique index, so the two writes must share a transaction or the swap can
   * fail against itself.
   */
  isPrimary: z.boolean(),
});

export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;

export const updateCalendarSchema = createCalendarSchema.extend({
  id: z.uuid("Calendar id is required"),
});

export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

export const deleteCalendarSchema = z.object({
  id: z.uuid("Calendar id is required"),
});

export type DeleteCalendarInput = z.infer<typeof deleteCalendarSchema>;

// --- Events ------------------------------------------------------------------

/**
 * Start and end carry **independent** zones, so a flight departs 09:00 New York
 * and arrives 11:30 Los Angeles.
 *
 * There is deliberately no `endWall >= startWall` refinement here: with two zones
 * in play that comparison is meaningless as text (11:30 Los Angeles is *after*
 * 09:00 New York by 5h30, not 2h). Ordering is a fact about **instants**, so it is
 * checked after `deriveEventInstants` in the action and enforced for good by
 * `calendar_events_end_not_before_start`.
 *
 * **All-day ends are EXCLUSIVE** — RFC 5545's `DTEND` convention for `DATE`
 * values. A single all-day event on 2027-03-14 stores `end_wall` = 2027-03-15
 * 00:00:00. The grid subtracts a day when painting, and Phase 4 emits the stored
 * value verbatim. Storing an inclusive end instead would make every ICS export
 * one day short and give zero-length events, and the failure would only show up
 * in someone else's calendar client.
 */
const eventFields = {
  calendarId: z.uuid("Choose a calendar"),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .nullable()
    .transform(emptyToNull),
  location: z
    .string()
    .trim()
    .max(300, "Location must be 300 characters or fewer")
    .nullable()
    .transform(emptyToNull),
  url: z
    .union([z.url("Enter a valid URL"), z.literal("")])
    .nullable()
    .transform(emptyToNull),
  /** `null` inherits the calendar's colour — a distinct intent from picking one. */
  color: z.enum(CALENDAR_COLORS).nullable(),
  status: z.enum(EVENT_STATUSES),
  visibility: z.enum(EVENT_VISIBILITIES),
  transparency: z.enum(EVENT_TRANSPARENCIES),
  allDay: z.boolean(),
  startWall: localDateTimeSchema,
  startTzid: timeZoneSchema,
  endWall: localDateTimeSchema,
  endTzid: timeZoneSchema,
  /** `null` = a one-off. Only a series master ever carries one. */
  rrule: rruleSchema.nullable(),
} as const;

/**
 * `calendar_events_all_day_midnight` enforces this in the database. Repeating it
 * here is what turns a bare SQLSTATE 23514 into a message under the right field —
 * and the issue is raised AT that field's path, because `zodFieldErrors` drops
 * form-level issues (empty `path`) on the floor.
 *
 * Returned as data rather than written straight into a `ctx` so create and update
 * share one implementation without either sharing a Zod-internal context type.
 */
function allDayMidnightIssues(value: {
  readonly allDay: boolean;
  readonly startWall: string;
  readonly endWall: string;
}): Array<{ path: ["startWall"] | ["endWall"]; message: string }> {
  if (!value.allDay) return [];
  const message = "An all-day event must start and end at midnight";
  const issues: Array<{ path: ["startWall"] | ["endWall"]; message: string }> = [];
  if (!value.startWall.endsWith(MIDNIGHT_SUFFIX)) issues.push({ path: ["startWall"], message });
  if (!value.endWall.endsWith(MIDNIGHT_SUFFIX)) issues.push({ path: ["endWall"], message });
  return issues;
}

export const createEventSchema = z.object(eventFields).superRefine((value, ctx) => {
  for (const issue of allDayMidnightIssues(value)) ctx.addIssue({ code: "custom", ...issue });
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * Which occurrence a scoped write acts on.
 *
 * Both-or-neither, and refused rather than defaulted: a `scope` with no
 * `recurrenceId` cannot name an occurrence, and a `recurrenceId` with no `scope`
 * doesn't say what to do with it. Silently defaulting either one is how "edit this
 * occurrence" quietly becomes "edit the whole series".
 *
 * `id` is **always the series master's id** — never an override's. The grid renders
 * virtual occurrences and materialised overrides as identical chips, and both ids are
 * `uuid`, so nothing in the type system distinguishes them; the action resolves the
 * override row itself and rejects an `id` that is already one. See
 * docs/context/calendar/api.md → the occurrence-identity contract.
 */
const scopeFields = {
  scope: z.enum(EDIT_SCOPES).nullable(),
  recurrenceId: localDateTimeSchema.nullable(),
} as const;

function scopePairIssues(value: {
  readonly scope: EditScope | null;
  readonly recurrenceId: string | null;
}): Array<{ path: ["scope"] | ["recurrenceId"]; message: string }> {
  if (value.scope !== null && value.recurrenceId === null) {
    return [{ path: ["recurrenceId"], message: "Which occurrence did you mean?" }];
  }
  if (value.scope === null && value.recurrenceId !== null) {
    return [{ path: ["scope"], message: "Choose which occurrences this applies to" }];
  }
  return [];
}

export const updateEventSchema = z
  .object({ ...eventFields, ...scopeFields, id: z.uuid("Event id is required") })
  .superRefine((value, ctx) => {
    for (const issue of allDayMidnightIssues(value)) ctx.addIssue({ code: "custom", ...issue });
    for (const issue of scopePairIssues(value)) ctx.addIssue({ code: "custom", ...issue });
    // An override may not itself recur — `calendar_events_override_not_recurring`
    // enforces it, and repeating it here turns a bare SQLSTATE 23514 into a sentence.
    if (value.scope === "this" && value.rrule !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["rrule"],
        message: "A single occurrence cannot have its own repeat rule",
      });
    }
  });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const deleteEventSchema = z.object({
  id: z.uuid("Event id is required"),
  ...scopeFields,
});

export type DeleteEventInput = z.infer<typeof deleteEventSchema>;

/** Skip an occurrence (`exdate`) or add one (`rdate`). */
export const recurrenceDateSchema = z.object({
  eventId: z.uuid("Event id is required"),
  kind: z.enum(RECURRENCE_DATE_KINDS),
  dateWall: localDateTimeSchema,
});

export type RecurrenceDateInput = z.infer<typeof recurrenceDateSchema>;
export type RecurrenceDateValues = z.input<typeof recurrenceDateSchema>;

/**
 * The **pre-transform** shapes — what a form holds and what a Server Action receives,
 * as opposed to the `…Input` types above, which are what the schema produces. They
 * differ in exactly the places that matter at a call site: `startWall` may still
 * carry a `T` separator and no seconds, and the optional text fields may still be
 * `""`. React Hook Form and the action parameters take these.
 */
export type CreateCalendarValues = z.input<typeof createCalendarSchema>;
export type UpdateCalendarValues = z.input<typeof updateCalendarSchema>;
export type CreateEventValues = z.input<typeof createEventSchema>;
export type UpdateEventValues = z.input<typeof updateEventSchema>;

// --- Reads -------------------------------------------------------------------

/** Above this, a month view is not what the caller is building. */
export const MAX_RANGE_CALENDARS = 20;
/** Just over a year, so a "whole year" view fits in one call and nothing else does. */
export const MAX_RANGE_DAYS = 400;
/**
 * Hard row cap. The response carries `truncated: true` rather than silently
 * returning a short list — a month that quietly loses its 2,001st event is the
 * failure mode this exists to make visible.
 */
export const MAX_RANGE_ROWS = 2000;

const MS_PER_DAY = 86_400_000;

/**
 * Instants are epoch **milliseconds** on every boundary in this subsystem
 * (`packages/calendar/AGENTS.md`), so the window is two numbers, not two `Date`s.
 */
export const eventRangeSchema = z
  .object({
    calendarIds: z
      .array(z.uuid())
      .min(1, "Select at least one calendar")
      .max(MAX_RANGE_CALENDARS, `Select ${MAX_RANGE_CALENDARS} calendars or fewer`),
    fromMs: z.number().int(),
    toMs: z.number().int(),
  })
  .superRefine((value, ctx) => {
    if (value.toMs <= value.fromMs) {
      ctx.addIssue({
        code: "custom",
        path: ["toMs"],
        message: "The window must end after it starts",
      });
      return;
    }
    if (value.toMs - value.fromMs > MAX_RANGE_DAYS * MS_PER_DAY) {
      ctx.addIssue({
        code: "custom",
        path: ["toMs"],
        message: `The window must be ${MAX_RANGE_DAYS} days or fewer`,
      });
    }
  });

export type EventRangeInput = z.infer<typeof eventRangeSchema>;
