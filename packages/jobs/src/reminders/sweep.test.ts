import type { SeriesInput } from "@repo/calendar";
import { describe, expect, it } from "vitest";
import {
  dueOccurrences,
  firesInWindow,
  fireWindow,
  GRACE_MINUTES,
  occurrenceWindowFor,
  seriesFloorMs,
  startsInMinutes,
} from "./sweep";

/**
 * The sweeper's pure half. Everything with a branch worth arguing about lives here rather
 * than in the handler or in `run.ts`, precisely so it can be tested without a database —
 * see the file's own comment for why the split is load-bearing rather than tidy.
 *
 * `now` is always a literal. Nothing here calls `Date.now()`, mirroring `@repo/calendar`'s
 * leaf rule: the clock is a parameter, and in production it comes from Postgres.
 */

const NOW = Date.UTC(2027, 4, 10, 9, 0, 0); // 2027-05-10T09:00:00Z
const MINUTE = 60_000;

describe("fireWindow", () => {
  it("is half-open — (now - grace, now]", () => {
    const window = fireWindow(NOW, 60);
    expect(window.fromMs).toBe(NOW - 60 * MINUTE);
    expect(window.toMs).toBe(NOW);
  });

  it("defaults to the documented grace", () => {
    expect(fireWindow(NOW).fromMs).toBe(NOW - GRACE_MINUTES * MINUTE);
  });

  it("does not let two consecutive ticks both own the boundary instant", () => {
    // The dedupe ledger would absorb a double-claim, but an interval that cannot overlap is
    // one fewer thing resting on it. The earlier tick's `toMs` is the later tick's `fromMs`,
    // and `fromMs` is exclusive.
    const earlier = fireWindow(NOW - 5 * MINUTE, 5);
    const later = fireWindow(NOW, 5);
    expect(earlier.toMs).toBe(later.fromMs);
    expect(firesInWindow(earlier.toMs, 0, earlier)).toBe(true);
    expect(firesInWindow(earlier.toMs, 0, later)).toBe(false);
  });
});

describe("occurrenceWindowFor", () => {
  it("shifts the window by MINUS the offset — a 'before' reminder looks forward", () => {
    // The direction that is easy to get backwards: a 15-minutes-before reminder firing now
    // belongs to an occurrence starting in 15 minutes, not one that started 15 minutes ago.
    const window = fireWindow(NOW, 10);
    const occurrence = occurrenceWindowFor(window, -15);
    expect(occurrence.toMs).toBe(NOW + 15 * MINUTE);
    expect(occurrence.fromMs).toBe(NOW - 10 * MINUTE + 15 * MINUTE);
  });

  it("shifts backwards for a positive (after) offset", () => {
    const occurrence = occurrenceWindowFor(fireWindow(NOW, 10), 30);
    expect(occurrence.toMs).toBe(NOW - 30 * MINUTE);
  });

  it("is identity at offset zero", () => {
    const window = fireWindow(NOW, 10);
    expect(occurrenceWindowFor(window, 0)).toEqual(window);
  });
});

describe("firesInWindow", () => {
  const window = fireWindow(NOW, 60);

  it("includes the closing instant and excludes the opening one", () => {
    expect(firesInWindow(NOW, 0, window)).toBe(true);
    expect(firesInWindow(NOW - 60 * MINUTE, 0, window)).toBe(false);
    expect(firesInWindow(NOW - 60 * MINUTE + 1, 0, window)).toBe(true);
  });

  it("applies the offset to the START, not to the window", () => {
    // An event starting in 15 minutes with a -15 reminder fires exactly now.
    expect(firesInWindow(NOW + 15 * MINUTE, -15, window)).toBe(true);
    // The same event with no offset does not fire until it starts.
    expect(firesInWindow(NOW + 15 * MINUTE, 0, window)).toBe(false);
  });

  it("catches a backlog inside the grace window but nothing older", () => {
    // The missed-tick case: a worker down for 30 minutes still delivers on its next tick.
    expect(firesInWindow(NOW - 30 * MINUTE, 0, window)).toBe(true);
    expect(firesInWindow(NOW - 61 * MINUTE, 0, window)).toBe(false);
  });
});

describe("startsInMinutes", () => {
  it("rounds to the nearest 5, because delivery is ±5–6 minutes", () => {
    expect(startsInMinutes(NOW + 14 * MINUTE, NOW)).toBe(15);
    expect(startsInMinutes(NOW + 13 * MINUTE, NOW)).toBe(15);
    expect(startsInMinutes(NOW + 12 * MINUTE, NOW)).toBe(10);
    expect(startsInMinutes(NOW + 1440 * MINUTE, NOW)).toBe(1440);
  });

  it("clamps at zero for an occurrence already under way", () => {
    // Reachable through the grace window: a delayed sweep can dispatch after the start.
    // "starts in about -25 minutes" is worse than saying nothing about the remainder.
    expect(startsInMinutes(NOW - 25 * MINUTE, NOW)).toBe(0);
    expect(startsInMinutes(NOW, NOW)).toBe(0);
  });
});

describe("seriesFloorMs", () => {
  it("uses 367 days of slack, not 366", () => {
    // The span CHECK measures ELAPSED time, so a 366-day span crossing DST is 366d ± 1h.
    // 366 here would drop a master whose last occurrence still owes a reminder.
    const window = fireWindow(NOW, 60);
    expect(window.fromMs - seriesFloorMs(window)).toBe(367 * 24 * 60 * MINUTE);
  });
});

