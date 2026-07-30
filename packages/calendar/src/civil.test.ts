import { describe, expect, it } from "vitest";
import {
  addCivilDays,
  addCivilMinutes,
  type CivilDateTime,
  civilDiffMinutes,
  civilEquals,
  civilToPseudoUtcMs,
  compareCivil,
  dayOfWeek,
  daysInMonth,
  formatLocalDateTime,
  fromDayNumber,
  isLeapYear,
  isLocalDateTime,
  isMidnight,
  parseLocalDateTime,
  pseudoUtcMsToCivil,
  toDayNumber,
} from "./civil";

const civil = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): CivilDateTime => ({ year, month, day, hour, minute, second });

describe("isLeapYear", () => {
  it.each([
    [2024, true],
    [2023, false],
    [2000, true],
    [1900, false],
    [2100, false],
  ])("%i -> %s", (year, expected) => {
    expect(isLeapYear(year)).toBe(expected);
  });
});

describe("daysInMonth", () => {
  it("knows every month length", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m))).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
  });

  it("lengthens February in a leap year", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it.each([0, 13, -1, 1.5, Number.NaN])("rejects month %s", (month) => {
    expect(() => daysInMonth(2026, month)).toThrow(RangeError);
  });
});

describe("day-number round trip", () => {
  it("anchors the epoch", () => {
    expect(toDayNumber(1970, 1, 1)).toBe(0);
    expect(fromDayNumber(0)).toEqual({ year: 1970, month: 1, day: 1 });
  });

  it("handles pre-epoch dates (negative day numbers)", () => {
    expect(toDayNumber(1969, 12, 31)).toBe(-1);
    expect(fromDayNumber(-1)).toEqual({ year: 1969, month: 12, day: 31 });
    // Crosses an era boundary, exercising the floor-division path.
    expect(fromDayNumber(toDayNumber(1600, 2, 29))).toEqual({ year: 1600, month: 2, day: 29 });
  });

  it("round-trips every day across a leap year and a century non-leap year", () => {
    for (const year of [2024, 1900]) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= daysInMonth(year, month); day++) {
          expect(fromDayNumber(toDayNumber(year, month, day))).toEqual({ year, month, day });
        }
      }
    }
  });

  it("advances by exactly one per calendar day", () => {
    let previous = toDayNumber(2025, 12, 20);
    for (let i = 1; i <= 400; i++) {
      const { year, month, day } = fromDayNumber(previous + 1);
      expect(toDayNumber(year, month, day)).toBe(previous + 1);
      previous += 1;
    }
  });
});

describe("dayOfWeek", () => {
  it("reads 0=Sunday through 6=Saturday", () => {
    // 2026-07-30 is a Thursday.
    expect(dayOfWeek(civil(2026, 7, 30))).toBe(4);
    expect(dayOfWeek(civil(2026, 8, 2))).toBe(0); // Sunday
    expect(dayOfWeek(civil(2026, 8, 1))).toBe(6); // Saturday
    // 1970-01-01 was a Thursday — the constant the formula is built on.
    expect(dayOfWeek(civil(1970, 1, 1))).toBe(4);
  });

  it("stays non-negative before the epoch", () => {
    // 1969-12-28 was a Sunday; a naive `%` would return a negative index here.
    expect(dayOfWeek(civil(1969, 12, 28))).toBe(0);
    expect(dayOfWeek(civil(1969, 12, 27))).toBe(6);
  });
});

