import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked: the session gate, the limiter, the ACL, the active-org read, the DB, and
// the Next cache/header primitives. Left REAL and unmocked: `@repo/validators/calendar`
// and `@repo/calendar` — both pure, and both are the things whose behaviour these
// tests are actually asserting through the action.
const {
  getSessionApi,
  rateLimit,
  getCalendarRole,
  getActiveOrganizationId,
  dbInsert,
  dbUpdate,
  dbDelete,
  dbTransaction,
  findCalendar,
  findEvent,
  revalidatePath,
  logError,
} = vi.hoisted(() => ({
  getSessionApi: vi.fn(),
  rateLimit: vi.fn(),
  getCalendarRole: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  dbDelete: vi.fn(),
  dbTransaction: vi.fn(),
  findCalendar: vi.fn(),
  findEvent: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: getSessionApi } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/organization", () => ({ getActiveOrganizationId }));
vi.mock("@repo/db", () => ({
  db: {
    insert: dbInsert,
    update: dbUpdate,
    delete: dbDelete,
    transaction: dbTransaction,
    query: {
      calendars: { findFirst: findCalendar },
      calendarEvents: { findFirst: findEvent },
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@logtail/next", () => ({
  log: { error: logError, warn: vi.fn(), info: vi.fn() },
}));

// The ACL predicates stay real — they are pure and their thresholds are the thing
// the authorization branches below depend on.
vi.mock("@/lib/calendar-acl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calendar-acl")>();
  return { ...actual, getCalendarRole };
});

import {
  createCalendar,
  createEvent,
  deleteCalendar,
  deleteEvent,
  updateCalendar,
  updateEvent,
} from "./calendar";

const CAL = "3f1b0a5e-6b0e-4b0f-9a2a-1c2d3e4f5a6b";
const OTHER_CAL = "9c8d7e6f-5a4b-4c3d-8e2f-1a0b9c8d7e6f";
const EVENT = "11111111-2222-4333-8444-555555555555";
const SESSION = { user: { id: "u1" } };

const calendarInput = {
  name: "Work",
  description: null,
  color: "chart-1",
  timeZone: "America/New_York",
  isPrimary: false,
} as const;

const eventInput = {
  calendarId: CAL,
  title: "Standup",
  description: null,
  location: null,
  url: null,
  color: null,
  status: "confirmed",
  visibility: "default",
  transparency: "opaque",
  allDay: false,
  startWall: "2027-03-15 09:00:00",
  startTzid: "America/New_York",
  endWall: "2027-03-15 09:30:00",
  endTzid: "America/New_York",
  rrule: null,
} as const;

/** Scoped writes are both-or-neither; a one-off carries neither. */
const noScope = { scope: null, recurrenceId: null } as const;

/** `db.insert(...).values(...).returning(...)` resolving to `rows`. */
function insertReturning(rows: unknown[]) {
  return { values: () => ({ returning: () => Promise.resolve(rows) }) };
}

function updateReturning(rows: unknown[]) {
  return { set: () => ({ where: () => ({ returning: () => Promise.resolve(rows) }) }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionApi.mockResolvedValue(SESSION);
  rateLimit.mockResolvedValue({ success: true });
  getCalendarRole.mockResolvedValue("owner");
  getActiveOrganizationId.mockResolvedValue(null);
  findCalendar.mockResolvedValue({ organizationId: null });
  findEvent.mockResolvedValue({ id: EVENT, calendarId: CAL, deletedAt: null });
  dbInsert.mockReturnValue(insertReturning([{ id: EVENT, calendarId: CAL }]));
  dbUpdate.mockReturnValue(updateReturning([{ id: EVENT, calendarId: CAL }]));
  dbDelete.mockReturnValue({ where: () => Promise.resolve() });
  // The default transaction just runs the callback against a tx that behaves like db.
  dbTransaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      await callback({
        insert: () => insertReturning([{ id: CAL, name: "Work" }]),
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      }),
  );
});

describe("the shared gates", () => {
  it("refuses every action without a session", async () => {
    getSessionApi.mockResolvedValue(null);
    expect(await createCalendar(calendarInput)).toEqual({ error: "Unauthorized" });
    expect(await updateCalendar({ ...calendarInput, id: CAL })).toEqual({ error: "Unauthorized" });
    expect(await deleteCalendar({ id: CAL })).toEqual({ error: "Unauthorized" });
    expect(await createEvent(eventInput)).toEqual({ error: "Unauthorized" });
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      error: "Unauthorized",
    });
    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({ error: "Unauthorized" });
  });

  it("refuses a rate-limited caller before touching the database", async () => {
    rateLimit.mockResolvedValue({ success: false });
    const result = await createCalendar(calendarInput);
    expect(result).toEqual({ error: "Too many requests. Please wait a moment and try again." });
    expect(dbTransaction).not.toHaveBeenCalled();

    expect(await updateCalendar({ ...calendarInput, id: CAL })).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
    expect(await createEvent(eventInput)).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
  });
});

