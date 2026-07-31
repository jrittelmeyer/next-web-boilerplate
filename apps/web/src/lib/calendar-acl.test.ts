import { beforeEach, describe, expect, it, vi } from "vitest";

// Same posture as rbac.test.ts: mock the DB read, keep `@repo/db/schema` and
// drizzle's `eq` real (pure, pool-free).
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@repo/db", () => ({ db: { query: { calendars: { findFirst } } } }));

import {
  CALENDAR_ROLES,
  canAdministerCalendar,
  canWriteCalendar,
  getCalendarRole,
} from "./calendar-acl";

beforeEach(() => vi.clearAllMocks());

const OWNED = { id: "cal-1", userId: "u1", organizationId: null };

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