describe("dueOccurrences", () => {
  /** A weekly 09:00 UTC series starting 2027-05-03. */
  const weekly: SeriesInput = {
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    startWall: "2027-05-03 09:00:00",
    startTzid: "UTC",
    endWall: "2027-05-03 10:00:00",
    endTzid: "UTC",
    exdates: [],
    rdates: [],
    overriddenRecurrenceIds: [],
  };

  it("finds the occurrence whose reminder fires in this window", () => {
    // 2027-05-17 09:00Z with a -15 reminder fires at 08:45Z.
    const now = Date.UTC(2027, 4, 17, 8, 45, 0);
    const due = dueOccurrences(weekly, -15, fireWindow(now, 5));
    expect(due).toHaveLength(1);
    expect(due[0]?.startWall).toBe("2027-05-17 09:00:00");
    expect(due[0]?.startAtMs).toBe(Date.UTC(2027, 4, 17, 9, 0, 0));
  });

  it("returns nothing when no occurrence fires in the window", () => {
    const now = Date.UTC(2027, 4, 18, 8, 45, 0); // a Tuesday
    expect(dueOccurrences(weekly, -15, fireWindow(now, 5))).toEqual([]);
  });

  it("skips an occurrence the user excluded", () => {
    const now = Date.UTC(2027, 4, 17, 8, 45, 0);
    const withExdate = { ...weekly, exdates: ["2027-05-17 09:00:00" as const] };
    expect(dueOccurrences(withExdate, -15, fireWindow(now, 5))).toEqual([]);
  });

  it("skips an occurrence that has an override — branch B owns that one", () => {
    // The double-reminder bug this argument exists to prevent: an overridden occurrence is a
    // concrete row swept by its own query, so leaving it in the expansion would deliver twice.
    const now = Date.UTC(2027, 4, 17, 8, 45, 0);
    const overridden = { ...weekly, overriddenRecurrenceIds: ["2027-05-17 09:00:00" as const] };
    expect(dueOccurrences(overridden, -15, fireWindow(now, 5))).toEqual([]);
  });

  it("selects occurrences by START, and does not inherit the grid's overlap mode", () => {
    // `expandSeries` grew a `match: "overlaps"` mode for `calendar.range`, and the sweeper
    // deliberately does NOT opt in. Two reasons, and the second is the structural one:
    // `firesInWindow` is start-based, so an occurrence that merely overlaps would be
    // rejected anyway — but `limit` is applied to what expansion RETURNS, so admitting
    // occurrences that began earlier would let them sort first and evict the genuinely
    // due ones, with truncation reported as a bit and nobody the wiser.
    //
    // A long-running occurrence that is still in progress when the window opens is
    // therefore not due: its reminder fired at its start, days ago.
    const retreat: SeriesInput = {
      ...weekly,
      startWall: "2027-05-03 09:00:00",
      endWall: "2027-05-06 17:00:00",
    };
    const midOccurrence = Date.UTC(2027, 4, 4, 12, 0, 0); // inside 05-03's span
    expect(dueOccurrences(retreat, -15, fireWindow(midOccurrence, 5))).toEqual([]);
  });

  it("keeps a 09:00 series at 09:00 across a DST transition", () => {
    // The reason the sweeper expands civilly instead of stepping by 7×24h: in New York the
    // 2027-11-07 transition means the instants are NOT a uniform week apart, but the reminder
    // must still land 15 minutes before a 09:00 local start.
    const ny: SeriesInput = {
      ...weekly,
      startTzid: "America/New_York",
      endTzid: "America/New_York",
    };
    const before = dueOccurrences(ny, -15, fireWindow(Date.UTC(2027, 10, 1, 12, 45, 0), 5));
    const after = dueOccurrences(ny, -15, fireWindow(Date.UTC(2027, 10, 8, 13, 45, 0), 5));
    expect(before[0]?.startWall).toBe("2027-11-01 09:00:00");
    expect(after[0]?.startWall).toBe("2027-11-08 09:00:00");
    // Same wall clock, different UTC offsets — 168h apart would have missed the second one.
    expect(after[0]?.startAtMs).toBe(Date.UTC(2027, 10, 8, 14, 0, 0));
  });

  it("handles a day-before offset, which windows a day out", () => {
    // -1440 with a fire window at 09:00 on the 16th means the occurrence on the 17th.
    const now = Date.UTC(2027, 4, 16, 9, 0, 0);
    const due = dueOccurrences(weekly, -1440, fireWindow(now, 5));
    expect(due).toHaveLength(1);
    expect(due[0]?.startWall).toBe("2027-05-17 09:00:00");
  });

  it("includes an explicitly added date", () => {
    const now = Date.UTC(2027, 4, 19, 8, 45, 0); // a Wednesday, added by RDATE
    const withRdate = { ...weekly, rdates: ["2027-05-19 09:00:00" as const] };
    const due = dueOccurrences(withRdate, -15, fireWindow(now, 5));
    expect(due).toHaveLength(1);
    expect(due[0]?.startWall).toBe("2027-05-19 09:00:00");
  });
});
