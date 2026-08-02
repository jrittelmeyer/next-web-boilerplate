import { describe, expect, it } from "vitest";
import { formatEventWhen } from "./format";

/**
 * Moved here from `apps/web/src/server/calendar/invitations.test.ts` in Phase 5, with the
 * function, when the reminder sweeper in `@repo/jobs` became a second caller that cannot
 * reach `apps/web`. The assertions are unchanged — the point of moving rather than
 * duplicating is that these keep guarding both callers at once.
 */
describe("formatEventWhen", () => {
  it("keeps the wall clock intact and names the zone", () => {
    // The civil reading is formatted AS IF UTC and the zone stated separately — applying
    // the zone here as well would shift the time the organizer typed.
    expect(
      formatEventWhen({
        startWall: "2026-08-10 09:00:00",
        startTzid: "Asia/Kolkata",
        allDay: false,
      }),
    ).toBe("Monday, 10 August 2026 at 09:00 (Asia/Kolkata)");
  });

  it("omits the time and the zone for an all-day event, which floats", () => {
    expect(
      formatEventWhen({ startWall: "2026-08-10 00:00:00", startTzid: "UTC", allDay: true }),
    ).toBe("Monday, 10 August 2026 (all day)");
  });

  it("does not throw on a malformed reading — the fallbacks are a floor, not a feature", () => {
    // Every caller passes a `timestamp(0)` column value, so these branches are unreachable
    // in practice. They exist so a support script or a future importer that hands over
    // something else gets a wrong-looking string rather than a thrown job that
    // dead-letters, and they are covered here so the gate does not hide them.
    // Pinned as it actually behaves, not as it reads. `"".split("-")` is `[""]`, and
    // `Number("")` is 0 — not undefined — so `year ?? 1970` never fires, and `Date.UTC(0, …)`
    // silently maps year 0 into 1900. That is the exact two-digit-year trap
    // docs/context/calendar/model.md cites as the reason `civil.ts` uses Hinnant's algorithm
    // instead of `Date.UTC`. Recorded rather than "fixed": this function was moved verbatim
    // in Phase 5 and changing its output during a move would be a silent behaviour change to
    // the Phase-4 invitation email.
    expect(formatEventWhen({ startWall: "", startTzid: "UTC", allDay: true })).toBe(
      "Monday, 1 January 1900 (all day)",
    );
    // A date with no time part: the `?? 1` fallbacks are unused here, and the empty time
    // simply renders empty. Callers always pass a `timestamp(0)` value, so this is a floor.
    expect(formatEventWhen({ startWall: "2026-08-10", startTzid: "UTC", allDay: false })).toBe(
      "Monday, 10 August 2026 at  (UTC)",
    );
  });

  it("renders the same reading identically whatever the host zone is", () => {
    // The reason `Date.UTC` + `timeZone: "UTC"` are paired: a formatter that let the host
    // zone in would render this box (America/New_York) a day earlier for a midnight
    // reading, and the bug would be invisible on any machine running UTC.
    const before = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati";
      const east = formatEventWhen({
        startWall: "2026-08-10 00:00:00",
        startTzid: "UTC",
        allDay: true,
      });
      process.env.TZ = "Pacific/Midway";
      const west = formatEventWhen({
        startWall: "2026-08-10 00:00:00",
        startTzid: "UTC",
        allDay: true,
      });
      expect(east).toBe("Monday, 10 August 2026 (all day)");
      expect(west).toBe(east);
    } finally {
      process.env.TZ = before;
    }
  });
});
