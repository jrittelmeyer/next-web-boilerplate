import { describe, expect, it } from "vitest";
import {
  type CivilDateTime,
  dayOfWeek,
  formatLocalDateTime,
  MS_PER_DAY,
  parseLocalDateTime,
  toDayNumber,
} from "./civil";
import { expandRRule } from "./expand";
import { parseRRule } from "./rrule";
import { resolveCivil } from "./timezone";

/** A DST assertion needs the instant behind a civil reading. */
function instantOf(occurrence: CivilDateTime, timeZone: string): number {
  return resolveCivil(occurrence, timeZone).instantMs;
}

/** Consecutive gaps between occurrences, as a set. Seven days, unless an offset moved. */
function stepSizes(occurrences: readonly CivilDateTime[], timeZone: string): Set<number> {
  const steps = new Set<number>();
  for (let index = 1; index < occurrences.length; index += 1) {
    const previous = occurrences[index - 1];
    const current = occurrences[index];
    // Both are in range by construction; the guard is what `noUncheckedIndexedAccess`
    // asks for and costs nothing.
    if (previous === undefined || current === undefined) continue;
    steps.add(instantOf(current, timeZone) - instantOf(previous, timeZone));
  }
  return steps;
}

/**
 * Expansion's *rule* semantics are proved against the frozen oracle in
 * `rrule-corpus.test.ts` — 528 rules, in UTC, deliberately zone-free.
 *
 * This file proves the half the oracle cannot: what happens when a real timezone is
 * underneath. That separation is the point. A corpus that mixed the two would let a zone
 * bug hide behind a rule bug and vice versa.
 */

const YEAR_MS = 366 * MS_PER_DAY;

function utcMs(year: number, month: number, day: number): number {
  return toDayNumber(year, month, day) * MS_PER_DAY;
}

function weekly(timeZone: string, startWall: string, fromMs: number, toMs: number) {
  return expandRRule({
    rule: parseRRule("FREQ=WEEKLY"),
    dtstart: parseLocalDateTime(startWall),
    timeZone,
    fromMs,
    toMs,
    limit: 200,
  });
}

describe("a weekly series across DST", () => {
  /**
   * Each zone breaks a *different* naive implementation — a 30-minute shift, a
   * quarter-hour offset, a southern-hemisphere year, an abolished DST rule. Whole-hour
   * arithmetic passes New York and fails Lord Howe, which is why both are here.
   */
  const SHIFTING = [
    "America/New_York",
    "Europe/London",
    "Australia/Sydney",
    "Australia/Lord_Howe",
    "Pacific/Chatham",
  ];
  const FIXED = ["Asia/Kolkata", "Asia/Tehran", "Pacific/Kiritimati", "UTC"];

  it.each([...SHIFTING, ...FIXED])("reads 09:00 every week in %s", (timeZone) => {
    const from = utcMs(2027, 1, 4);
    const result = weekly(timeZone, "2027-01-04 09:00:00", from, from + YEAR_MS);

    expect(result.occurrences.length).toBeGreaterThan(50);
    // The whole promise of civil-time-as-truth: the wall clock never moves, in any zone,
    // on either side of any transition.
    for (const occurrence of result.occurrences) {
      expect(formatLocalDateTime(occurrence).endsWith(" 09:00:00")).toBe(true);
    }
  });

  it.each(
    SHIFTING,
  )("moves the underlying instant in %s, because the offset changed", (timeZone) => {
    const from = utcMs(2027, 1, 4);
    const steps = stepSizes(
      weekly(timeZone, "2027-01-04 09:00:00", from, from + YEAR_MS).occurrences,
      timeZone,
    );
    // A DST zone must produce at least one week that is not exactly seven days long —
    // that is the offset absorbing the transition so the wall clock does not have to.
    expect(steps.size).toBeGreaterThan(1);
    expect(steps.has(7 * MS_PER_DAY)).toBe(true);
  });

  it.each(FIXED)("keeps every week exactly seven days long in %s", (timeZone) => {
    const from = utcMs(2027, 1, 4);
    const steps = stepSizes(
      weekly(timeZone, "2027-01-04 09:00:00", from, from + YEAR_MS).occurrences,
      timeZone,
    );
    expect([...steps]).toEqual([7 * MS_PER_DAY]);
  });

  it("does not throw when an occurrence lands in a spring-forward gap", () => {
    // 02:30 does not exist in New York on 2027-03-14. Throwing would blank a whole month
    // view for an event nobody touched, so `compatible` resolution shifts it forward.
    const from = utcMs(2027, 2, 28);
    const result = weekly("America/New_York", "2027-02-28 02:30:00", from, from + 30 * MS_PER_DAY);
    expect(result.occurrences.map(formatLocalDateTime)).toContain("2027-03-14 02:30:00");
  });

  it("does not throw when an occurrence lands in a fall-back overlap", () => {
    const from = utcMs(2027, 10, 24);
    const result = weekly("America/New_York", "2027-10-24 01:30:00", from, from + 30 * MS_PER_DAY);
    expect(result.occurrences.map(formatLocalDateTime)).toContain("2027-11-07 01:30:00");
  });
});

