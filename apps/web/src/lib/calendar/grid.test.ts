import { instantToCivil } from "@repo/calendar";
import { describe, expect, it } from "vitest";
import {
  allDayWallRange,
  buildMonthGrid,
  DAYS_PER_WEEK,
  type EventSpanInput,
  eventSpan,
  inclusiveEndDate,
  monthGridWindowMs,
  placeEventsOnMonthGrid,
} from "./grid";

function timed(id: string, startAtMs: number, endAtMs: number): EventSpanInput {
  return { id, allDay: false, startWall: "", endWall: "", startAtMs, endAtMs };
}

function allDay(id: string, startDate: string, exclusiveEndDate: string): EventSpanInput {
  return {
    id,
    allDay: true,
    startWall: `${startDate} 00:00:00`,
    endWall: `${exclusiveEndDate} 00:00:00`,
    startAtMs: 0,
    endAtMs: 0,
  };
}

/** Epoch ms for a UTC wall reading — test input only, never production maths. */
const utc = (iso: string) => Date.parse(`${iso}Z`);

describe("buildMonthGrid", () => {
  it("pads to whole weeks from a Sunday week start", () => {
    // 2027-03-01 is a Monday, so a Sunday-start grid borrows one leading day.
    const grid = buildMonthGrid(2027, 3, 0);
    expect(grid.weeks[0]?.[0]).toEqual({ date: "2027-02-28", day: 28, inMonth: false });
    expect(grid.weeks[0]?.[1]).toEqual({ date: "2027-03-01", day: 1, inMonth: true });
    expect(grid.firstDate).toBe("2027-02-28");
    for (const week of grid.weeks) expect(week).toHaveLength(DAYS_PER_WEEK);
  });

  it("shifts the borrowed days when the week starts on Monday", () => {
    const grid = buildMonthGrid(2027, 3, 1);
    expect(grid.weeks[0]?.[0]?.date).toBe("2027-03-01");
    expect(grid.firstDate).toBe("2027-03-01");
  });

  it("supports a Saturday week start", () => {
    const grid = buildMonthGrid(2027, 3, 6);
    expect(grid.weeks[0]?.[0]?.date).toBe("2027-02-27");
  });

  it("uses only the weeks the month needs", () => {
    // A 28-day February beginning on the week-start day is exactly four rows; the
    // grid must not invent a fifth full week of March.
    const february = buildMonthGrid(2027, 2, 1); // 2027-02-01 is a Monday
    expect(february.weeks).toHaveLength(4);
    expect(february.lastDate).toBe("2027-02-28");

    // 2027-05-01 is a Saturday: a Sunday-start May needs six rows.
    const may = buildMonthGrid(2027, 5, 0);
    expect(may.weeks).toHaveLength(6);
  });

  it("handles a leap February and a year boundary", () => {
    const leap = buildMonthGrid(2028, 2, 0);
    expect(leap.weeks.flat().filter((cell) => cell.inMonth)).toHaveLength(29);

    const december = buildMonthGrid(2027, 12, 0);
    expect(december.lastDate >= "2028-01-01").toBe(true);
  });
});

describe("monthGridWindowMs", () => {
  it("brackets the whole grid in the viewer's zone", () => {
    const grid = buildMonthGrid(2027, 3, 0);
    const { fromMs, toMs } = monthGridWindowMs(grid, "Asia/Tokyo");

    // A day before the first cell and two days past the last, resolved in Tokyo —
    // the naive UTC bounds would clip the corners for any zone east of Greenwich.
    expect(instantToCivil(fromMs, "Asia/Tokyo")).toMatchObject({
      year: 2027,
      month: 2,
      day: 27,
      hour: 0,
    });
    expect(fromMs).toBeLessThan(toMs);
    expect(toMs - fromMs).toBeGreaterThan(30 * 86_400_000);
  });

  it("produces a wider window than the naive UTC bounds for an eastern zone", () => {
    const grid = buildMonthGrid(2027, 3, 0);
    const tokyo = monthGridWindowMs(grid, "Asia/Tokyo");
    const losAngeles = monthGridWindowMs(grid, "America/Los_Angeles");
    // Same grid, different zones — the windows are offset, not identical.
    expect(tokyo.fromMs).not.toBe(losAngeles.fromMs);
    expect(tokyo.fromMs).toBeLessThan(losAngeles.fromMs);
  });
});