describe("createCalendar", () => {
  it("creates and revalidates", async () => {
    const result = await createCalendar(calendarInput);
    expect(result).toEqual({ data: { id: CAL, name: "Work" } });
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("returns per-field errors for bad input", async () => {
    const result = await createCalendar({ ...calendarInput, name: "  " });
    expect(result).toMatchObject({
      error: "Please fix the fields below.",
      fieldErrors: { name: expect.any(String) },
    });
  });

  it("rejects a zone the runtime does not know, under the timeZone field", async () => {
    // The grammar passes (Area/Location) but the runtime has never heard of it —
    // the reason the action checks canonicalizeTimeZone on top of the schema.
    const result = await createCalendar({ ...calendarInput, timeZone: "Mars/Olympus_Mons" });
    expect(result).toMatchObject({ fieldErrors: { timeZone: expect.any(String) } });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("demotes the incumbent primary inside the same transaction", async () => {
    const updates: unknown[] = [];
    dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        insert: () => insertReturning([{ id: CAL, name: "Work" }]),
        update: () => {
          updates.push("demote");
          return { set: () => ({ where: () => Promise.resolve() }) };
        },
      }),
    );
    await createCalendar({ ...calendarInput, isPrimary: true });
    expect(updates).toEqual(["demote"]);
  });

  it("does not demote anything when the new calendar is not primary", async () => {
    const updates: unknown[] = [];
    dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        insert: () => insertReturning([{ id: CAL, name: "Work" }]),
        update: () => {
          updates.push("demote");
          return { set: () => ({ where: () => Promise.resolve() }) };
        },
      }),
    );
    await createCalendar(calendarInput);
    expect(updates).toEqual([]);
  });

  it("scopes the demote to the active organization when there is one", async () => {
    getActiveOrganizationId.mockResolvedValue("org-1");
    await createCalendar({ ...calendarInput, isPrimary: true });
    expect(getActiveOrganizationId).toHaveBeenCalled();
  });

  it("maps a write failure to a form-level error", async () => {
    dbTransaction.mockRejectedValue(new Error("boom"));
    expect(await createCalendar(calendarInput)).toEqual({
      error: "Failed to create the calendar.",
    });
  });

  it("maps a check-constraint violation to a message about dates and zones", async () => {
    // Drizzle puts the violated constraint on error.cause, NOT in the message.
    const error = Object.assign(new Error("insert failed"), {
      cause: { code: "23514", constraint: "calendar_events_start_at_derived" },
    });
    dbTransaction.mockRejectedValue(error);
    expect(await createCalendar(calendarInput)).toMatchObject({
      error: expect.stringContaining("Check the dates and time zones"),
    });
    expect(logError).toHaveBeenCalledWith(
      "calendar.constraint violation",
      expect.objectContaining({ constraint: "calendar_events_start_at_derived" }),
    );
  });

  it("also maps 22023, the code AT TIME ZONE raises for an unknown zone", async () => {
    dbTransaction.mockRejectedValue(
      Object.assign(new Error("bad zone"), { cause: { code: "22023" } }),
    );
    expect(await createCalendar(calendarInput)).toMatchObject({
      error: expect.stringContaining("Check the dates and time zones"),
    });
  });

  it("surfaces a transaction that returns no row", async () => {
    dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({ insert: () => insertReturning([]), update: () => ({}) }),
    );
    expect(await createCalendar(calendarInput)).toEqual({
      error: "Failed to create the calendar.",
    });
  });
});

