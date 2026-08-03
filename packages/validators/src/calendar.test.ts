import { describe, expect, it } from "vitest";
import {
  ATTENDEE_RESPONSES,
  ATTENDEE_ROLES,
  ATTENDEE_STATUSES,
  attendeeInputSchema,
  CALENDAR_COLORS,
  createCalendarSchema,
  createEventSchema,
  deleteCalendarSchema,
  deleteEventSchema,
  EVENT_STATUSES,
  EVENT_TRANSPARENCIES,
  EVENT_VISIBILITIES,
  eventRangeSchema,
  localDateTimeSchema,
  MAX_ATTENDEES,
  MAX_RANGE_CALENDARS,
  MAX_RANGE_DAYS,
  MAX_RANGE_ROWS,
  REMINDER_ANCHORS,
  REMINDER_CHANNELS,
  REMINDER_SUBMITTABLE_ANCHORS,
  recurrenceDateSchema,
  reminderInputSchema,
  respondToEventSchema,
  rruleSchema,
  timeZoneSchema,
  updateCalendarSchema,
  updateEventSchema,
} from "./calendar";

const UUID = "3f1b0a5e-6b0e-4b0f-9a2a-1c2d3e4f5a6b";
const OTHER_UUID = "9c8d7e6f-5a4b-4c3d-8e2f-1a0b9c8d7e6f";

function firstMessage(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message;
}

function issuePaths(result: { success: false; error: { issues: { path: PropertyKey[] }[] } }) {
  return result.error.issues.map((issue) => issue.path.join("."));
}

const validEvent = {
  calendarId: UUID,
  title: "Standup",
  description: null,
  location: null,
  url: null,
  color: null,
  status: "confirmed",
  visibility: "default",
  transparency: "opaque",
  allDay: false,
  startWall: "2027-03-14 09:30:00",
  startTzid: "America/New_York",
  endWall: "2027-03-14 10:00:00",
  endTzid: "America/New_York",
  rrule: null,
} as const;

/** Scoped writes are both-or-neither; a one-off carries neither. */
const noScope = { scope: null, recurrenceId: null } as const;

const validCalendar = {
  name: "Work",
  description: null,
  color: "chart-1",
  timeZone: "America/New_York",
  isPrimary: false,
} as const;

describe("timeZoneSchema", () => {
  it("accepts the Area/Location form, including three-segment and sign-carrying ids", () => {
    expect(timeZoneSchema.parse("America/New_York")).toBe("America/New_York");
    expect(timeZoneSchema.parse(" Australia/Lord_Howe ")).toBe("Australia/Lord_Howe");
    expect(timeZoneSchema.safeParse("America/Argentina/Buenos_Aires").success).toBe(true);
    expect(timeZoneSchema.safeParse("Etc/GMT+5").success).toBe(true);
    // An alias carrying a slash still passes — canonicalizeTimeZone resolves it.
    expect(timeZoneSchema.safeParse("US/Eastern").success).toBe(true);
  });

  it("accepts bare UTC and nothing else without a slash", () => {
    expect(timeZoneSchema.safeParse("UTC").success).toBe(true);
    // The whole point of the grammar: Postgres reads this as UTC MINUS 5.
    expect(timeZoneSchema.safeParse("UTC+5").success).toBe(false);
    // Slashless legacy ids are rejected deliberately; no picker emits them.
    expect(timeZoneSchema.safeParse("GMT").success).toBe(false);
    expect(timeZoneSchema.safeParse("EST5EDT").success).toBe(false);
  });

  it("rejects empty, over-long and structurally wrong values", () => {
    expect(timeZoneSchema.safeParse("").success).toBe(false);
    expect(timeZoneSchema.safeParse("/New_York").success).toBe(false);
    expect(timeZoneSchema.safeParse("America/").success).toBe(false);
    expect(timeZoneSchema.safeParse(`America/${"x".repeat(70)}`).success).toBe(false);
    expect(timeZoneSchema.safeParse("A/B/C/D").success).toBe(false);
  });
});