describe("eventSpan — all-day rows are zone-independent", () => {
  it("converts an exclusive end to an inclusive last day", () => {
    expect(eventSpan(allDay("a", "2027-03-14", "2027-03-15"), "UTC")).toEqual({
      firstDate: "2027-03-14",
      lastDate: "2027-03-14",
    });
    expect(eventSpan(allDay("a", "2027-03-14", "2027-03-17"), "UTC")).toEqual({
      firstDate: "2027-03-14",
      lastDate: "2027-03-16",
    });
  });

  it("lands on the same single cell no matter who is looking", () => {
    // The bug this exists to prevent: running an all-day event through a zone
    // conversion slides it to the previous day for viewers west of the event.
    const event = allDay("a", "2027-04-04", "2027-04-05");
    for (const zone of ["UTC", "Pacific/Auckland", "America/Los_Angeles", "America/Santiago"]) {
      expect(eventSpan(event, zone)).toEqual({
        firstDate: "2027-04-04",
        lastDate: "2027-04-04",
      });
    }
  });

  it("still paints a cell for a degenerate zero-length row", () => {
    expect(eventSpan(allDay("a", "2027-03-14", "2027-03-14"), "UTC")).toEqual({
      firstDate: "2027-03-14",
      lastDate: "2027-03-14",
    });
  });
});

describe("eventSpan — timed rows follow the viewer", () => {
  it("places a late New York meeting on the next day in Tokyo", () => {
    // 2027-03-15 21:00 New York (EDT, −04:00) = 2027-03-16 01:00 UTC = 10:00 Tokyo.
    const event = timed("a", utc("2027-03-16T01:00:00"), utc("2027-03-16T02:00:00"));
    expect(eventSpan(event, "America/New_York").firstDate).toBe("2027-03-15");
    expect(eventSpan(event, "Asia/Tokyo").firstDate).toBe("2027-03-16");
  });

  it("does not paint the following day for an event that ends at midnight", () => {
    const event = timed("a", utc("2027-03-15T23:00:00"), utc("2027-03-16T00:00:00"));
    expect(eventSpan(event, "UTC")).toEqual({
      firstDate: "2027-03-15",
      lastDate: "2027-03-15",
    });
  });

  it("keeps the day for an event that both starts and ends at midnight", () => {
    const event = timed("a", utc("2027-03-15T00:00:00"), utc("2027-03-15T00:00:00"));
    expect(eventSpan(event, "UTC")).toEqual({
      firstDate: "2027-03-15",
      lastDate: "2027-03-15",
    });
  });

  it("spans every day a multi-day timed event touches", () => {
    const event = timed("a", utc("2027-03-15T22:00:00"), utc("2027-03-18T03:00:00"));
    expect(eventSpan(event, "UTC")).toEqual({
      firstDate: "2027-03-15",
      lastDate: "2027-03-18",
    });
  });
});