describe("window bounds", () => {
  it("seeks rather than walking from DTSTART", () => {
    // A daily series that started in 2020, asked for one week in 2027. The seek is why
    // this is arithmetic instead of 2,500 iterations.
    const from = utcMs(2027, 6, 1);
    const result = expandRRule({
      rule: parseRRule("FREQ=DAILY"),
      dtstart: parseLocalDateTime("2020-01-01 09:00:00"),
      timeZone: "UTC",
      fromMs: from,
      toMs: from + 7 * MS_PER_DAY,
      limit: 100,
    });
    expect(result.occurrences.map(formatLocalDateTime)).toEqual([
      "2027-06-01 09:00:00",
      "2027-06-02 09:00:00",
      "2027-06-03 09:00:00",
      "2027-06-04 09:00:00",
      "2027-06-05 09:00:00",
      "2027-06-06 09:00:00",
      "2027-06-07 09:00:00",
    ]);
    expect(result.truncated).toBe(false);
  });

  it("counts occurrences outside the window, because COUNT belongs to the series", () => {
    // Days 1-5 exist; the window only covers days 4-10. A COUNT that only counted what
    // was returned would make a June view disagree with a May one about when this ends.
    const result = expandRRule({
      rule: parseRRule("FREQ=DAILY;COUNT=5"),
      dtstart: parseLocalDateTime("2027-01-01 09:00:00"),
      timeZone: "UTC",
      fromMs: utcMs(2027, 1, 4),
      toMs: utcMs(2027, 1, 10),
      limit: 100,
    });
    expect(result.occurrences.map(formatLocalDateTime)).toEqual([
      "2027-01-04 09:00:00",
      "2027-01-05 09:00:00",
    ]);
  });

  it("reports truncation when the caller's cap bites", () => {
    const from = utcMs(2027, 1, 1);
    const result = expandRRule({
      rule: parseRRule("FREQ=DAILY"),
      dtstart: parseLocalDateTime("2027-01-01 09:00:00"),
      timeZone: "UTC",
      fromMs: from,
      toMs: from + YEAR_MS,
      limit: 3,
    });
    expect(result.occurrences).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("terminates on a rule that can never match, and says it truncated", () => {
    // 30 February is legal to write and impossible to hit. Without the period backstop
    // this walks forever looking for an occurrence that cannot exist.
    const result = expandRRule({
      rule: parseRRule("FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=30;COUNT=3"),
      dtstart: parseLocalDateTime("2027-01-01 09:00:00"),
      timeZone: "UTC",
      fromMs: utcMs(2027, 1, 1),
      toMs: utcMs(3000, 1, 1),
      limit: 100,
    });
    expect(result.occurrences).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it("skips candidates in DTSTART's own period that precede it", () => {
    // DTSTART is a Wednesday; the week it opens also contains a Monday, which is not an
    // occurrence because the series had not started yet.
    const from = utcMs(2027, 1, 1);
    const result = expandRRule({
      rule: parseRRule("FREQ=WEEKLY;BYDAY=MO,WE"),
      dtstart: parseLocalDateTime("2027-01-06 09:00:00"),
      timeZone: "UTC",
      fromMs: from,
      toMs: from + 20 * MS_PER_DAY,
      limit: 100,
    });
    expect(result.occurrences.map(formatLocalDateTime)[0]).toBe("2027-01-06 09:00:00");
  });
});

describe("selection rules the corpus exercises but does not name", () => {
  function expand(text: string, dtstart: string, days: number) {
    const start = parseLocalDateTime(dtstart);
    const from = utcMs(start.year, start.month, start.day);
    return expandRRule({
      rule: parseRRule(text),
      dtstart: start,
      timeZone: "UTC",
      fromMs: from,
      toMs: from + days * MS_PER_DAY,
      limit: 100,
    }).occurrences.map((occurrence) => formatLocalDateTime(occurrence).slice(0, 10));
  }

  it("selects nothing when an ordinal overshoots the month", () => {
    // Only the months with five Mondays contribute.
    expect(expand("FREQ=MONTHLY;BYDAY=5MO", "2027-01-04 09:00:00", 200)).toEqual([
      "2027-03-29",
      "2027-05-31",
    ]);
  });

  it("selects nothing when BYSETPOS overshoots the period", () => {
    expect(expand("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5", "2027-01-04 09:00:00", 200)).toEqual([
      "2027-03-29",
      "2027-05-31",
    ]);
  });

  it("treats BYMONTH as a limit on a non-yearly rule", () => {
    expect(expand("FREQ=DAILY;BYMONTH=2", "2027-01-30 09:00:00", 40).slice(0, 8)).toEqual([
      "2027-02-01",
      "2027-02-02",
      "2027-02-03",
      "2027-02-04",
      "2027-02-05",
      "2027-02-06",
      "2027-02-07",
      "2027-02-08",
    ]);
  });

  it("treats BYDAY as a limit on a daily rule", () => {
    expect(expand("FREQ=DAILY;BYDAY=SA,SU", "2027-01-04 09:00:00", 14)).toEqual([
      "2027-01-09",
      "2027-01-10",
      "2027-01-16",
      "2027-01-17",
    ]);
  });

  it("scopes a bare yearly BYDAY to the whole year, not to a month", () => {
    // `-1FR` here is the last Friday of the YEAR. The same token inside a BYMONTH rule
    // means the last Friday of that month — RFC 5545's design, not ours.
    expect(expand("FREQ=YEARLY;BYDAY=-1FR", "2027-01-01 09:00:00", 1200)).toEqual([
      "2027-12-31",
      "2028-12-29",
      "2029-12-28",
    ]);
  });

  it("scopes a yearly BYDAY to the month when BYMONTH is present", () => {
    expect(expand("FREQ=YEARLY;BYMONTH=12;BYDAY=-1FR", "2027-01-01 09:00:00", 1200)).toEqual([
      "2027-12-31",
      "2028-12-29",
      "2029-12-28",
    ]);
  });

  it("lets BYDAY limit BYMONTHDAY on a monthly rule", () => {
    // Friday the 13th. The corpus exercises MONTHLY+BYMONTHDAY and MONTHLY+BYDAY
    // separately but never together, and together is where BYDAY stops expanding and
    // starts limiting — a different code path with the same spelling.
    const dates = expand("FREQ=MONTHLY;BYMONTHDAY=13;BYDAY=FR", "2027-01-01 09:00:00", 1200);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(date.endsWith("-13")).toBe(true);
      expect(dayOfWeek(parseLocalDateTime(`${date} 00:00:00`))).toBe(5);
    }
  });

  it("expands YEARLY;BYMONTHDAY across every month when BYMONTH is absent", () => {
    // Audit F8: the DTSTART's-month fallback emitted one occurrence a year where RFC
    // 5545 §3.3.10 makes BYMONTHDAY an *expansion* at YEARLY frequency. Exact list, not
    // a property — a per-month property holds for the broken fallback too.
    expect(expand("FREQ=YEARLY;BYMONTHDAY=15", "2027-06-15 09:00:00", 200)).toEqual([
      "2027-06-15",
      "2027-07-15",
      "2027-08-15",
      "2027-09-15",
      "2027-10-15",
      "2027-11-15",
      "2027-12-15",
    ]);
  });

  it("skips the months a yearly BYMONTHDAY cannot land in, rather than clamping", () => {
    // 31 exists in seven months; the five short ones contribute nothing. The count IS
    // the assertion — 7/yr, not 12/yr and not 1/yr.
    expect(expand("FREQ=YEARLY;BYMONTHDAY=31", "2027-01-31 09:00:00", 365)).toEqual([
      "2027-01-31",
      "2027-03-31",
      "2027-05-31",
      "2027-07-31",
      "2027-08-31",
      "2027-10-31",
      "2027-12-31",
    ]);
  });

  it("lets BYDAY limit BYMONTHDAY on a yearly rule", () => {
    // Every Friday the 13th. Before 2026-08-06 this asserted only the Friday-the-13th
    // property, which the F8-broken engine also satisfied (audit: "a property both
    // behaviors satisfy") — its DTSTART's-month fallback emitted the rare January
    // Friday the 13ths and nothing else. The count and first element are what
    // distinguish the RFC expansion: 2027's only Friday the 13th is in August, which
    // the frozen oracle's own first entry pins.
    const dates = expand("FREQ=YEARLY;BYMONTHDAY=13;BYDAY=FR", "2027-01-01 09:00:00", 4000);
    expect(dates[0]).toBe("2027-08-13");
    expect(dates.length).toBeGreaterThanOrEqual(15);
    for (const date of dates) {
      expect(date.endsWith("-13")).toBe(true);
      const civil = parseLocalDateTime(`${date} 00:00:00`);
      expect(dayOfWeek(civil)).toBe(5); // Friday
    }
  });
});