describe("localDateTimeSchema", () => {
  it("normalises the datetime-local shape to the storage form", () => {
    // What <input type="datetime-local"> submits: T separator, no seconds.
    expect(localDateTimeSchema.parse("2027-03-14T09:30")).toBe("2027-03-14 09:30:00");
    expect(localDateTimeSchema.parse("2027-03-14T09:30:45")).toBe("2027-03-14 09:30:45");
    expect(localDateTimeSchema.parse("2027-03-14 09:30:00")).toBe("2027-03-14 09:30:00");
  });

  it("rejects anything that is not a wall-clock reading", () => {
    expect(localDateTimeSchema.safeParse("2027-03-14").success).toBe(false);
    expect(localDateTimeSchema.safeParse("2027-03-14T09:30:00Z").success).toBe(false);
    expect(localDateTimeSchema.safeParse("not a date").success).toBe(false);
  });

  it("is shape-only — impossible dates pass and are @repo/calendar's to reject", () => {
    // Documented division of labour: parseLocalDateTime inside deriveEventInstants
    // throws RangeError on these, so there is exactly one implementation of
    // "is this a real date" and it is the one with the 100% gate.
    expect(localDateTimeSchema.safeParse("2027-02-30T00:00").success).toBe(true);
    expect(localDateTimeSchema.safeParse("2027-03-14T24:00").success).toBe(true);
  });
});

describe("createCalendarSchema", () => {
  it("accepts a valid calendar", () => {
    expect(createCalendarSchema.parse(validCalendar)).toMatchObject({
      name: "Work",
      color: "chart-1",
      isPrimary: false,
    });
  });

  it("normalises a blank description to null and keeps a real one", () => {
    expect(createCalendarSchema.parse({ ...validCalendar, description: "   " }).description).toBe(
      null,
    );
    expect(createCalendarSchema.parse({ ...validCalendar, description: null }).description).toBe(
      null,
    );
    expect(createCalendarSchema.parse({ ...validCalendar, description: "Team" }).description).toBe(
      "Team",
    );
  });

  it("rejects a missing name, an over-long one, and an unknown colour", () => {
    expect(createCalendarSchema.safeParse({ ...validCalendar, name: "  " }).success).toBe(false);
    expect(
      createCalendarSchema.safeParse({ ...validCalendar, name: "x".repeat(101) }).success,
    ).toBe(false);
    expect(
      createCalendarSchema.safeParse({ ...validCalendar, description: "x".repeat(501) }).success,
    ).toBe(false);
    expect(createCalendarSchema.safeParse({ ...validCalendar, color: "chart-9" }).success).toBe(
      false,
    );
  });
});

