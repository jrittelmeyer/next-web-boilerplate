import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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
  dbSelect,
  dbExecute,
  dbTransaction,
  dbNotify,
  findCalendar,
  findEvent,
  revalidatePath,
  logError,
  enqueueInvitations,
  enqueueSeriesUpdate,
  enqueueCancellations,
} = vi.hoisted(() => ({
  enqueueInvitations: vi.fn(),
  enqueueSeriesUpdate: vi.fn(),
  enqueueCancellations: vi.fn(),
  getSessionApi: vi.fn(),
  rateLimit: vi.fn(),
  getCalendarRole: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  dbDelete: vi.fn(),
  dbSelect: vi.fn(),
  dbExecute: vi.fn(),
  dbTransaction: vi.fn(),
  dbNotify: vi.fn(),
  findCalendar: vi.fn(),
  findEvent: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: getSessionApi } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/organization", () => ({ getActiveOrganizationId }));
// `notify` and the channel come along because the action's notification path is left
// REAL: `createNotifications` short-circuits on an empty list, so most tests never reach
// them, and a test that does produce a payload should see a spy rather than a
// `notify is not a function` from a half-mocked module.
vi.mock("@repo/db", () => ({
  NOTIFICATIONS_CHANNEL: "notifications",
  notify: dbNotify,
  db: {
    insert: dbInsert,
    update: dbUpdate,
    delete: dbDelete,
    select: dbSelect,
    execute: dbExecute,
    transaction: dbTransaction,
    query: {
      calendars: { findFirst: findCalendar },
      calendarEvents: { findFirst: findEvent },
    },
  },
}));
// The email fan-out is mocked as three spies rather than exercised: what these tests own is
// **which writer owes which email**, and the `.ics` those helpers assemble is asserted where
// it is real — `calendar-invitations.spec.ts` reads the enqueued `pgboss.job` payload and
// checks the actual serialized calendar.
vi.mock("@/server/calendar/invitations", () => ({
  enqueueInvitations,
  enqueueSeriesUpdate,
  enqueueCancellations,
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
  respondToEvent,
  setRecurrenceDate,
  updateCalendar,
  updateEvent,
} from "./calendar";

const CAL = "3f1b0a5e-6b0e-4b0f-9a2a-1c2d3e4f5a6b";
const OTHER_CAL = "9c8d7e6f-5a4b-4c3d-8e2f-1a0b9c8d7e6f";
const EVENT = "11111111-2222-4333-8444-555555555555";
const NEW_MASTER = "22222222-3333-4444-8555-666666666666";
// The email is load-bearing from Phase 3: it fills the `body` slot of every calendar
// notification, so a session without one would write `undefined` into a NOT NULL column.
const SESSION = { user: { id: "u1", email: "owner@example.com" } };

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

/** The shape `findEventTarget` reads. A one-off, in the calendar the caller owns. */
const eventTarget = {
  id: EVENT,
  calendarId: CAL,
  uid: "uid-master",
  deletedAt: null,
  rrule: null as string | null,
  recurrenceParentId: null as string | null,
  startWall: "2027-03-15 09:00:00",
  startTzid: "America/New_York",
  endWall: "2027-03-15 09:30:00",
  endTzid: "America/New_York",
};

/** …and the same row once it is a weekly series. */
const seriesTarget = { ...eventTarget, rrule: "FREQ=WEEKLY;BYDAY=MO" };

/**
 * The stored row `classifyEventChange` reads before a whole-event write.
 *
 * Everything the field classifier looks at that is NOT already on `eventTarget`; the two are
 * merged at read time (see `storedChangeRow`), so a test that swaps `findEvent` to
 * `seriesTarget` automatically gets a change row carrying that series' rule — rather than
 * one that says the rule just appeared out of nowhere.
 */
const CHANGE_ROW_DEFAULTS = {
  title: "Standup",
  description: null,
  location: null,
  url: null,
  color: null,
  status: "confirmed",
  visibility: "default",
  transparency: "opaque",
  allDay: false,
} as const;

/** True when a `select()` is asking for the change classifier's column set. */
function isChangeSelect(columns: unknown): boolean {
  return typeof columns === "object" && columns !== null && "transparency" in columns;
}

async function storedChangeRow(): Promise<Record<string, unknown>> {
  const last = findEvent.mock.results.at(-1);
  const target = last === undefined ? null : await last.value;
  return { ...CHANGE_ROW_DEFAULTS, ...(target ?? {}) };
}

/** `db.insert(...).values(...).returning(...)` resolving to `rows`. */
function insertReturning(rows: unknown[]) {
  return { values: () => ({ returning: () => Promise.resolve(rows) }) };
}

function updateReturning(rows: unknown[]) {
  return { set: () => ({ where: () => ({ returning: () => Promise.resolve(rows) }) }) };
}

/**
 * `db.select(...).from(...).where(...)` resolving to `rows` — the recurrence-date read.
 *
 * `where()` is awaitable **and** `.limit()`-able: the recurrence-date read awaits it
 * directly while the soft delete's title lookup chains `.limit(1)` off it. A bare promise
 * makes the second one a `TypeError` inside the transaction callback, which the action
 * then reports as a generic write failure.
 */
function selectReturning(rows: unknown[]) {
  const settled = () =>
    Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
  // `innerJoin` returns the same tail, so one fixture serves the recurrence-date read,
  // the attendee probe inside `getEventAccess`, and the organizer lookup in
  // `respondToEvent`.
  const tail: { where: typeof settled; innerJoin: () => typeof tail } = {
    where: settled,
    innerJoin: () => tail,
  };
  return { from: () => tail };
}

/**
 * Column-aware `select`: the change classifier's read gets the stored row, everything else
 * gets the fixture the test supplied. Without the branch one array would have to be a valid
 * recurrence-date row, a valid attendee row AND a valid event row at once.
 */
function selectFor(columns: unknown, rows: unknown[]) {
  if (!isChangeSelect(columns)) return selectReturning(rows);
  const settled = () => {
    const resolved = storedChangeRow().then((row) => [row]);
    return Object.assign(resolved, { limit: () => resolved });
  };
  const tail: { where: typeof settled; innerJoin: () => typeof tail } = {
    where: settled,
    innerJoin: () => tail,
  };
  return { from: () => tail };
}

/**
 * Like `selectReturning`, but records every `where(...)` condition it is handed, for the
 * spelling pins below. Same chain contract: awaitable and `.limit()`-able.
 */
function whereCapturingSelect(conditions: unknown[], rows: unknown[] = []) {
  const settled = (cond: unknown) => {
    conditions.push(cond);
    return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
  };
  const tail: { where: typeof settled; innerJoin: () => typeof tail } = {
    where: settled,
    innerJoin: () => tail,
  };
  return { from: () => tail };
}

/**
 * Compile a captured condition to SQL text. The pins assert on this text because both
 * predicates guard rules that no green-path unit assertion can see (the mocks model the
 * query's OUTPUT): the pin proves the app still ISSUES the fixed spelling, and
 * `@repo/db`'s calendar-attendees integration suite proves that spelling's semantics
 * against real rows — planted defects included. Pin + planted defect = the complete
 * sensor audit 08-06 F2 asked for. A semantically-equivalent rewrite that trips a pin
 * should update it in the same commit, beside the integration proof.
 */
function compiledSql(condition: unknown): string {
  return new PgDialect().sqlToQuery(condition as SQL).sql;
}

/**
 * A transaction whose `tx` records every statement it is handed.
 *
 * The scoped writes are defined by *which* statements land inside one transaction — a
 * split that inserted its new master outside the transaction that re-parents the
 * overrides would leave orphans on any failure — so the tests assert on the recording
 * rather than on a return value.
 */
interface TxLog {
  inserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  deletes: number;
  /** Raw statements — `splitSeries`'s `INSERT … SELECT` guest-list copy is the only one. */
  executes: number;
}

function recordingTransaction(
  rows: unknown[] = [{ id: NEW_MASTER, calendarId: CAL }],
  selectRows: unknown[] = [],
): TxLog {
  const log: TxLog = { inserts: [], updates: [], deletes: 0, executes: 0 };
  dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          log.inserts.push(row);
          return {
            returning: () => Promise.resolve(rows),
            onConflictDoNothing: () => Promise.resolve(),
            // `updateOccurrence` became transactional in Phase 4 (it now bumps the
            // master's SEQUENCE alongside the override upsert), so the recording tx has to
            // offer the same builder `db.insert` does or the action reports a write failure.
            onConflictDoUpdate: () => Promise.resolve(),
          };
        },
      }),
      update: () => ({
        set: (row: Record<string, unknown>) => {
          log.updates.push(row);
          // Awaitable AND `.returning()`-able: the soft delete awaits `where()` while
          // the whole-event update chains `.returning()` off it.
          return {
            where: () =>
              Object.assign(Promise.resolve(), { returning: () => Promise.resolve(rows) }),
          };
        },
      }),
      delete: () => ({
        where: () => {
          log.deletes += 1;
          // Awaitable AND `.returning()`-able: `removeAttendees` reads back the addresses
          // it deleted, because the cancellation email needs them and the row is gone.
          return Object.assign(Promise.resolve(), { returning: () => Promise.resolve([]) });
        },
      }),
      select: (columns: unknown) => selectFor(columns, selectRows),
      // Without this the guest-list copy throws INSIDE the transaction callback and the
      // action reports "Failed to update the event." — a fixture gap that reads exactly
      // like a production defect.
      execute: () => {
        log.executes += 1;
        return Promise.resolve();
      },
    }),
  );
  return log;
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionApi.mockResolvedValue(SESSION);
  rateLimit.mockResolvedValue({ success: true });
  getCalendarRole.mockResolvedValue("owner");
  getActiveOrganizationId.mockResolvedValue(null);
  findCalendar.mockResolvedValue({ organizationId: null });
  findEvent.mockResolvedValue(eventTarget);
  dbInsert.mockReturnValue(insertReturning([{ id: EVENT, calendarId: CAL }]));
  dbUpdate.mockReturnValue(updateReturning([{ id: EVENT, calendarId: CAL }]));
  dbDelete.mockReturnValue({
    where: () => Object.assign(Promise.resolve(), { returning: () => Promise.resolve([]) }),
  });
  dbSelect.mockImplementation((columns: unknown) => selectFor(columns, []));
  dbExecute.mockResolvedValue(undefined);
  enqueueInvitations.mockResolvedValue(undefined);
  enqueueSeriesUpdate.mockResolvedValue(undefined);
  enqueueCancellations.mockResolvedValue(undefined);
  // The default transaction hands the callback **the same builders `db` exposes**, so a
  // statement that moved inside a transaction in Phase 3 — `createEvent`,
  // `updateWholeEvent` and `softDeleteEvent` all did — keeps being asserted through the
  // mock it was always asserted through. A tx with its own private builders would make
  // every one of those tests pass vacuously instead.
  dbTransaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      await callback({
        insert: dbInsert,
        update: dbUpdate,
        delete: dbDelete,
        select: dbSelect,
        execute: dbExecute,
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
    expect(await deleteCalendar({ id: CAL })).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
  });
});

