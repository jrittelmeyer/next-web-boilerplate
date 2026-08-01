import { beforeEach, describe, expect, it, vi } from "vitest";

// Same posture as rbac.test.ts: mock the DB read, keep `@repo/db/schema` and
// drizzle's `eq` real (pure, pool-free).
const { findFirst, findEvent, dbSelect } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findEvent: vi.fn(),
  dbSelect: vi.fn(),
}));
vi.mock("@repo/db", () => ({
  db: {
    query: { calendars: { findFirst }, calendarEvents: { findFirst: findEvent } },
    select: dbSelect,
  },
}));

import * as acl from "./calendar-acl";
import {
  CALENDAR_ROLES,
  canAdministerCalendar,
  canReadEvent,
  canRespondToEvent,
  canWriteCalendar,
  getCalendarRole,
  getEventAccess,
} from "./calendar-acl";

/** `db.select(...).from(...).innerJoin(...).where(...).limit(1)` — the attendee probe. */
function attendeeRows(rows: unknown[]) {
  return {
    from: () => ({
      innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbSelect.mockReturnValue(attendeeRows([]));
});

const OWNED = { id: "cal-1", userId: "u1", organizationId: null };

const EVENT = "11111111-2222-4333-8444-555555555555";
const OVERRIDE = "99999999-8888-4777-8666-555555555555";

/** A live series master on the calendar `u1` owns. */
const master = {
  id: EVENT,
  calendarId: "cal-1",
  recurrenceParentId: null,
  deletedAt: null,
};

describe("getCalendarRole", () => {
  it("returns null when the calendar does not exist", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await getCalendarRole("missing", "u1")).toBeNull();
  });

  it("returns owner for the row's user_id", async () => {
    findFirst.mockResolvedValue(OWNED);
    expect(await getCalendarRole("cal-1", "u1")).toBe("owner");
  });

  it("returns null for a stranger — Phase 1 grants nothing but ownership", async () => {
    findFirst.mockResolvedValue(OWNED);
    expect(await getCalendarRole("cal-1", "u2")).toBeNull();
  });

  it("grants nothing to a fellow org member yet", async () => {
    // The organization resolver is present and deliberately empty until Phase 6.
    // Pinning that here means Phase 6 has to change a test to change the behaviour,
    // rather than discovering it changed.
    findFirst.mockResolvedValue({ ...OWNED, organizationId: "org-1" });
    expect(await getCalendarRole("cal-1", "u2")).toBeNull();
  });
});

describe("role predicates", () => {
  it("lets writers and owners write events", () => {
    expect(canWriteCalendar("owner")).toBe(true);
    expect(canWriteCalendar("writer")).toBe(true);
    expect(canWriteCalendar("reader")).toBe(false);
    expect(canWriteCalendar(null)).toBe(false);
  });

  it("lets only the owner administer the calendar itself", () => {
    // The distinction is load-bearing from Phase 6: a writer may add events to a
    // calendar they must not be able to delete out from under its owner.
    expect(canAdministerCalendar("owner")).toBe(true);
    expect(canAdministerCalendar("writer")).toBe(false);
    expect(canAdministerCalendar("reader")).toBe(false);
    expect(canAdministerCalendar(null)).toBe(false);
  });

  it("keeps CALENDAR_ROLES ordered weakest-first", () => {
    // CALENDAR_ROLE_RANK is derived from this order; appending a role instead of
    // inserting it at its true position would silently invert canWriteCalendar.
    expect(CALENDAR_ROLES).toEqual(["reader", "writer", "owner"]);
  });
});

describe("getEventAccess", () => {
  it("exports no write predicate, and that is the assertion", () => {
    // The guarantee this phase rests on is "attendance never grants write". Keeping it
    // structural means there must be nothing in this module that a caller holding an
    // event id could reach for instead of `getCalendarRole` + `canWriteCalendar`. A
    // reviewer cannot enforce that; this can.
    expect(Object.keys(acl)).not.toContain("canWriteEvent");
    expect("canWriteEvent" in acl).toBe(false);
  });

  it("grants nothing for an event that does not exist", async () => {
    findEvent.mockResolvedValue(undefined);
    const access = await getEventAccess("missing", "u1");
    expect(canReadEvent(access)).toBe(false);
    expect(access.masterId).toBeNull();
    // Not-permitted and does-not-exist are the same answer on purpose.
    expect(canRespondToEvent(access)).toBe(false);
  });

  it("grants nothing for a soft-deleted event, even to its owner", async () => {
    // Otherwise a `calendar_cancelled` notification could link straight to a deleted
    // event — which is why the masters view's predicate is part of the authorization
    // answer rather than a projection.
    findEvent.mockResolvedValue({ ...master, deletedAt: new Date() });
    findFirst.mockResolvedValue(OWNED);
    expect(canReadEvent(await getEventAccess(EVENT, "u1"))).toBe(false);
  });

  it("resolves an override id to its master and answers for the master", async () => {
    findEvent
      .mockResolvedValueOnce({ ...master, id: OVERRIDE, recurrenceParentId: EVENT })
      .mockResolvedValueOnce(master);
    findFirst.mockResolvedValue(OWNED);

    const access = await getEventAccess(OVERRIDE, "u1");
    expect(canReadEvent(access)).toBe(true);
    // Attendees hang off the series, so a caller handed either id can write the right row.
    expect(access.masterId).toBe(EVENT);
  });

  it("grants nothing when an override's master is gone", async () => {
    // The "an override is only reachable through a live master" invariant is enforced by
    // writers, not by the database, so the master is re-read rather than assumed.
    findEvent
      .mockResolvedValueOnce({ ...master, id: OVERRIDE, recurrenceParentId: EVENT })
      .mockResolvedValueOnce(undefined);
    expect(canReadEvent(await getEventAccess(OVERRIDE, "u1"))).toBe(false);
  });

  it("lets the calendar owner read without making them a guest", async () => {
    findEvent.mockResolvedValue(master);
    findFirst.mockResolvedValue(OWNED);

    const access = await getEventAccess(EVENT, "u1");
    expect(canReadEvent(access)).toBe(true);
    // Holding a calendar role is not holding a row: an organizer who never added
    // themselves has nothing to answer.
    expect(canRespondToEvent(access)).toBe(false);
    expect(access.response).toBeNull();
  });

  it("lets an attendee of someone else's calendar read and respond", async () => {
    findEvent.mockResolvedValue(master);
    findFirst.mockResolvedValue(OWNED);
    dbSelect.mockReturnValue(attendeeRows([{ status: "tentative" }]));

    const access = await getEventAccess(EVENT, "u2");
    expect(canReadEvent(access)).toBe(true);
    expect(canRespondToEvent(access)).toBe(true);
    // Their own stored answer, so a route never has to work out which row is the caller.
    expect(access.response).toBe("tentative");
  });

  it("grants nothing to a stranger with no row and no role", async () => {
    findEvent.mockResolvedValue(master);
    findFirst.mockResolvedValue(OWNED);
    expect(canReadEvent(await getEventAccess(EVENT, "u3"))).toBe(false);
  });

  it("skips the event read when the caller already has the row", async () => {
    // The detail route and `calendar.byId` both join the event anyway; re-reading it
    // would make the cheapest page in the feature pay for the ACL twice.
    findFirst.mockResolvedValue(OWNED);
    const access = await getEventAccess(EVENT, "u1", master);
    expect(canReadEvent(access)).toBe(true);
    expect(findEvent).not.toHaveBeenCalled();
  });
});