describe("updateCalendarSchema / deleteCalendarSchema", () => {
  it("requires a uuid id on top of the create shape", () => {
    expect(updateCalendarSchema.parse({ ...validCalendar, id: UUID }).id).toBe(UUID);
    expect(updateCalendarSchema.safeParse({ ...validCalendar, id: "nope" }).success).toBe(false);
    expect(deleteCalendarSchema.parse({ id: UUID }).id).toBe(UUID);
    expect(deleteCalendarSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});

describe("createEventSchema", () => {
  it("accepts a valid timed event", () => {
    expect(createEventSchema.parse(validEvent)).toMatchObject({
      title: "Standup",
      startWall: "2027-03-14 09:30:00",
      allDay: false,
    });
  });

  it("carries independent start and end zones", () => {
    // A flight: departs 09:00 New York, arrives 11:30 Los Angeles. There is
    // deliberately no endWall >= startWall refinement, because as text that
    // comparison is wrong whenever the zones differ.
    const flight = createEventSchema.parse({
      ...validEvent,
      startWall: "2027-06-01T09:00",
      startTzid: "America/New_York",
      endWall: "2027-06-01T11:30",
      endTzid: "America/Los_Angeles",
    });
    expect(flight.endTzid).toBe("America/Los_Angeles");
  });

  it("normalises blank optional text to null", () => {
    const parsed = createEventSchema.parse({
      ...validEvent,
      description: "  ",
      location: "",
      url: "",
    });
    expect(parsed).toMatchObject({ description: null, location: null, url: null });
  });

  it("keeps populated optional text and validates the url", () => {
    const parsed = createEventSchema.parse({
      ...validEvent,
      description: "Notes",
      location: "Room 3",
      url: "https://example.com/meet",
      color: "chart-2",
    });
    expect(parsed).toMatchObject({
      description: "Notes",
      location: "Room 3",
      url: "https://example.com/meet",
      color: "chart-2",
    });
    expect(createEventSchema.safeParse({ ...validEvent, url: "not a url" }).success).toBe(false);
  });

  it("rejects an all-day event that does not sit on midnight, at the offending field", () => {
    // Mirrors calendar_events_all_day_midnight so the user sees a field message
    // instead of a bare SQLSTATE 23514.
    const both = createEventSchema.safeParse({
      ...validEvent,
      allDay: true,
      startWall: "2027-03-14T09:30",
      endWall: "2027-03-15T09:30",
    });
    expect(both.success).toBe(false);
    if (both.success) throw new Error("unreachable");
    expect(issuePaths(both)).toEqual(["startWall", "endWall"]);

    const startOnly = createEventSchema.safeParse({
      ...validEvent,
      allDay: true,
      startWall: "2027-03-14T09:30",
      endWall: "2027-03-15T00:00",
    });
    expect(startOnly.success).toBe(false);
    if (startOnly.success) throw new Error("unreachable");
    expect(issuePaths(startOnly)).toEqual(["startWall"]);

    const endOnly = createEventSchema.safeParse({
      ...validEvent,
      allDay: true,
      startWall: "2027-03-14T00:00",
      endWall: "2027-03-15T09:30",
    });
    expect(endOnly.success).toBe(false);
    if (endOnly.success) throw new Error("unreachable");
    expect(issuePaths(endOnly)).toEqual(["endWall"]);
  });

  it("accepts an all-day event with an EXCLUSIVE end on the next midnight", () => {
    // RFC 5545 DTEND semantics for DATE values: one all-day event on 2027-03-14
    // ends at 2027-03-15 00:00:00. The grid subtracts the day when painting.
    const parsed = createEventSchema.parse({
      ...validEvent,
      allDay: true,
      startWall: "2027-03-14T00:00",
      endWall: "2027-03-15T00:00",
    });
    expect(parsed.endWall).toBe("2027-03-15 00:00:00");
  });

  it("rejects a bad title, calendar id, status, visibility or transparency", () => {
    expect(createEventSchema.safeParse({ ...validEvent, title: " " }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...validEvent, title: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(createEventSchema.safeParse({ ...validEvent, calendarId: "nope" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...validEvent, status: "maybe" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...validEvent, visibility: "public" }).success).toBe(
      false,
    );
    expect(createEventSchema.safeParse({ ...validEvent, transparency: "busy" }).success).toBe(
      false,
    );
    expect(
      createEventSchema.safeParse({ ...validEvent, description: "x".repeat(5001) }).success,
    ).toBe(false);
    expect(createEventSchema.safeParse({ ...validEvent, location: "x".repeat(301) }).success).toBe(
      false,
    );
  });
});

describe("updateEventSchema / deleteEventSchema", () => {
  it("adds an id and keeps every create rule", () => {
    expect(updateEventSchema.parse({ ...validEvent, ...noScope, id: UUID }).id).toBe(UUID);
    expect(updateEventSchema.safeParse({ ...validEvent, ...noScope, id: "nope" }).success).toBe(
      false,
    );

    const badAllDay = updateEventSchema.safeParse({
      ...validEvent,
      ...noScope,
      id: UUID,
      allDay: true,
      startWall: "2027-03-14T09:30",
    });
    expect(badAllDay.success).toBe(false);
    if (badAllDay.success) throw new Error("unreachable");
    expect(issuePaths(badAllDay)).toContain("startWall");

    // Not all-day: the refinement returns early and adds nothing.
    expect(
      updateEventSchema.safeParse({ ...validEvent, ...noScope, id: UUID, allDay: false }).success,
    ).toBe(true);
  });

  it("takes a scope and the occurrence it names, both or neither", () => {
    const scoped = updateEventSchema.parse({
      ...validEvent,
      id: UUID,
      scope: "this",
      recurrenceId: "2027-03-14T09:30",
    });
    expect(scoped).toMatchObject({ scope: "this", recurrenceId: "2027-03-14 09:30:00" });

    // A scope with nothing to apply it to cannot name an occurrence...
    const noOccurrence = updateEventSchema.safeParse({
      ...validEvent,
      id: UUID,
      scope: "all",
      recurrenceId: null,
    });
    expect(noOccurrence.success).toBe(false);
    if (noOccurrence.success) throw new Error("unreachable");
    expect(issuePaths(noOccurrence)).toContain("recurrenceId");

    // ...and an occurrence with no scope does not say what to do with it. Defaulting
    // either is how "edit this occurrence" quietly becomes "edit the whole series".
    const noVerb = updateEventSchema.safeParse({
      ...validEvent,
      id: UUID,
      scope: null,
      recurrenceId: "2027-03-14 09:30:00",
    });
    expect(noVerb.success).toBe(false);
    if (noVerb.success) throw new Error("unreachable");
    expect(issuePaths(noVerb)).toContain("scope");
  });

  it("refuses a repeat rule on a single occurrence, at the rrule field", () => {
    const result = updateEventSchema.safeParse({
      ...validEvent,
      id: UUID,
      scope: "this",
      recurrenceId: "2027-03-14 09:30:00",
      rrule: "FREQ=WEEKLY",
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(issuePaths(result)).toContain("rrule");
  });

  it("requires a uuid to delete", () => {
    expect(deleteEventSchema.parse({ id: UUID, ...noScope }).id).toBe(UUID);
    expect(deleteEventSchema.safeParse({ id: "nope", ...noScope }).success).toBe(false);
  });
});

describe("eventRangeSchema", () => {
  const DAY = 86_400_000;

  it("accepts a month-sized window over a handful of calendars", () => {
    expect(
      eventRangeSchema.parse({ calendarIds: [UUID, OTHER_UUID], fromMs: 0, toMs: 31 * DAY }),
    ).toMatchObject({ fromMs: 0, toMs: 31 * DAY });
  });

  it("rejects a window that does not move forward", () => {
    const equal = eventRangeSchema.safeParse({ calendarIds: [UUID], fromMs: 10, toMs: 10 });
    expect(equal.success).toBe(false);
    if (equal.success) throw new Error("unreachable");
    expect(firstMessage(equal)).toBe("The window must end after it starts");
    expect(issuePaths(equal)).toEqual(["toMs"]);

    const backwards = eventRangeSchema.safeParse({ calendarIds: [UUID], fromMs: 10, toMs: 9 });
    expect(backwards.success).toBe(false);
    if (backwards.success) throw new Error("unreachable");
    // The reversed check returns early, so exactly one issue — not a length complaint too.
    expect(backwards.error.issues).toHaveLength(1);
  });

  it("caps the window at MAX_RANGE_DAYS", () => {
    expect(
      eventRangeSchema.safeParse({ calendarIds: [UUID], fromMs: 0, toMs: MAX_RANGE_DAYS * DAY })
        .success,
    ).toBe(true);
    const tooWide = eventRangeSchema.safeParse({
      calendarIds: [UUID],
      fromMs: 0,
      toMs: MAX_RANGE_DAYS * DAY + 1,
    });
    expect(tooWide.success).toBe(false);
    if (tooWide.success) throw new Error("unreachable");
    expect(firstMessage(tooWide)).toBe(`The window must be ${MAX_RANGE_DAYS} days or fewer`);
  });

  it("caps the calendar list and requires at least one", () => {
    expect(eventRangeSchema.safeParse({ calendarIds: [], fromMs: 0, toMs: DAY }).success).toBe(
      false,
    );
    const many = Array.from({ length: MAX_RANGE_CALENDARS + 1 }, () => UUID);
    expect(eventRangeSchema.safeParse({ calendarIds: many, fromMs: 0, toMs: DAY }).success).toBe(
      false,
    );
    expect(
      eventRangeSchema.safeParse({ calendarIds: [UUID], fromMs: 0.5, toMs: DAY }).success,
    ).toBe(false);
  });

  it("exposes the row cap the router enforces", () => {
    expect(MAX_RANGE_ROWS).toBe(2000);
  });
});

describe("the duplicated unions", () => {
  it("holds the members @repo/db declares", () => {
    // The cross-package assertion lives in apps/web/src/lib/union-parity.test.ts, which
    // can import both. This one only pins the literal text so a typo here is caught even
    // in isolation.
    expect(CALENDAR_COLORS).toEqual(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]);
    expect(EVENT_STATUSES).toEqual(["confirmed", "tentative", "cancelled"]);
    expect(EVENT_VISIBILITIES).toEqual(["default", "private"]);
    expect(EVENT_TRANSPARENCIES).toEqual(["opaque", "transparent"]);
    expect(ATTENDEE_ROLES).toEqual(["organizer", "required", "optional"]);
    expect(ATTENDEE_STATUSES).toEqual(["needs-action", "accepted", "declined", "tentative"]);
  });
});

describe("attendeeInputSchema", () => {
  it("normalises case and surrounding whitespace before validating", () => {
    // The ordering is the whole point: `z.email().trim().toLowerCase()` reads the same
    // and rejects this input, because zod 4 runs the format check in chain order. A chip
    // field is exactly where a pasted address arrives padded.
    const parsed = attendeeInputSchema.safeParse({ email: "  Guest@Example.COM  " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("unreachable");
    expect(parsed.data.email).toBe("guest@example.com");
  });

  it("defaults the role to the column default and accepts the other two", () => {
    const parsed = attendeeInputSchema.parse({ email: "guest@example.com" });
    expect(parsed.role).toBe("required");
    expect(attendeeInputSchema.parse({ email: "a@b.co", role: "optional" }).role).toBe("optional");
    expect(attendeeInputSchema.parse({ email: "a@b.co", role: "organizer" }).role).toBe(
      "organizer",
    );
    expect(attendeeInputSchema.safeParse({ email: "a@b.co", role: "chair" }).success).toBe(false);
  });

  it("rejects something that is not an address", () => {
    const parsed = attendeeInputSchema.safeParse({ email: "not-an-address" });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("unreachable");
    expect(firstMessage(parsed)).toBe("Enter a valid email address");
  });
});

describe("attendees on an event", () => {
  it("defaults to an empty list, so an unattended event needs no key", () => {
    const parsed = createEventSchema.parse(validEvent);
    expect(parsed.attendees).toEqual([]);
  });

  it("carries a normalised list through", () => {
    const parsed = createEventSchema.parse({
      ...validEvent,
      attendees: [{ email: "Guest@Example.com" }, { email: "other@example.com", role: "optional" }],
    });
    expect(parsed.attendees).toEqual([
      { email: "guest@example.com", role: "required" },
      { email: "other@example.com", role: "optional" },
    ]);
  });

  it("caps the list at MAX_ATTENDEES so one action cannot fan out a mailing list", () => {
    const tooMany = Array.from({ length: MAX_ATTENDEES + 1 }, (_, i) => ({
      email: `guest${i}@example.com`,
    }));
    expect(createEventSchema.safeParse({ ...validEvent, attendees: tooMany }).success).toBe(false);
    const atCap = tooMany.slice(0, MAX_ATTENDEES);
    expect(createEventSchema.safeParse({ ...validEvent, attendees: atCap }).success).toBe(true);
  });

  it("reports a bad member at its own index, so a form can mark the right chip", () => {
    const parsed = createEventSchema.safeParse({
      ...validEvent,
      attendees: [{ email: "fine@example.com" }, { email: "nope" }],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("unreachable");
    expect(issuePaths(parsed)).toContain("attendees.1.email");
  });

  it("is on the update shape too", () => {
    const parsed = updateEventSchema.parse({
      ...validEvent,
      ...noScope,
      id: OTHER_UUID,
      attendees: [{ email: "guest@example.com" }],
    });
    expect(parsed.attendees).toEqual([{ email: "guest@example.com", role: "required" }]);
  });
});

describe("respondToEventSchema", () => {
  it("accepts the three answerable statuses", () => {
    for (const status of ATTENDEE_RESPONSES) {
      expect(respondToEventSchema.safeParse({ eventId: UUID, status, comment: null }).success).toBe(
        true,
      );
    }
  });

  it("refuses needs-action, which no control offers", () => {
    // Not pedantry: `calendar_event_attendees_responded_pair` requires `responded_at IS
    // NULL` exactly when the status is `needs-action`, so a submitted one alongside the
    // `responded_at` stamp the action writes would raise 23514 and surface as the generic
    // write error. Narrowing here makes that path unreachable.
    expect(
      respondToEventSchema.safeParse({ eventId: UUID, status: "needs-action", comment: null })
        .success,
    ).toBe(false);
  });

  it("covers every column status between the two lists, exhaustively", () => {
    // A fifth status added to the column forces a decision here rather than silently
    // arriving unanswerable.
    expect([...ATTENDEE_RESPONSES, "needs-action"].sort()).toEqual([...ATTENDEE_STATUSES].sort());
  });

  it("normalises a blank comment to null and caps a real one", () => {
    const blank = respondToEventSchema.parse({ eventId: UUID, status: "accepted", comment: "  " });
    expect(blank.comment).toBeNull();
    const kept = respondToEventSchema.parse({
      eventId: UUID,
      status: "declined",
      comment: "  Sorry, double-booked.  ",
    });
    expect(kept.comment).toBe("Sorry, double-booked.");
    const tooLong = respondToEventSchema.safeParse({
      eventId: UUID,
      status: "tentative",
      comment: "x".repeat(501),
    });
    expect(tooLong.success).toBe(false);
  });

  it("requires a uuid event id", () => {
    expect(
      respondToEventSchema.safeParse({ eventId: "nope", status: "accepted", comment: null })
        .success,
    ).toBe(false);
  });
});

describe("rruleSchema", () => {
  it("accepts a rule's SHAPE and leaves its meaning to @repo/calendar", () => {
    expect(rruleSchema.parse(" FREQ=WEEKLY;BYDAY=MO ")).toBe("FREQ=WEEKLY;BYDAY=MO");
    // Deliberately accepted here and rejected by parseRRule: COUNT with UNTIL, and a
    // BYDAY that is not a weekday. One implementation of "is this a real rule", and it
    // is the one with the 100% gate and a 528-rule differential corpus behind it.
    expect(rruleSchema.safeParse("FREQ=WEEKLY;COUNT=2;UNTIL=20270401T130000Z").success).toBe(true);
    expect(rruleSchema.safeParse("FREQ=WEEKLY;BYDAY=XX").success).toBe(true);
  });

  it("rejects the shapes a form can show a message for", () => {
    expect(rruleSchema.safeParse("").success).toBe(false);
    expect(rruleSchema.safeParse("not a rule").success).toBe(false);
    expect(rruleSchema.safeParse("BYDAY=MO").success).toBe(false);
    expect(firstMessage(rruleSchema.safeParse("BYDAY=MO") as never)).toMatch(/needs a FREQ/);
    expect(rruleSchema.safeParse(`FREQ=WEEKLY;X=${"y".repeat(520)}`).success).toBe(false);
  });

  it("is nullable on an event, because most events do not repeat", () => {
    expect(createEventSchema.parse({ ...validEvent, rrule: "FREQ=WEEKLY" }).rrule).toBe(
      "FREQ=WEEKLY",
    );
    expect(createEventSchema.parse(validEvent).rrule).toBe(null);
  });
});

describe("recurrenceDateSchema", () => {
  it("normalises the wall reading and constrains the kind", () => {
    expect(
      recurrenceDateSchema.parse({ eventId: UUID, kind: "exdate", dateWall: "2027-03-14T09:30" }),
    ).toEqual({ eventId: UUID, kind: "exdate", dateWall: "2027-03-14 09:30:00" });
    expect(
      recurrenceDateSchema.safeParse({
        eventId: UUID,
        kind: "rdate",
        dateWall: "2027-03-14 09:30:00",
      }).success,
    ).toBe(true);
    expect(
      recurrenceDateSchema.safeParse({
        eventId: UUID,
        kind: "nope",
        dateWall: "2027-03-14 09:30:00",
      }).success,
    ).toBe(false);
    expect(
      recurrenceDateSchema.safeParse({
        eventId: "nope",
        kind: "exdate",
        dateWall: "2027-03-14 09:30:00",
      }).success,
    ).toBe(false);
  });
});

describe("reminderInputSchema", () => {
  it("defaults the anchor, so a surface offering only 'before start' may omit it", () => {
    const parsed = reminderInputSchema.parse({ channel: "email", offsetMinutes: -15 });
    expect(parsed.anchor).toBe("start");
  });

  it("accepts both channels", () => {
    for (const channel of REMINDER_CHANNELS) {
      expect(reminderInputSchema.safeParse({ channel, offsetMinutes: -15 }).success).toBe(true);
    }
  });

  it("refuses the end anchor, which the column CHECK also refuses", () => {
    // Not pedantry: `calendar_event_reminders_anchor_supported` rejects it, so a submitted
    // 'end' would raise 23514 and surface as the generic write error. The CHECK exists
    // because `expandSeries` windows on an occurrence's START instant by default, which
    // is the mode the reminder sweeper takes — an end-anchored
    // reminder on a recurring series would silently never fire. Narrowing here turns a
    // database error into a field error.
    expect(
      reminderInputSchema.safeParse({ channel: "email", anchor: "end", offsetMinutes: -15 })
        .success,
    ).toBe(false);
  });

  it("covers every column anchor between the two lists, exhaustively", () => {
    // Phase 6 widening the column forces a decision here rather than silently leaving a
    // member unsubmittable with no note saying why.
    expect([...REMINDER_SUBMITTABLE_ANCHORS, "end"].sort()).toEqual([...REMINDER_ANCHORS].sort());
  });

  it("takes both signs — negative is before, positive is after", () => {
    expect(
      reminderInputSchema.parse({ channel: "email", offsetMinutes: -1440 }).offsetMinutes,
    ).toBe(-1440);
    expect(reminderInputSchema.parse({ channel: "in-app", offsetMinutes: 10 }).offsetMinutes).toBe(
      10,
    );
  });

  it("refuses a fractional offset rather than letting the driver truncate it", () => {
    expect(reminderInputSchema.safeParse({ channel: "email", offsetMinutes: -15.5 }).success).toBe(
      false,
    );
  });

  it("mirrors the column's ±366-day bound", () => {
    expect(
      reminderInputSchema.safeParse({ channel: "email", offsetMinutes: -527_040 }).success,
    ).toBe(true);
    expect(
      reminderInputSchema.safeParse({ channel: "email", offsetMinutes: -527_041 }).success,
    ).toBe(false);
    expect(
      reminderInputSchema.safeParse({ channel: "email", offsetMinutes: 527_041 }).success,
    ).toBe(false);
  });
});