describe("createCalendar", () => {
  // The shared default insert returns an *event* row, because that is what most of this
  // file writes. A calendar create returns a calendar.
  beforeEach(() => {
    dbInsert.mockReturnValue(insertReturning([{ id: CAL, name: "Work" }]));
  });

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

  it("rate-limits per user before touching the database", async () => {
    rateLimit.mockResolvedValue({ success: false });
    expect(await deleteCalendar({ id: CAL })).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
    expect(rateLimit).toHaveBeenCalledWith("calendar:delete:u1", { limit: 10, windowSec: 60 });
    expect(dbDelete).not.toHaveBeenCalled();
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

  it("resolves guests to accounts, stores the list and publishes invitations", async () => {
    const writes: unknown[] = [];
    dbSelect.mockReturnValue(selectReturning([{ id: "guest-1", email: "guest@example.com" }]));
    dbInsert.mockImplementation(() => ({
      values: (rows: unknown) => {
        writes.push(rows);
        // The guest-list insert is awaited without `.returning()`; the event and the
        // notifications both chain it.
        return Object.assign(Promise.resolve(), {
          returning: () =>
            Promise.resolve(
              writes.length === 1
                ? [{ id: EVENT, calendarId: CAL }]
                : [
                    {
                      id: "n1",
                      userId: "guest-1",
                      type: "calendar_invite",
                      body: SESSION.user.email,
                      title: "Standup",
                      link: `/calendar/event/${EVENT}`,
                      read: false,
                      createdAt: new Date(),
                    },
                  ],
            ),
        });
      },
    }));

    const result = await createEvent({
      ...eventInput,
      attendees: [
        { email: "guest@example.com", role: "required" },
        { email: "external@example.com", role: "optional" },
      ],
    });

    expect(result).toEqual({ data: { id: EVENT, calendarId: CAL } });
    // One transaction, three statements: the event, the guest list, the invitations. An
    // event whose guest list failed to insert is an event the organizer believes they
    // invited people to.
    expect(writes).toHaveLength(3);
    expect(writes[1]).toEqual([
      expect.objectContaining({ email: "guest@example.com", role: "required", userId: "guest-1" }),
      // An address with no account is still a real row, with `user_id NULL` — Phase 4 is
      // what reaches it, by email — and it receives no in-app notification.
      expect.objectContaining({ email: "external@example.com", role: "optional", userId: null }),
    ]);
    expect(writes[2]).toEqual([
      expect.objectContaining({
        userId: "guest-1",
        type: "calendar_invite",
        body: SESSION.user.email,
        title: "Standup",
        link: `/calendar/event/${EVENT}`,
      }),
    ]);
    // Strictly after the commit: `notify()` runs `pg_notify` on the POOLED connection, so
    // a push issued inside the transaction can beat the row it describes.
    expect(dbNotify).toHaveBeenCalledTimes(1);
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
    findEvent.mockResolvedValue({ ...eventTarget, calendarId: OTHER_CAL });
    getCalendarRole.mockImplementation(async (calendarId: string) =>
      calendarId === CAL ? "owner" : null,
    );
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toEqual({
      error: "Event not found",
    });
  });

  it("authorizes the DESTINATION calendar on a move", async () => {
    findEvent.mockResolvedValue(eventTarget);
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

  it("cancels the guests it dropped and leaves the ones it kept alone", async () => {
    // The rule that most needs a test: the composer posts the WHOLE list on every save,
    // so a diff that touched an address present in both sets would silently return that
    // person to `needs-action` on a title edit.
    let notified: Record<string, unknown>[] = [];
    dbSelect.mockReturnValue(
      selectReturning([{ email: "stays@example.com" }, { email: "gone@example.com" }]),
    );
    dbDelete.mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([{ userId: "guest-1" }]) }),
    });
    dbInsert.mockReturnValue({
      values: (rows: Record<string, unknown>[]) => {
        notified = rows;
        return {
          returning: () =>
            Promise.resolve([
              {
                id: "n1",
                userId: "guest-1",
                type: "calendar_cancelled",
                body: SESSION.user.email,
                title: "Standup",
                link: null,
                read: false,
                createdAt: new Date(),
              },
            ]),
        };
      },
    });

    const result = await updateEvent({
      ...eventInput,
      ...noScope,
      id: EVENT,
      attendees: [{ email: "stays@example.com", role: "required" }],
    });

    expect(result).toEqual({ data: { id: EVENT, calendarId: CAL } });
    // Nothing was inserted for `stays@example.com` — an address in both sets is left
    // strictly alone, not upserted back to the default status.
    expect(notified).toEqual([
      expect.objectContaining({
        userId: "guest-1",
        type: "calendar_cancelled",
        title: "Standup",
        link: null,
      }),
    ]);
    expect(dbNotify).toHaveBeenCalledTimes(1);
  });
});

