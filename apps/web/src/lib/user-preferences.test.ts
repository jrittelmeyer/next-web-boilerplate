import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the DB read is mocked. `canonicalizeTimeZone` from @repo/calendar stays
// REAL — it is pure and its whole job here is to answer "does this runtime still
// know that zone?", which a stub would answer by assumption rather than by fact.
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@repo/db", () => ({ db: { query: { userPreferences: { findFirst } } } }));

import { DEFAULT_TIME_ZONE, resolveUserPreferences } from "./user-preferences";

beforeEach(() => vi.clearAllMocks());

describe("resolveUserPreferences", () => {
  it("falls back to locale defaults when the user has no row", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await resolveUserPreferences("u1", "en")).toEqual({
      timeZone: DEFAULT_TIME_ZONE,
      weekStart: 0,
      timeFormat: "12h",
      hasTimeZone: false,
    });
  });

  it("derives week start and clock from the locale, not the runtime", async () => {
    findFirst.mockResolvedValue(undefined);
    // Spanish weeks start on Monday and use a 24-hour clock — a locale fact, held
    // in a hand-maintained map precisely so Node and the browser cannot disagree.
    expect(await resolveUserPreferences("u1", "es")).toMatchObject({
      weekStart: 1,
      timeFormat: "24h",
    });
  });

  it("uses stored preferences when they are set", async () => {
    findFirst.mockResolvedValue({
      timeZone: "America/New_York",
      weekStart: 6,
      timeFormat: "24h",
    });
    expect(await resolveUserPreferences("u1", "en")).toEqual({
      timeZone: "America/New_York",
      weekStart: 6,
      timeFormat: "24h",
      hasTimeZone: true,
    });
  });

  it("fills each unset column independently", async () => {
    findFirst.mockResolvedValue({ timeZone: "Europe/London", weekStart: null, timeFormat: null });
    expect(await resolveUserPreferences("u1", "en")).toEqual({
      timeZone: "Europe/London",
      weekStart: 0,
      timeFormat: "12h",
      hasTimeZone: true,
    });
  });

  it("accepts a legacy alias that Intl.supportedValuesOf omits", async () => {
    findFirst.mockResolvedValue({ timeZone: "US/Eastern", weekStart: null, timeFormat: null });
    expect(await resolveUserPreferences("u1", "en")).toMatchObject({
      timeZone: "US/Eastern",
      hasTimeZone: true,
    });
  });

  it("degrades to UTC when a stored zone is no longer known to the runtime", async () => {
    // A zone can be retired from the IANA database after it was stored. Handing it
    // to Intl.DateTimeFormat would THROW, taking down every page that renders a
    // timestamp — so one bad preference must degrade, not cascade.
    findFirst.mockResolvedValue({ timeZone: "Mars/Olympus", weekStart: null, timeFormat: null });
    expect(await resolveUserPreferences("u1", "en")).toMatchObject({
      timeZone: DEFAULT_TIME_ZONE,
      hasTimeZone: false,
    });
  });

  it("distinguishes a deliberate UTC choice from never having chosen", async () => {
    findFirst.mockResolvedValue({ timeZone: "UTC", weekStart: null, timeFormat: null });
    expect(await resolveUserPreferences("u1", "en")).toMatchObject({
      timeZone: "UTC",
      hasTimeZone: true,
    });
  });
});