describe("updateCalendar", () => {
  it("requires the owner role, not merely write access", async () => {
    getCalendarRole.mockResolvedValue("writer");
    expect(await updateCalendar({ ...calendarInput, id: CAL })).toEqual({ error: "Forbidden" });
  });

  it("reports a calendar the caller cannot see as missing", async () => {
    getCalendarRole.mockResolvedValue(null);
    expect(await updateCalendar({ ...calendarInput, id: CAL })).toEqual({
      error: "Calendar not found",
    });
  });

  it("returns not-found when the row vanished between the ACL read and the write", async () => {
    findCalendar.mockResolvedValue(undefined);
    expect(await updateCalendar({ ...calendarInput, id: CAL })).toEqual({
      error: "Calendar not found",
    });
  });

  it("updates, demoting the previous primary when promoting", async () => {
    const updates: string[] = [];
    dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        update: () => {
          updates.push("update");
          return {
            set: () => ({
              where: () => ({
                returning: () => Promise.resolve([{ id: CAL, name: "Work" }]),
              }),
            }),
          };
        },
      }),
    );
    const result = await updateCalendar({ ...calendarInput, id: CAL, isPrimary: true });
    // Two update calls: the demote and the row itself.
    expect(updates).toEqual(["update", "update"]);
    expect(result).toEqual({ data: { id: CAL, name: "Work" } });
  });

  it("rejects an unknown zone before writing", async () => {
    expect(
      await updateCalendar({ ...calendarInput, id: CAL, timeZone: "Nowhere/Nothing" }),
    ).toMatchObject({ fieldErrors: { timeZone: expect.any(String) } });
  });

  it("returns field errors for a bad id", async () => {
    expect(await updateCalendar({ ...calendarInput, id: "nope" })).toMatchObject({
      error: "Please fix the fields below.",
    });
  });

  it("maps a failed update", async () => {
    dbTransaction.mockRejectedValue(new Error("nope"));
    expect(await updateCalendar({ ...calendarInput, id: CAL })).toEqual({
      error: "Failed to update the calendar.",
    });
  });
});