describe("which writer owes which email", () => {
  /** `dbUpdate` recording the row it was handed, so the SEQUENCE/reask stamps are visible. */
  function recordingUpdate(): Record<string, unknown>[] {
    const written: Record<string, unknown>[] = [];
    dbUpdate.mockReturnValue({
      set: (row: Record<string, unknown>) => {
        written.push(row);
        return {
          where: () =>
            Object.assign(Promise.resolve(), {
              returning: () => Promise.resolve([{ id: EVENT, calendarId: CAL }]),
            }),
        };
      },
    });
    return written;
  }

  it("invites the guests a create added, and nobody else", async () => {
    dbInsert.mockReturnValue({
      values: () => ({
        returning: () =>
          Promise.resolve([
            { id: EVENT, calendarId: CAL, attendeeId: "a1", email: "guest@example.com" },
          ]),
        onConflictDoNothing: () => Promise.resolve(),
      }),
    });

    await createEvent({
      ...eventInput,
      attendees: [{ email: "guest@example.com", role: "required" }],
    });

    expect(enqueueInvitations).toHaveBeenCalledWith(EVENT, [
      expect.objectContaining({ attendeeId: "a1", email: "guest@example.com" }),
    ]);
    expect(enqueueSeriesUpdate).not.toHaveBeenCalled();
  });

  it("a description-only edit sends nothing and bumps nothing", async () => {
    // The whole reason the classifier is three booleans rather than one: a typo fix must
    // not reach fifty inboxes, and must not bump a SEQUENCE that would re-prompt clients.
    const written = recordingUpdate();
    await updateEvent({ ...eventInput, ...noScope, id: EVENT, description: "typo fixed" });

    expect(enqueueSeriesUpdate).not.toHaveBeenCalled();
    expect(written[0]).not.toHaveProperty("sequence");
    expect(written[0]).not.toHaveProperty("reaskAt");
  });

  it("a title edit resends and bumps, but does NOT mark anyone stale", async () => {
    const written = recordingUpdate();
    await updateEvent({ ...eventInput, ...noScope, id: EVENT, title: "Stand-up" });

    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(EVENT, false, []);
    expect(written[0]).toHaveProperty("sequence");
    expect(written[0]?.reaskAt).toBeUndefined();
  });

  it("a move in time stamps reask_at instead of overwriting anyone's answer", async () => {
    const written = recordingUpdate();
    await updateEvent({
      ...eventInput,
      ...noScope,
      id: EVENT,
      startWall: "2027-03-15 14:00:00",
      endWall: "2027-03-15 14:30:00",
    });

    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(EVENT, true, []);
    // A timestamp on the EVENT is the whole mechanism. Nothing on the attendee table is
    // written, so a stored "declined, clashes with my flight" survives a reschedule and
    // staleness is derived as `responded_at < reask_at`.
    expect(written[0]?.reaskAt).toBeDefined();
    // **Postgres's clock, not Node's.** The other half of that comparison is written by
    // `now()`, and mixing the two silently inverts the answer under any clock skew — which
    // the e2e hit for real on a Docker Postgres running 4.5 s ahead of its host.
    expect(written[0]?.reaskAt).not.toBeInstanceOf(Date);
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("excludes a just-invited guest from the update fan-out", async () => {
    // Otherwise they get "this event changed" about an event they have not been told of.
    dbSelect.mockImplementation((columns: unknown) => selectFor(columns, []));
    dbInsert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([{ attendeeId: "a9", email: "new@example.com" }]),
        onConflictDoNothing: () => Promise.resolve(),
      }),
    });
    recordingUpdate();

    await updateEvent({
      ...eventInput,
      ...noScope,
      id: EVENT,
      title: "Renamed",
      attendees: [{ email: "new@example.com", role: "required" }],
    });

    expect(enqueueInvitations).toHaveBeenCalledWith(EVENT, [
      { attendeeId: "a9", email: "new@example.com" },
    ]);
    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(EVENT, false, ["a9"]);
  });

  it("sends a dropped guest a REMOVAL, which carries no attachment", async () => {
    dbSelect.mockImplementation((columns: unknown) =>
      selectFor(columns, [{ email: "gone@example.com" }]),
    );
    dbDelete.mockReturnValue({
      where: () =>
        Object.assign(Promise.resolve(), {
          returning: () => Promise.resolve([{ userId: null, email: "gone@example.com" }]),
        }),
    });
    recordingUpdate();

    await updateEvent({ ...eventInput, ...noScope, id: EVENT, attendees: [] });

    expect(enqueueCancellations).toHaveBeenCalledWith(EVENT, ["gone@example.com"], "removed");
  });

  it("sends a deleted event's guests a CANCELLATION, which does", async () => {
    // The fixture is the FIXED recipient query's result (audit F4): an external guest
    // (`userId` null) beside an account holder, the deleting actor already excluded by
    // the SQL. The external row must reach the email fan-out un-dropped — the
    // `.filter` below the query guards only the notification rows — while the predicate
    // that produces this set (NULL-safe `or(isNull, ne)`) is proven against real
    // Postgres in @repo/db's calendar-attendees integration suite; a mock cannot see a
    // WHERE, which is exactly how the pre-fix version of this test passed while
    // production dropped the external.
    dbSelect.mockImplementation((columns: unknown) =>
      selectFor(columns, [
        { userId: null, email: "external@example.com", title: "Standup" },
        { userId: "guest-user-id", email: "holder@example.com" },
      ]),
    );
    // The holder's row makes `createNotifications` insert for real now (the old
    // external-only fixture short-circuited it), and `toPayload` reads the returned
    // row's `createdAt` — so the returning must be a full notification row.
    dbInsert.mockReturnValue({
      values: () => ({
        returning: () =>
          Promise.resolve([
            {
              id: "n1",
              userId: "guest-user-id",
              type: "calendar_cancelled",
              body: "owner@example.com",
              title: "Standup",
              link: null,
              read: false,
              createdAt: new Date(),
            },
          ]),
      }),
    });
    recordingUpdate();

    await deleteEvent({ id: EVENT, ...noScope });

    expect(enqueueCancellations).toHaveBeenCalledWith(
      EVENT,
      ["external@example.com", "holder@example.com"],
      "cancelled",
    );
    // One in-app notification — the holder's. The external's only channel is the email.
    expect(dbNotify).toHaveBeenCalledTimes(1);
  });

  it("emails the series when ONE occurrence moves, without re-asking", async () => {
    // RSVP is series-level through Phase 4, so a "yes" is to the series: one occurrence
    // shifting does not invalidate it, and marking everyone stale would be noise.
    findEvent.mockResolvedValue(seriesTarget);
    recordingTransaction();

    await updateEvent({
      ...eventInput,
      id: EVENT,
      scope: "this",
      recurrenceId: "2027-03-22 09:00:00",
      // A single occurrence carries no rule of its own — the series keeps it.
      rrule: null,
      startWall: "2027-03-22 14:00:00",
      endWall: "2027-03-22 14:30:00",
    });

    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(EVENT, false);
  });

  it("a split emails BOTH halves — two UIDs, two calendars to fix", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    recordingTransaction();

    await updateEvent({
      ...eventInput,
      id: EVENT,
      scope: "thisAndFollowing",
      recurrenceId: "2027-03-29 09:00:00",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      startWall: "2027-03-29 14:00:00",
      endWall: "2027-03-29 14:30:00",
    });

    // The new master, re-asked because the cut moved the time — the Phase-3 debt paid.
    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(NEW_MASTER, true);
    // And the first half, whose rule gained a bound its guests' clients need.
    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(EVENT, false);
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

  it("tells every guest but the person deleting, and fills the sentence's slots", async () => {
    // The `calendarCancelled` sentence is "{event} was cancelled", and the feed reads the
    // contract literally: a NULL `title` means `body` is already a complete sentence. So a
    // cancellation carrying the title in `body` renders as the bare words "Standup".
    // `title` is the event and `body` is the actor, the same way round as every other
    // calendar type.
    let notified: Record<string, unknown>[] = [];
    dbSelect.mockReturnValue(selectReturning([{ title: "Standup", userId: "guest-1" }]));
    dbInsert.mockReturnValue({
      values: (rows: Record<string, unknown>[]) => {
        notified = rows;
        return {
          returning: () =>
            Promise.resolve([
              {
                id: "n1",
                userId: "guest-1",
                type: "calendar_cancelled",
                body: SESSION.user.email,
                title: "Standup",
                link: null,
                read: false,
                createdAt: new Date(),
              },
            ]),
        };
      },
    });

    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({ data: { id: EVENT } });
    expect(notified).toEqual([
      expect.objectContaining({
        userId: "guest-1",
        type: "calendar_cancelled",
        body: SESSION.user.email,
        title: "Standup",
        // The event is soft-deleted, so any link would 404 on click.
        link: null,
      }),
    ]);
    // Published strictly after the commit — `notify()` runs on the pooled connection.
    expect(dbNotify).toHaveBeenCalledTimes(1);
  });

  it("pins the NULL-safe spelling of the recipient predicate (audit F4)", async () => {
    // `NULL <> $actor` is NULL, so a bare `ne()` silently drops every external guest —
    // exactly the people whose ONLY notice of a cancellation is this email. The planted
    // defect for the wrong spelling lives in @repo/db's calendar-attendees suite; this
    // pin is what turns red if the action stops issuing the right one.
    const conditions: unknown[] = [];
    dbSelect.mockImplementation(() => whereCapturingSelect(conditions));

    expect(await deleteEvent({ id: EVENT, ...noScope })).toEqual({ data: { id: EVENT } });

    const guests = conditions.map(compiledSql).find((text) => text.includes('"user_id"'));
    expect(guests).toMatch(
      /"calendar_event_attendees"\."user_id" is null or "calendar_event_attendees"\."user_id" <> \$\d/,
    );
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

// --- Recurrence (Phase 2) ----------------------------------------------------

/** The same one-off, made weekly. Monday 2027-03-15 is the series' DTSTART. */
const seriesInput = { ...eventInput, rrule: "FREQ=WEEKLY;BYDAY=MO" } as const;
/** The third occurrence — two before it, so a split at it is a real split. */
const THIRD = "2027-03-29 09:00:00";

describe("respondToEvent", () => {
  const ORGANIZER = "u2";
  const GUEST_EMAIL = "guest@example.com";

  /** `db.update(...).set(...).where(...).returning(...)`, recording what was set. */
  function capturingUpdate(written: Record<string, unknown>[], rows: unknown[]) {
    return {
      set: (row: Record<string, unknown>) => {
        written.push(row);
        return { where: () => ({ returning: () => Promise.resolve(rows) }) };
      },
    };
  }

  beforeEach(() => {
    // One fixture row serves two different reads: `getEventAccess`'s attendee probe takes
    // `status`, and the action's own organizer lookup takes `title` and `ownerId`.
    dbSelect.mockReturnValue(
      selectReturning([{ status: "needs-action", title: "Standup", ownerId: ORGANIZER }]),
    );
    dbUpdate.mockReturnValue(updateReturning([{ email: GUEST_EMAIL }]));
    dbInsert.mockReturnValue(
      insertReturning([
        {
          id: "n1",
          userId: ORGANIZER,
          type: "calendar_response_accepted",
          body: GUEST_EMAIL,
          title: "Standup",
          link: `/calendar/event/${EVENT}`,
          read: false,
          createdAt: new Date(),
        },
      ]),
    );
  });

  it("refuses without a session", async () => {
    getSessionApi.mockResolvedValue(null);
    expect(await respondToEvent({ eventId: EVENT, status: "accepted", comment: null })).toEqual({
      error: "Unauthorized",
    });
  });

  it("refuses a rate-limited caller", async () => {
    rateLimit.mockResolvedValue({ success: false });
    expect(
      await respondToEvent({ eventId: EVENT, status: "accepted", comment: null }),
    ).toMatchObject({ error: expect.stringContaining("Too many requests") });
  });

  it("returns field errors for a malformed submission", async () => {
    expect(
      await respondToEvent({ eventId: "nope", status: "accepted", comment: null }),
    ).toMatchObject({
      error: "Please fix the fields below.",
      fieldErrors: { eventId: expect.any(String) },
    });
  });

  it("answers 'Event not found' to someone who was never invited", async () => {
    // The same message the rest of the file uses, so "not invited" and "does not exist"
    // are indistinguishable to a caller probing ids.
    dbSelect.mockReturnValue(selectReturning([]));
    expect(await respondToEvent({ eventId: EVENT, status: "accepted", comment: null })).toEqual({
      error: "Event not found",
    });
  });

  it("stamps the answer, claims the row, and tells the organizer", async () => {
    const written: Record<string, unknown>[] = [];
    dbUpdate.mockReturnValue(capturingUpdate(written, [{ email: GUEST_EMAIL }]));

    const result = await respondToEvent({
      eventId: EVENT,
      status: "accepted",
      comment: "  see you  ",
    });

    expect(result).toEqual({ data: { id: EVENT, calendarId: CAL } });
    expect(written[0]).toMatchObject({ status: "accepted", comment: "see you" });
    // `responded_at` is stamped unconditionally, which is safe only because
    // ATTENDEE_RESPONSES excludes `needs-action` — the one status that would contradict
    // `calendar_event_attendees_responded_pair`.
    expect(written[0]?.respondedAt).toBeDefined();
    // **The claim, made durable.** Without this stamp an invitation the person had
    // already ACCEPTED would silently vanish from their list the day they changed
    // address, because only the verified-email arm could ever have found it.
    expect(written[0]?.userId).toBe(SESSION.user.id);
    expect(dbNotify).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/calendar/invites");
    expect(revalidatePath).toHaveBeenCalledWith(`/calendar/event/${EVENT}`);
  });

  it("pins the verified-email arm of the UPDATE's row selection (audit F6b)", async () => {
    // Without `u.email_verified` the UPDATE is not bounded to one row: an attendee who
    // moves their account onto a co-invitee's address — free on a deploy where
    // verification is off — overwrites that person's status, comment and stamp, and the
    // action destructures `[row]` so it never learns a second row was written. The
    // planted defect is in @repo/db's calendar-attendees suite; this pin binds the app.
    const wheres: unknown[] = [];
    dbUpdate.mockReturnValue({
      set: () => ({
        where: (cond: unknown) => {
          wheres.push(cond);
          return { returning: () => Promise.resolve([{ email: GUEST_EMAIL }]) };
        },
      }),
    });

    await respondToEvent({ eventId: EVENT, status: "accepted", comment: null });

    const text = compiledSql(wheres[0]);
    expect(text).toMatch(/"calendar_event_attendees"\."user_id" = \$\d+ OR EXISTS/);
    expect(text).toContain("u.email_verified");
    expect(text).toContain('"calendar_event_attendees"."email" = lower(u.email)');
  });

  it("splits the notification type by status rather than carrying a status field", async () => {
    // A one-slot notification cannot express "Alice declined Standup" — two variables and
    // a status — so the type is what selects the sentence.
    let notified: Record<string, unknown>[] = [];
    dbInsert.mockReturnValue({
      values: (rows: Record<string, unknown>[]) => {
        notified = rows;
        return {
          returning: () =>
            Promise.resolve([
              {
                id: "n1",
                userId: ORGANIZER,
                type: "calendar_response_declined",
                body: GUEST_EMAIL,
                title: "Standup",
                link: `/calendar/event/${EVENT}`,
                read: false,
                createdAt: new Date(),
              },
            ]),
        };
      },
    });

    await respondToEvent({ eventId: EVENT, status: "declined", comment: null });
    expect(notified[0]).toMatchObject({
      userId: ORGANIZER,
      type: "calendar_response_declined",
      body: GUEST_EMAIL,
      title: "Standup",
    });
  });

  it("notifies nobody when you answer your own event", async () => {
    dbSelect.mockReturnValue(
      selectReturning([{ status: "needs-action", title: "Standup", ownerId: SESSION.user.id }]),
    );
    await respondToEvent({ eventId: EVENT, status: "tentative", comment: null });
    expect(dbNotify).not.toHaveBeenCalled();
  });

  it("maps a write failure without claiming the response was saved", async () => {
    dbUpdate.mockReturnValue({
      set: () => ({ where: () => ({ returning: () => Promise.reject(new Error("boom")) }) }),
    });
    expect(await respondToEvent({ eventId: EVENT, status: "accepted", comment: null })).toEqual({
      error: "Failed to save your response.",
    });
  });
});

describe("createEvent with a rule", () => {
  it("stores the CANONICAL rule and a series_end_at", async () => {
    let written: Record<string, unknown> = {};
    dbInsert.mockReturnValue({
      values: (row: Record<string, unknown>) => {
        written = row;
        return { returning: () => Promise.resolve([{ id: EVENT, calendarId: CAL }]) };
      },
    });

    // Lower case, parts out of RFC order: two users building the same recurrence must
    // get byte-identical rows, or the split's text comparison and Phase 6's ICS upsert
    // both quietly stop matching.
    await createEvent({ ...eventInput, rrule: "byday=mo;freq=weekly;count=3" });
    expect(written.rrule).toBe("FREQ=WEEKLY;COUNT=3;BYDAY=MO");
    expect(written.seriesEndAt).toBeInstanceOf(Date);
  });

  it("leaves series_end_at NULL for an unbounded series", async () => {
    let written: Record<string, unknown> = {};
    dbInsert.mockReturnValue({
      values: (row: Record<string, unknown>) => {
        written = row;
        return { returning: () => Promise.resolve([{ id: EVENT, calendarId: CAL }]) };
      },
    });
    await createEvent(seriesInput);
    expect(written.seriesEndAt).toBeNull();
  });

  it("reports an unsupported part under the rrule field, naming it", async () => {
    // The grammar's owner is parseRRule; the action only attributes the failure.
    const result = await createEvent({ ...eventInput, rrule: "FREQ=WEEKLY;BYWEEKNO=3" });
    expect(result).toMatchObject({
      error: "Please fix the fields below.",
      fieldErrors: { rrule: expect.stringContaining("BYWEEKNO") },
    });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("rejects COUNT and UNTIL together, which rrule@2.8.1 accepts", async () => {
    expect(
      await createEvent({ ...eventInput, rrule: "FREQ=DAILY;COUNT=2;UNTIL=20270401T000000Z" }),
    ).toMatchObject({ fieldErrors: { rrule: expect.stringContaining("COUNT and UNTIL") } });
  });
});

describe("the occurrence-identity contract", () => {
  it("refuses an UNSCOPED write whose target is an override", async () => {
    // This is the half that closes the soft-delete hole: it is the only path by which
    // an override could be soft-deleted while its master is still live.
    findEvent.mockResolvedValue({ ...eventTarget, recurrenceParentId: NEW_MASTER });
    expect(await updateEvent({ ...eventInput, ...noScope, id: EVENT })).toMatchObject({
      fieldErrors: { id: expect.any(String) },
    });
    expect(await deleteEvent({ id: EVENT, ...noScope })).toMatchObject({
      fieldErrors: { id: expect.any(String) },
    });
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("refuses a SCOPED write whose target is an override", async () => {
    findEvent.mockResolvedValue({ ...eventTarget, recurrenceParentId: NEW_MASTER });
    expect(
      await updateEvent({
        ...seriesInput,
        rrule: null,
        id: EVENT,
        scope: "this",
        recurrenceId: THIRD,
      }),
    ).toMatchObject({ fieldErrors: { id: expect.any(String) } });
  });

  it("refuses a scope on an event that does not repeat", async () => {
    expect(
      await updateEvent({ ...eventInput, id: EVENT, scope: "this", recurrenceId: THIRD }),
    ).toMatchObject({ fieldErrors: { scope: expect.any(String) } });
    expect(
      await deleteEvent({ id: EVENT, scope: "thisAndFollowing", recurrenceId: THIRD }),
    ).toMatchObject({ fieldErrors: { scope: expect.any(String) } });
  });

  it("refuses to move ONE occurrence to another calendar", async () => {
    // The composite FK ties an override to its master's calendar, and moving the whole
    // series is correct automatically through ON UPDATE CASCADE.
    findEvent.mockResolvedValue(seriesTarget);
    expect(
      await updateEvent({
        ...seriesInput,
        rrule: null,
        calendarId: OTHER_CAL,
        id: EVENT,
        scope: "this",
        recurrenceId: THIRD,
      }),
    ).toMatchObject({ fieldErrors: { calendarId: expect.any(String) } });
  });

  it("answers with the MASTER's id, never the override's", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    dbInsert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    });
    expect(
      await updateEvent({
        ...seriesInput,
        rrule: null,
        id: EVENT,
        scope: "this",
        recurrenceId: THIRD,
      }),
    ).toEqual({ data: { id: EVENT, calendarId: CAL } });
  });
});

describe("updateEvent, scope: this", () => {
  it("writes an override carrying the master's uid and calendar, with no rule", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    let written: Record<string, unknown> = {};
    dbInsert.mockReturnValue({
      values: (row: Record<string, unknown>) => {
        written = row;
        return { onConflictDoUpdate: () => Promise.resolve() };
      },
    });

    await updateEvent({
      ...seriesInput,
      rrule: null,
      id: EVENT,
      scope: "this",
      recurrenceId: THIRD,
    });

    expect(written).toMatchObject({
      calendarId: CAL,
      uid: "uid-master",
      recurrenceParentId: EVENT,
      recurrenceId: THIRD,
      rrule: null,
      seriesEndAt: null,
    });
  });
});

describe("updateEvent, scope: thisAndFollowing", () => {
  it("splits the series, rewriting the uid on every re-parented override", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction();

    const result = await updateEvent({
      ...seriesInput,
      id: EVENT,
      scope: "thisAndFollowing",
      recurrenceId: THIRD,
    });
    expect(result).toEqual({ data: { id: NEW_MASTER, calendarId: CAL } });

    const created = log.inserts[0];
    expect(created?.uid).toEqual(expect.any(String));
    // A NEW uid: a subscriber that saw one UID split into two events at the same UID
    // would show a duplicate.
    expect(created?.uid).not.toBe("uid-master");

    // The uid rewrite is the assertion, not the re-parenting: without it the split
    // manufactures the exact corruption the schema leaves writer-enforced.
    const reparent = log.updates.find((row) => "recurrenceParentId" in row);
    expect(reparent).toEqual({ recurrenceParentId: NEW_MASTER, uid: created?.uid });

    // The recurrence-date rows follow their occurrences.
    expect(log.updates).toContainEqual({ eventId: NEW_MASTER });

    // …and the first half is bounded rather than left running.
    const bounded = log.updates.find((row) => typeof row.rrule === "string");
    expect(bounded?.rrule).toEqual(expect.stringContaining("UNTIL="));
  });

  it("splits a COUNT rule by COUNT, not by UNTIL", async () => {
    findEvent.mockResolvedValue({ ...seriesTarget, rrule: "FREQ=WEEKLY;COUNT=5;BYDAY=MO" });
    const log = recordingTransaction();

    await updateEvent({
      ...seriesInput,
      rrule: "FREQ=WEEKLY;COUNT=5;BYDAY=MO",
      id: EVENT,
      scope: "thisAndFollowing",
      recurrenceId: THIRD,
    });

    // Two occurrences before the cut, so 2 + 3 = the original 5. Translating this into
    // an UNTIL would drag the UTC-UNTIL-vs-zoned-DTSTART question into the commonest
    // edit in the product.
    expect(log.inserts[0]?.rrule).toBe("FREQ=WEEKLY;COUNT=3;BYDAY=MO");
    expect(log.updates.find((row) => typeof row.rrule === "string")?.rrule).toBe(
      "FREQ=WEEKLY;COUNT=2;BYDAY=MO",
    );
  });

  it("treats a cut at the FIRST occurrence as scope: all", async () => {
    // Taking it literally would write COUNT=0 — a rule parseRRule then refuses to read.
    findEvent.mockResolvedValue(seriesTarget);
    const result = await updateEvent({
      ...seriesInput,
      id: EVENT,
      scope: "thisAndFollowing",
      recurrenceId: "2027-03-15 09:00:00",
    });
    expect(result).toEqual({ data: { id: EVENT, calendarId: CAL } });
    // It fell through to `updateWholeEvent`, which never inserts a second master. The
    // old spelling of this assertion was "no transaction at all"; from Phase 3 every
    // whole-event write opens one, so the tell is the absence of the split's INSERT.
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("refuses a date that is not part of the series", async () => {
    findEvent.mockResolvedValue({ ...seriesTarget, rrule: "FREQ=WEEKLY;COUNT=2;BYDAY=MO" });
    expect(
      await updateEvent({
        ...seriesInput,
        rrule: "FREQ=WEEKLY;COUNT=2;BYDAY=MO",
        id: EVENT,
        scope: "thisAndFollowing",
        recurrenceId: "2027-06-07 09:00:00",
      }),
    ).toMatchObject({ fieldErrors: { recurrenceId: expect.any(String) } });
  });

  it("refuses to turn repetition off from a date onward", async () => {
    // It would leave the re-parented overrides pointing at a non-recurring parent.
    findEvent.mockResolvedValue(seriesTarget);
    expect(
      await updateEvent({
        ...seriesInput,
        rrule: null,
        id: EVENT,
        scope: "thisAndFollowing",
        recurrenceId: THIRD,
      }),
    ).toMatchObject({ fieldErrors: { rrule: expect.any(String) } });
  });
});

describe("updateEvent, scope: all", () => {
  it("drops the overrides and the skipped dates when the series MOVES", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction([{ id: EVENT, calendarId: CAL }]);

    await updateEvent({
      ...seriesInput,
      rrule: "FREQ=WEEKLY;BYDAY=TU",
      id: EVENT,
      scope: "all",
      recurrenceId: THIRD,
    });
    // Two deletes, one transaction: the overrides and the recurrence dates. A master
    // whose identity moved while its modifiers survived is the corrupt state.
    expect(log.deletes).toBe(2);
  });

  it("keeps them when only the title changed", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction();
    await updateEvent({
      ...seriesInput,
      title: "Renamed",
      id: EVENT,
      scope: "all",
      recurrenceId: THIRD,
    });
    // A rename moves nothing, so every `recurrence_id` still names a real occurrence and
    // the overrides and skipped dates survive. The transaction itself is no longer the
    // signal — Phase 3 made every whole-event write transactional, because a title edit
    // that committed while its guest-list changes did not is the worse failure — so the
    // assertion is on the writes it did NOT make.
    expect(log.deletes).toBe(0);
    expect(log.updates).toHaveLength(1);
  });

  it("feeds the surviving RDATEs into series_end_at", async () => {
    // series_end_at may over-estimate and must never under-estimate: an RDATE past the
    // rule's own end is the one thing that can extend a series, and dropping it here
    // would make the whole series vanish from the grid.
    findEvent.mockResolvedValue({ ...seriesTarget, rrule: "FREQ=WEEKLY;COUNT=2;BYDAY=MO" });
    dbSelect.mockReturnValue(selectReturning([{ kind: "rdate", dateWall: "2029-01-01 09:00:00" }]));
    let written: Record<string, unknown> = {};
    dbUpdate.mockReturnValue({
      set: (row: Record<string, unknown>) => {
        written = row;
        return {
          where: () => ({ returning: () => Promise.resolve([{ id: EVENT, calendarId: CAL }]) }),
        };
      },
    });

    await updateEvent({
      ...seriesInput,
      rrule: "FREQ=WEEKLY;COUNT=2;BYDAY=MO",
      title: "Renamed",
      id: EVENT,
      scope: "all",
      recurrenceId: THIRD,
    });
    expect((written.seriesEndAt as Date).getUTCFullYear()).toBe(2029);
  });

  it("logs an unrecognised recurrence-date kind instead of dropping it", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    dbSelect.mockReturnValue(
      selectReturning([{ kind: "exrule", dateWall: "2027-04-05 09:00:00" }]),
    );
    await updateEvent({ ...seriesInput, title: "Renamed", id: EVENT, ...noScope });
    expect(logError).toHaveBeenCalledWith(
      "calendar.recurrence-date kind not recognised",
      expect.objectContaining({ kinds: ["exrule"] }),
    );
  });
});

describe("deleteEvent, scoped", () => {
  it("is rate limited", async () => {
    rateLimit.mockResolvedValue({ success: false });
    expect(await deleteEvent({ id: EVENT, ...noScope })).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
  });

  it("skips ONE occurrence with an EXDATE and hard-deletes its override", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction();

    expect(await deleteEvent({ id: EVENT, scope: "this", recurrenceId: THIRD })).toEqual({
      data: { id: EVENT },
    });
    expect(log.inserts[0]).toEqual({ eventId: EVENT, kind: "exdate", dateWall: THIRD });
    // HARD: the EXDATE is the durable record of the skip, so a soft-deleted override
    // beside it is redundant state that can disagree with it.
    expect(log.deletes).toBe(1);
    // An EXDATE never recomputes series_end_at — that column is blind to exclusions. The
    // one update is the SEQUENCE bump: the EXDATE *is* in the emitted `.ics`, so without it
    // the update email ships an attachment every conforming client ignores and the guest
    // keeps a meeting that was cancelled.
    expect(log.updates).toHaveLength(1);
    expect(log.updates[0]).toHaveProperty("sequence");
    expect(log.updates[0]).not.toHaveProperty("seriesEndAt");
    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(EVENT, false);
  });

  it("bounds the series and drops everything at or after the cut", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction();

    await deleteEvent({ id: EVENT, scope: "thisAndFollowing", recurrenceId: THIRD });
    expect(log.updates[0]?.rrule).toEqual(expect.stringContaining("UNTIL="));
    expect(log.deletes).toBe(2);
  });

  it("soft-deletes a master AND its overrides in one transaction", async () => {
    // Measured: an override matches the concrete branch exactly, so soft-deleting the
    // master alone leaves the grid painting the occurrences of a deleted series.
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction();

    await deleteEvent({ id: EVENT, ...noScope });
    expect(log.updates).toHaveLength(2);
    expect(log.updates[0]?.deletedAt).toBeInstanceOf(Date);
    expect(log.updates[1]?.deletedAt).toBeInstanceOf(Date);
  });

  it("deletes the whole series when the cut is its first occurrence", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction();
    await deleteEvent({
      id: EVENT,
      scope: "thisAndFollowing",
      recurrenceId: "2027-03-15 09:00:00",
    });
    expect(log.updates).toHaveLength(2);
    expect(log.deletes).toBe(0);
  });
});