describe("parseLocalDateTime / formatLocalDateTime", () => {
  it("parses the canonical space-separated form", () => {
    expect(parseLocalDateTime("2026-03-08 09:30:00")).toEqual(civil(2026, 3, 8, 9, 30, 0));
  });

  it("also accepts an ISO 'T' separator but always emits a space", () => {
    expect(parseLocalDateTime("2026-03-08T09:30:00")).toEqual(civil(2026, 3, 8, 9, 30, 0));
    expect(formatLocalDateTime(parseLocalDateTime("2026-03-08T09:30:00"))).toBe(
      "2026-03-08 09:30:00",
    );
  });

  it("zero-pads every field", () => {
    expect(formatLocalDateTime(civil(2026, 1, 2, 3, 4, 5))).toBe("2026-01-02 03:04:05");
    expect(formatLocalDateTime(civil(2026, 11, 12, 13, 14, 15))).toBe("2026-11-12 13:14:15");
  });

  it("round-trips", () => {
    const value = "2026-12-31 23:59:59";
    expect(formatLocalDateTime(parseLocalDateTime(value))).toBe(value);
  });

  it.each([
    ["", "empty"],
    ["2026-03-08", "date only"],
    ["2026-03-08 09:30", "no seconds"],
    ["2026-3-8 09:30:00", "unpadded"],
    ["2026-03-08 09:30:00Z", "trailing zone"],
    ["2026-03-08  09:30:00", "double separator"],
    ["not a date", "garbage"],
  ])("rejects %s (%s)", (value) => {
    expect(() => parseLocalDateTime(value)).toThrow(RangeError);
    expect(isLocalDateTime(value)).toBe(false);
  });

  it("rejects out-of-range fields, including February 30", () => {
    expect(() => parseLocalDateTime("2026-02-30 00:00:00")).toThrow(/Day out of range/);
    expect(() => parseLocalDateTime("2026-13-01 00:00:00")).toThrow(/Month out of range/);
    expect(() => parseLocalDateTime("2026-00-01 00:00:00")).toThrow(/Month out of range/);
    expect(() => parseLocalDateTime("2026-01-00 00:00:00")).toThrow(/Day out of range/);
    expect(() => parseLocalDateTime("2026-01-01 24:00:00")).toThrow(/Time out of range/);
    expect(() => parseLocalDateTime("2026-01-01 00:60:00")).toThrow(/Time out of range/);
    // Leap seconds have no RFC 5545 representation.
    expect(() => parseLocalDateTime("2026-01-01 00:00:60")).toThrow(/Time out of range/);
  });

  it("accepts February 29 only in a leap year", () => {
    expect(isLocalDateTime("2024-02-29 00:00:00")).toBe(true);
    expect(isLocalDateTime("2026-02-29 00:00:00")).toBe(false);
  });
});

describe("civilEquals", () => {
  const base = civil(2026, 3, 8, 9, 30, 15);

  it("is true for an identical reading", () => {
    expect(civilEquals(base, { ...base })).toBe(true);
  });

  it.each([
    ["year", { year: 2027 }],
    ["month", { month: 4 }],
    ["day", { day: 9 }],
    ["hour", { hour: 10 }],
    ["minute", { minute: 31 }],
    ["second", { second: 16 }],
  ])("is false when %s differs", (_field, patch) => {
    expect(civilEquals(base, { ...base, ...patch })).toBe(false);
  });
});

describe("compareCivil", () => {
  it("orders readings without reference to any zone", () => {
    expect(compareCivil(civil(2026, 3, 8), civil(2026, 3, 9))).toBeLessThan(0);
    expect(compareCivil(civil(2026, 3, 9), civil(2026, 3, 8))).toBeGreaterThan(0);
    expect(compareCivil(civil(2026, 3, 8), civil(2026, 3, 8))).toBe(0);
  });
});

describe("civil arithmetic", () => {
  it("preserves the clock across a day boundary", () => {
    expect(addCivilDays(civil(2026, 2, 28, 9, 30), 1)).toEqual(civil(2026, 3, 1, 9, 30));
    expect(addCivilDays(civil(2024, 2, 28, 9, 30), 1)).toEqual(civil(2024, 2, 29, 9, 30));
    expect(addCivilDays(civil(2026, 1, 1, 9, 30), -1)).toEqual(civil(2025, 12, 31, 9, 30));
  });

  it("rolls minutes over dates", () => {
    expect(addCivilMinutes(civil(2026, 3, 8, 23, 45), 30)).toEqual(civil(2026, 3, 9, 0, 15));
    expect(addCivilMinutes(civil(2026, 3, 8, 0, 15), -30)).toEqual(civil(2026, 3, 7, 23, 45));
  });

  it("measures nominal duration, ignoring zones entirely", () => {
    expect(civilDiffMinutes(civil(2026, 3, 8, 9), civil(2026, 3, 8, 10))).toBe(60);
    expect(civilDiffMinutes(civil(2026, 3, 8, 10), civil(2026, 3, 8, 9))).toBe(-60);
    // A 01:00-04:00 booking is three nominal hours no matter what the clocks do.
    expect(civilDiffMinutes(civil(2026, 3, 8, 1), civil(2026, 3, 8, 4))).toBe(180);
  });

  it("round-trips through the pseudo-UTC representation", () => {
    const value = civil(2026, 7, 30, 13, 45, 30);
    expect(pseudoUtcMsToCivil(civilToPseudoUtcMs(value))).toEqual(value);
    expect(pseudoUtcMsToCivil(civilToPseudoUtcMs(civil(1969, 6, 15, 1, 2, 3)))).toEqual(
      civil(1969, 6, 15, 1, 2, 3),
    );
  });
});

describe("isMidnight", () => {
  it("is the all-day invariant", () => {
    expect(isMidnight(civil(2026, 3, 8))).toBe(true);
    expect(isMidnight(civil(2026, 3, 8, 0, 0, 1))).toBe(false);
    expect(isMidnight(civil(2026, 3, 8, 0, 1, 0))).toBe(false);
    expect(isMidnight(civil(2026, 3, 8, 1, 0, 0))).toBe(false);
  });
});