describe("deleteCalendar", () => {
  it("hard-deletes and revalidates", async () => {
    expect(await deleteCalendar({ id: CAL })).toEqual({ data: { id: CAL } });
    expect(dbDelete).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("rejects a non-uuid id as not found rather than as a validation error", async () => {
    expect(await deleteCalendar({ id: "nope" })).toEqual({ error: "Calendar not found" });
  });

  it("requires ownership", async () => {
    getCalendarRole.mockResolvedValue("writer");
    expect(await deleteCalendar({ id: CAL })).toEqual({ error: "Forbidden" });
    getCalendarRole.mockResolvedValue(null);
    expect(await deleteCalendar({ id: CAL })).toEqual({ error: "Calendar not found" });
  });

  it("maps a failed delete", async () => {
    dbDelete.mockReturnValue({ where: () => Promise.reject(new Error("fk")) });
    expect(await deleteCalendar({ id: CAL })).toEqual({
      error: "Failed to delete the calendar.",
    });
  });
});

describe("createEvent", () => {
  it("derives the instants and offsets from the civil values", async () => {
    let written: Record<string, unknown> = {};
    dbInsert.mockReturnValue({
      values: (row: Record<string, unknown>) => {
        written = row;
        return { returning: () => Promise.resolve([{ id: EVENT, calendarId: CAL }]) };
      },
    });

    expect(await createEvent(eventInput)).toEqual({ data: { id: EVENT, calendarId: CAL } });
    // 2027-03-15 09:00 New York is EDT (−04:00) → 13:00 UTC, offset −240.
    expect(written.startOffsetMinutes).toBe(-240);
    expect((written.startAt as Date).toISOString()).toBe("2027-03-15T13:00:00.000Z");
    expect(written.uid).toEqual(expect.any(String));
    expect(written.sequence).toBeUndefined();
  });

  it("requires write access on the target calendar", async () => {
    getCalendarRole.mockResolvedValue("reader");
    expect(await createEvent(eventInput)).toEqual({ error: "Forbidden" });
    getCalendarRole.mockResolvedValue(null);
    expect(await createEvent(eventInput)).toEqual({ error: "Calendar not found" });
  });

  it("reports an unknown zone under the field that carries it", async () => {
    expect(await createEvent({ ...eventInput, endTzid: "Nowhere/Nothing" })).toMatchObject({
      fieldErrors: { endTzid: expect.any(String) },
    });
  });

  it("reports an impossible date under its own field", async () => {
    // February 30 matches the schema's shape regex; parseLocalDateTime is what
    // rejects it, and the action attributes the rejection to the right input.
    expect(await createEvent({ ...eventInput, startWall: "2027-02-30 09:00:00" })).toMatchObject({
      fieldErrors: { startWall: expect.any(String) },
    });
  });

  it("rejects an end before the start, on instants rather than on text", async () => {
    const result = await createEvent({
      ...eventInput,
      startWall: "2027-06-01 12:00:00",
      endWall: "2027-06-01 11:00:00",
    });
    expect(result).toMatchObject({ fieldErrors: { endWall: expect.any(String) } });
  });

  it("accepts a cross-zone event whose civil end reads earlier than its start", async () => {
    // Departs 09:00 New York, arrives 11:30 Los Angeles: as text the end is later,
    // but the real test is that a 09:00 NY → 07:00 LA flight (2h later in instants,
    // 2h EARLIER in wall text) is accepted.
    const result = await createEvent({
      ...eventInput,
      startWall: "2027-06-01 09:00:00",
      startTzid: "America/New_York",
      endWall: "2027-06-01 08:00:00",
      endTzid: "America/Los_Angeles",
    });
    expect(result).toEqual({ data: { id: EVENT, calendarId: CAL } });
  });

  it("rejects a span longer than 366 days", async () => {
    expect(
      await createEvent({
        ...eventInput,
        startWall: "2027-01-01 00:00:00",
        endWall: "2028-06-01 00:00:00",
      }),
    ).toMatchObject({ fieldErrors: { endWall: expect.any(String) } });
  });

  it("rejects an all-day event that is not on midnight", async () => {
    expect(await createEvent({ ...eventInput, allDay: true })).toMatchObject({
      error: "Please fix the fields below.",
      fieldErrors: { startWall: expect.any(String) },
    });
  });

  it("accepts an all-day event with an exclusive midnight end", async () => {
    const result = await createEvent({
      ...eventInput,
      allDay: true,
      startWall: "2027-03-14 00:00:00",
      endWall: "2027-03-15 00:00:00",
    });
    expect(result).toEqual({ data: { id: EVENT, calendarId: CAL } });
  });

  it("maps an insert failure", async () => {
    dbInsert.mockReturnValue({
      values: () => ({ returning: () => Promise.reject(new Error("boom")) }),
    });
    expect(await createEvent(eventInput)).toEqual({ error: "Failed to create the event." });
  });

  it("surfaces an insert that returns no row", async () => {
    dbInsert.mockReturnValue(insertReturning([]));
    expect(await createEvent(eventInput)).toEqual({ error: "Failed to create the event." });
  });
});

describe("updateEvent", () => {
  it("updates and revalidates both the month view and the detail route", async () => {
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      data: { id: EVENT, calendarId: CAL },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(revalidatePath).toHaveBeenCalledWith(`/calendar/event/${EVENT}`);
  });

  it("never writes uid or sequence", async () => {
    let written: Record<string, unknown> = {};
    dbUpdate.mockReturnValue({
      set: (row: Record<string, unknown>) => {
        written = row;
        return {
          where: () => ({ returning: () => Promise.resolve([{ id: EVENT, calendarId: CAL }]) }),
        };
      },
    });
    await updateEvent({ ...eventInput, ...noScope, id: EVENT });
    expect(written.uid).toBeUndefined();
    expect(written.sequence).toBeUndefined();
  });

  it("treats a missing or already-deleted event as not found", async () => {
    findEvent.mockResolvedValue(undefined);
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      error: "Event not found",
    });

    findEvent.mockResolvedValue({ id: EVENT, calendarId: CAL, deletedAt: new Date() });
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      error: "Event not found",
    });
  });

  it("authorizes the SOURCE calendar, not just the destination", async () => {
    // The event lives on a calendar the caller cannot write; moving it into their
    // own must still be refused.
    findEvent.mockResolvedValue({ id: EVENT, calendarId: OTHER_CAL, deletedAt: null });
    getCalendarRole.mockImplementation(async (calendarId: string) =>
      calendarId === CAL ? "owner" : null,
    );
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      error: "Event not found",
    });
  });

  it("authorizes the DESTINATION calendar on a move", async () => {
    findEvent.mockResolvedValue({ id: EVENT, calendarId: CAL, deletedAt: null });
    getCalendarRole.mockImplementation(async (calendarId: string) =>
      calendarId === CAL ? "owner" : null,
    );
    expect(
      await updateEvent({ ...eventInput, ...noScope, calendarId: OTHER_CAL, id: EVENT }),
    ).toEqual({
      error: "Forbidden",
    });
  });

  it("allows a move when the caller can write both calendars", async () => {
    getCalendarRole.mockResolvedValue("writer");
    expect(
      await updateEvent({ ...eventInput, ...noScope, calendarId: OTHER_CAL, id: EVENT }),
    ).toEqual({
      data: { id: EVENT, calendarId: CAL },
    });
  });

  it("refuses a reader on the source calendar", async () => {
    getCalendarRole.mockResolvedValue("reader");
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      error: "Forbidden",
    });
  });

  it("returns field errors for bad input", async () => {
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT, title: " " })).toMatchObject({
      error: "Please fix the fields below.",
    });
  });

  it("reports a bad zone on update too", async () => {
    expect(
      await updateEvent({ ...eventInput, ...noScope, id: EVENT, startTzid: "Nowhere/Nothing" }),
    ).toMatchObject({ fieldErrors: { startTzid: expect.any(String) } });
  });

  it("maps an update failure and a no-row update", async () => {
    dbUpdate.mockReturnValue(updateReturning([]));
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      error: "Failed to update the event.",
    });
  });
});