describe("setRecurrenceDate", () => {
  const skip = { eventId: EVENT, kind: "exdate", dateWall: THIRD } as const;

  it("refuses without a session and when rate limited", async () => {
    getSessionApi.mockResolvedValue(null);
    expect(await setRecurrenceDate(skip)).toEqual({ error: "Unauthorized" });
    getSessionApi.mockResolvedValue(SESSION);
    rateLimit.mockResolvedValue({ success: false });
    expect(await setRecurrenceDate(skip)).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
  });

  it("returns field errors for a bad input", async () => {
    expect(await setRecurrenceDate({ ...skip, eventId: "nope" })).toMatchObject({
      error: "Please fix the fields below.",
    });
  });

  it("refuses an event that does not repeat, and an override", async () => {
    expect(await setRecurrenceDate(skip)).toMatchObject({
      fieldErrors: { eventId: expect.any(String) },
    });
    findEvent.mockResolvedValue({ ...seriesTarget, recurrenceParentId: NEW_MASTER });
    expect(await setRecurrenceDate(skip)).toMatchObject({
      fieldErrors: { id: expect.any(String) },
    });
  });

  it("requires write access on the master's calendar", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    getCalendarRole.mockResolvedValue("reader");
    expect(await setRecurrenceDate(skip)).toEqual({ error: "Forbidden" });
  });

  it("writes an EXDATE idempotently and does NOT recompute series_end_at", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction();
    expect(await setRecurrenceDate(skip)).toEqual({ data: { eventId: EVENT, kind: "exdate" } });
    expect(log.inserts[0]).toEqual(skip);
    // The only update is the SEQUENCE bump — `series_end_at` stays untouched, because that
    // column is blind to exclusions by design and must remain a permanent over-estimate.
    expect(log.updates).toHaveLength(1);
    expect(log.updates[0]).toHaveProperty("sequence");
    expect(log.updates[0]).not.toHaveProperty("seriesEndAt");
  });

  it("recomputes series_end_at for an RDATE, reading the rows back inside the write", async () => {
    findEvent.mockResolvedValue({ ...seriesTarget, rrule: "FREQ=WEEKLY;COUNT=2;BYDAY=MO" });
    const log = recordingTransaction(undefined, [
      { kind: "rdate", dateWall: "2029-01-01 09:00:00" },
    ]);
    await setRecurrenceDate({ ...skip, kind: "rdate", dateWall: "2029-01-01 09:00:00" });
    // [0] is the SEQUENCE bump both kinds do; [1] is the RDATE-only recompute.
    expect(log.updates[0]).toHaveProperty("sequence");
    expect((log.updates[1]?.seriesEndAt as Date).getUTCFullYear()).toBe(2029);
  });

  it("emails the guests either way — both kinds change the emitted .ics", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    recordingTransaction();
    await setRecurrenceDate(skip);
    // Resends, never re-asks: the occurrences that remain are at the times their guests
    // already agreed to.
    expect(enqueueSeriesUpdate).toHaveBeenCalledWith(EVENT, false);
  });

  it("maps a failed write", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    dbTransaction.mockRejectedValue(new Error("boom"));
    expect(await setRecurrenceDate(skip)).toEqual({
      error: "Failed to update the repeating event.",
    });
  });

  it("treats a missing or soft-deleted master as not found", async () => {
    findEvent.mockResolvedValue(undefined);
    expect(await setRecurrenceDate(skip)).toEqual({ error: "Event not found" });
    findEvent.mockResolvedValue({ ...seriesTarget, deletedAt: new Date() });
    expect(await setRecurrenceDate(skip)).toEqual({ error: "Event not found" });
  });

  it("logs an unrecognised kind found while recomputing", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    const log = recordingTransaction(undefined, [{ kind: "exrule", dateWall: THIRD }]);
    await setRecurrenceDate({ ...skip, kind: "rdate" });
    // The SEQUENCE bump plus the recompute.
    expect(log.updates).toHaveLength(2);
    expect(logError).toHaveBeenCalledWith(
      "calendar.recurrence-date kind not recognised",
      expect.objectContaining({ kinds: ["exrule"] }),
    );
  });
});