describe("placeEventsOnMonthGrid", () => {
  const grid = buildMonthGrid(2027, 3, 0); // first cell 2027-02-28 (Sunday)

  it("returns one segment per week an event touches, with the wrap flags set", () => {
    // 2027-03-03 (Wed) → 2027-03-09 (Tue): crosses the week boundary once.
    const { segments } = placeEventsOnMonthGrid(
      grid,
      [allDay("a", "2027-03-03", "2027-03-10")],
      "UTC",
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      weekIndex: 0,
      startColumn: 3,
      span: 4,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(segments[1]).toMatchObject({
      weekIndex: 1,
      startColumn: 0,
      span: 3,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it("stacks overlapping events into distinct lanes and reuses freed ones", () => {
    const { segments, laneCountByWeek } = placeEventsOnMonthGrid(
      grid,
      [
        allDay("a", "2027-03-01", "2027-03-04"), // Mon–Wed
        allDay("b", "2027-03-02", "2027-03-04"), // Tue–Wed, overlaps a
        allDay("c", "2027-03-04", "2027-03-06"), // Thu–Fri, free to reuse lane 0
      ],
      "UTC",
    );
    const laneOf = (id: string) => segments.find((s) => s.event.id === id)?.lane;
    expect(laneOf("a")).toBe(0);
    expect(laneOf("b")).toBe(1);
    expect(laneOf("c")).toBe(0);
    expect(laneCountByWeek[0]).toBe(2);
  });

  it("reports zero lanes for a week with nothing in it", () => {
    const { laneCountByWeek } = placeEventsOnMonthGrid(
      grid,
      [allDay("a", "2027-03-01", "2027-03-02")],
      "UTC",
    );
    expect(laneCountByWeek[0]).toBe(1);
    expect(laneCountByWeek.slice(1).every((count) => count === 0)).toBe(true);
  });

  it("is deterministic — longest first at the same start, then by id", () => {
    const events = [
      allDay("z", "2027-03-01", "2027-03-02"),
      allDay("a", "2027-03-01", "2027-03-02"),
      allDay("m", "2027-03-01", "2027-03-05"),
    ];
    const first = placeEventsOnMonthGrid(grid, events, "UTC").segments.map((s) => s.event.id);
    const shuffled = placeEventsOnMonthGrid(grid, [...events].reverse(), "UTC").segments.map(
      (s) => s.event.id,
    );
    expect(first).toEqual(["m", "a", "z"]);
    expect(shuffled).toEqual(first);
  });

  it("ignores events entirely outside the grid", () => {
    const { segments } = placeEventsOnMonthGrid(
      grid,
      [allDay("before", "2026-01-01", "2026-01-02"), allDay("after", "2028-01-01", "2028-01-02")],
      "UTC",
    );
    expect(segments).toEqual([]);
  });

  it("clips an event that starts before the grid and ends after it", () => {
    const { segments } = placeEventsOnMonthGrid(
      grid,
      [allDay("long", "2027-01-01", "2027-06-01")],
      "UTC",
    );
    expect(segments).toHaveLength(grid.weeks.length);
    expect(segments[0]).toMatchObject({ startColumn: 0, span: 7, continuesBefore: true });
    expect(segments.at(-1)).toMatchObject({ continuesAfter: true });
  });

  it("places nothing when there are no events", () => {
    const { segments, laneCountByWeek } = placeEventsOnMonthGrid(grid, [], "UTC");
    expect(segments).toEqual([]);
    expect(laneCountByWeek).toHaveLength(grid.weeks.length);
  });
});

describe("the exclusive-end conversion", () => {
  it("round-trips a single all-day day", () => {
    const range = allDayWallRange("2027-03-14", "2027-03-14");
    expect(range).toEqual({
      startWall: "2027-03-14 00:00:00",
      endWall: "2027-03-15 00:00:00",
    });
    expect(inclusiveEndDate(range.startWall, range.endWall)).toBe("2027-03-14");
  });

  it("round-trips a multi-day range", () => {
    const range = allDayWallRange("2027-03-14", "2027-03-16");
    expect(range.endWall).toBe("2027-03-17 00:00:00");
    expect(inclusiveEndDate(range.startWall, range.endWall)).toBe("2027-03-16");
  });

  it("clamps an end that precedes the start rather than inverting the event", () => {
    expect(allDayWallRange("2027-03-14", "2027-03-10")).toEqual({
      startWall: "2027-03-14 00:00:00",
      endWall: "2027-03-15 00:00:00",
    });
    expect(inclusiveEndDate("2027-03-14 00:00:00", "2027-03-01 00:00:00")).toBe("2027-03-14");
  });
});