describe("deleteEvent", () => {
  it("soft-deletes by stamping deleted_at and leaves status alone", async () => {
    let written: Record<string, unknown> = {};
    dbUpdate.mockReturnValue({
      set: (row: Record<string, unknown>) => {
        written = row;
        return { where: () => Promise.resolve() };
      },
    });

    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({ data: { id: EVENT } });
    expect(written.deletedAt).toBeInstanceOf(Date);
    // Deletion is ONE fact in ONE column; Phase 4 derives STATUS:CANCELLED from it.
    expect(written.status).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith(`/calendar/event/${EVENT}`);
  });

  it("rejects a non-uuid id as not found", async () => {
    expect(await deleteEvent({ id: "nope", ...noScope })).toEqual({ error: "Event not found" });
  });

  it("is idempotent-safe: an already-deleted event is not found", async () => {
    findEvent.mockResolvedValue({ id: EVENT, calendarId: CAL, deletedAt: new Date() });
    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({ error: "Event not found" });
  });

  it("requires write access", async () => {
    getCalendarRole.mockResolvedValue("reader");
    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({ error: "Forbidden" });
    getCalendarRole.mockResolvedValue(null);
    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({ error: "Event not found" });
  });

  it("maps a failed soft delete", async () => {
    dbUpdate.mockReturnValue({ set: () => ({ where: () => Promise.reject(new Error("x")) }) });
    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({
      error: "Failed to delete the event.",
    });
  });
});