describe("a stored rule that no longer parses", () => {
  // Detect and report, never crash: the same posture the schema's writer-enforced
  // invariants take. A grammar narrowed by a later phase must not make an existing
  // series un-editable and un-deletable.
  const broken = { ...seriesTarget, rrule: "FREQ=HOURLY" };

  it("is a message on every scoped path, not a 500", async () => {
    findEvent.mockResolvedValue(broken);
    expect(
      await updateEvent({
        ...seriesInput,
        id: EVENT,
        scope: "thisAndFollowing",
        recurrenceId: THIRD,
      }),
    ).toEqual({ error: "This repeating event's rule could not be read." });
    expect(
      await deleteEvent({ id: EVENT, scope: "thisAndFollowing", recurrenceId: THIRD }),
    ).toEqual({ error: "This repeating event's rule could not be read." });
    expect(await setRecurrenceDate({ eventId: EVENT, kind: "rdate", dateWall: THIRD })).toEqual({
      error: "This repeating event's rule could not be read.",
    });
  });

  it("still lets the whole event be edited, which is how it gets fixed", async () => {
    findEvent.mockResolvedValue(broken);
    recordingTransaction([{ id: EVENT, calendarId: CAL }]);
    expect(await updateEvent({ ...seriesInput, id: EVENT, ...noScope })).toEqual({
      data: { id: EVENT, calendarId: CAL },
    });
  });
});

describe("recurrence writes that fail", () => {
  it("reports a bad submitted rule on an unscoped update", async () => {
    expect(
      await updateEvent({ ...eventInput, rrule: "FREQ=SECONDLY", id: EVENT, ...noScope }),
    ).toMatchObject({ fieldErrors: { rrule: expect.stringContaining("SECONDLY") } });
  });

  it("refuses a cut past a UNTIL bound", async () => {
    findEvent.mockResolvedValue({
      ...seriesTarget,
      rrule: "FREQ=WEEKLY;UNTIL=20270401T000000Z;BYDAY=MO",
    });
    expect(
      await deleteEvent({
        id: EVENT,
        scope: "thisAndFollowing",
        recurrenceId: "2028-01-03 09:00:00",
      }),
    ).toMatchObject({ fieldErrors: { recurrenceId: expect.any(String) } });
  });

  it("partitions the RDATE rows across the cut", async () => {
    // A COUNT rule, because an RDATE cannot bound an unbounded series: `series_end_at`
    // stays NULL there, and NULL is not an under-estimate.
    const counted = "FREQ=WEEKLY;COUNT=5;BYDAY=MO";
    findEvent.mockResolvedValue({ ...seriesTarget, rrule: counted });
    dbSelect.mockReturnValue(
      selectReturning([
        { kind: "rdate", dateWall: "2027-03-17 09:00:00" },
        { kind: "rdate", dateWall: "2029-01-01 09:00:00" },
      ]),
    );
    const log = recordingTransaction();

    await updateEvent({
      ...seriesInput,
      rrule: counted,
      id: EVENT,
      scope: "thisAndFollowing",
      recurrenceId: THIRD,
    });
    // The 2029 RDATE moved with the second half, so only IT extends a series_end_at —
    // the first half's bound must not inherit it.
    expect((log.inserts[0]?.seriesEndAt as Date).getUTCFullYear()).toBe(2029);
    const bounded = log.updates.find((row) => typeof row.rrule === "string");
    expect((bounded?.seriesEndAt as Date).getUTCFullYear()).toBe(2027);
  });

  it("maps a failed split and a failed occurrence write", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    dbTransaction.mockRejectedValue(new Error("boom"));
    expect(
      await updateEvent({
        ...seriesInput,
        id: EVENT,
        scope: "thisAndFollowing",
        recurrenceId: THIRD,
      }),
    ).toEqual({ error: "Failed to update the event." });

    dbInsert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: () => Promise.reject(new Error("boom")) }),
    });
    expect(
      await updateEvent({
        ...seriesInput,
        rrule: null,
        id: EVENT,
        scope: "this",
        recurrenceId: THIRD,
      }),
    ).toEqual({ error: "Failed to update the event." });
  });

  it("maps a failed scoped delete", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    dbTransaction.mockRejectedValue(new Error("boom"));
    expect(await deleteEvent({ id: EVENT, scope: "this", recurrenceId: THIRD })).toEqual({
      error: "Failed to delete the event.",
    });
    expect(
      await deleteEvent({ id: EVENT, scope: "thisAndFollowing", recurrenceId: THIRD }),
    ).toEqual({ error: "Failed to delete the event." });
  });

  it("surfaces a split insert that returns no row", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    recordingTransaction([]);
    expect(
      await updateEvent({
        ...seriesInput,
        id: EVENT,
        scope: "thisAndFollowing",
        recurrenceId: THIRD,
      }),
    ).toEqual({ error: "Failed to update the event." });
  });

  it("surfaces a whole-event update that returns no row while dropping modifiers", async () => {
    findEvent.mockResolvedValue(seriesTarget);
    recordingTransaction([]);
    expect(
      await updateEvent({
        ...seriesInput,
        rrule: "FREQ=WEEKLY;BYDAY=TU",
        id: EVENT,
        scope: "all",
        recurrenceId: THIRD,
      }),
    ).toEqual({ error: "Failed to update the event." });
  });
});
