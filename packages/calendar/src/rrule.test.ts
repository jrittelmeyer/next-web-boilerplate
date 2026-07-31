import { describe, expect, it } from "vitest";
import { formatRRule, MAX_RECURRENCE_COUNT, parseRRule, untilInstantMs } from "./rrule";

/**
 * The grammar's own tests. Expansion is proved against the frozen oracle
 * (`rrule-corpus.test.ts`); this file proves the things that oracle *cannot* prove,
 * because `rrule@2.8.1` accepts all of them.
 */

describe("parseRRule", () => {
  it("materialises the defaults so no consumer has to remember them", () => {
    expect(parseRRule("FREQ=WEEKLY")).toEqual({
      freq: "WEEKLY",
      interval: 1,
      count: null,
      until: null,
      wkst: 1,
      byMonth: [],
      byMonthDay: [],
      byDay: [],
      bySetPos: [],
    });
  });

  it("accepts parts in any order and any case, and tolerates a trailing semicolon", () => {
    expect(parseRRule("byday=mo,we;freq=weekly;interval=2;")).toMatchObject({
      freq: "WEEKLY",
      interval: 2,
      byDay: [
        { ordinal: null, weekday: 1 },
        { ordinal: null, weekday: 3 },
      ],
    });
  });

  it("reads ordinals on BYDAY, including negative ones", () => {
    expect(parseRRule("FREQ=MONTHLY;BYDAY=-1FR,+2TU").byDay).toEqual([
      { ordinal: -1, weekday: 5 },
      { ordinal: 2, weekday: 2 },
    ]);
  });

  it("reads both UNTIL forms as different types", () => {
    expect(parseRRule("FREQ=DAILY;UNTIL=20270401T130000Z").until).toEqual({
      kind: "utc",
      instantMs: Date.UTC(2027, 3, 1, 13, 0, 0),
    });
    expect(parseRRule("FREQ=DAILY;UNTIL=20270401").until).toEqual({
      kind: "date",
      date: "2027-04-01",
    });
  });

  // Each of the five below is ACCEPTED by rrule@2.8.1 — measured. They are the reason
  // this package owns the grammar instead of delegating it.
  it.each([
    ["BYDAY=MO;COUNT=2", /needs a FREQ/],
    ["FREQ=WEEKLY;COUNT=2;UNTIL=20270401T130000Z", /COUNT and UNTIL cannot both be set/],
    ["FREQ=WEEKLY;INTERVAL=0;COUNT=2", /INTERVAL expects a positive whole number/],
    ["FREQ=WEEKLY;COUNT=-1", /COUNT expects a whole number from 1 to 1000/],
    ["FREQ=WEEKLY;BYDAY=XX;COUNT=2", /BYDAY has an unknown weekday/],
  ])("rejects %s, which the reference implementation accepts", (text, message) => {
    expect(() => parseRRule(text)).toThrow(message);
  });

  it.each([
    ["", /cannot be empty/],
    ["   ", /cannot be empty/],
    ["FREQ", /must be NAME=VALUE/],
    ["=WEEKLY", /must be NAME=VALUE/],
    ["FREQ=WEEKLY;FREQ=DAILY", /FREQ appears more than once/],
    ["FREQ=", /FREQ has no value/],
    ["FREQ=WEEKLY;BYWEEKNO=20", /BYWEEKNO is not supported/],
    ["FREQ=YEARLY;BYYEARDAY=200", /BYYEARDAY is not supported/],
    ["FREQ=DAILY;BYHOUR=9", /BYHOUR is not supported/],
    ["FREQ=DAILY;BYMINUTE=9", /BYMINUTE is not supported/],
    ["FREQ=DAILY;BYSECOND=9", /BYSECOND is not supported/],
    ["FREQ=DAILY;RSCALE=CHINESE", /RSCALE is not supported/],
    ["FREQ=DAILY;SKIP=OMIT", /SKIP is not supported/],
    ["FREQ=DAILY;NONSENSE=1", /NONSENSE is not a recurrence rule part/],
    ["FREQ=HOURLY", /smallest supported frequency is DAILY/],
    ["FREQ=MINUTELY", /smallest supported frequency is DAILY/],
    ["FREQ=SECONDLY", /smallest supported frequency is DAILY/],
    ["FREQ=FORTNIGHTLY", /FREQ must be one of/],
    ["FREQ=DAILY;INTERVAL=1,2", /INTERVAL takes a single value/],
    ["FREQ=DAILY;INTERVAL=two", /INTERVAL expects/],
    ["FREQ=DAILY;COUNT=1,2", /COUNT takes a single value/],
    ["FREQ=DAILY;COUNT=many", /COUNT expects/],
    [`FREQ=DAILY;COUNT=${MAX_RECURRENCE_COUNT + 1}`, /COUNT expects/],
    ["FREQ=DAILY;UNTIL=20270401T130000", /UNTIL must be a UTC date-time/],
    ["FREQ=DAILY;UNTIL=nonsense", /UNTIL must be a UTC date-time/],
    ["FREQ=DAILY;UNTIL=20271301", /UNTIL has an impossible month/],
    ["FREQ=DAILY;UNTIL=20270230", /UNTIL has an impossible day/],
    ["FREQ=DAILY;UNTIL=20270401T250000Z", /UNTIL has an impossible time/],
    ["FREQ=DAILY;WKST=XX", /WKST must be a weekday code/],
    ["FREQ=DAILY;BYMONTH=13", /BYMONTH expects a month/],
    ["FREQ=DAILY;BYMONTH=x", /BYMONTH expects a month/],
    ["FREQ=MONTHLY;BYMONTHDAY=0", /BYMONTHDAY expects a day/],
    ["FREQ=MONTHLY;BYMONTHDAY=32", /BYMONTHDAY expects a day/],
    ["FREQ=MONTHLY;BYDAY=1", /BYDAY expects a weekday/],
    ["FREQ=MONTHLY;BYDAY=+MO", /BYDAY ordinal is missing its number/],
    ["FREQ=MONTHLY;BYDAY=0MO", /BYDAY ordinals start at 1/],
    ["FREQ=MONTHLY;BYSETPOS=0;BYDAY=MO", /BYSETPOS expects/],
    ["FREQ=MONTHLY;BYSETPOS=1", /BYSETPOS needs another BY rule/],
    ["FREQ=WEEKLY;BYMONTHDAY=1", /BYMONTHDAY cannot be combined with FREQ=WEEKLY/],
    ["FREQ=DAILY;BYMONTHDAY=1", /BYMONTHDAY cannot be combined with FREQ=DAILY/],
    ["FREQ=WEEKLY;BYDAY=1MO", /ordinals \(like 1MO or -1FR\) are meaningless with FREQ=WEEKLY/],
    ["FREQ=DAILY;BYDAY=-1FR", /ordinals \(like 1MO or -1FR\) are meaningless with FREQ=DAILY/],
  ])("rejects %s", (text, message) => {
    expect(() => parseRRule(text)).toThrow(message);
  });
});

describe("formatRRule", () => {
  it("omits the defaults and emits parts in RFC order", () => {
    expect(formatRRule(parseRRule("INTERVAL=1;WKST=MO;FREQ=WEEKLY"))).toBe("FREQ=WEEKLY");
  });

  it("emits every non-default part", () => {
    const text =
      "FREQ=MONTHLY;INTERVAL=2;WKST=SU;BYMONTH=1,6;BYMONTHDAY=1,-1;BYDAY=MO,-1FR;BYSETPOS=1,-1";
    expect(formatRRule(parseRRule(text))).toBe(text);
  });

  it.each([
    "FREQ=DAILY;COUNT=5",
    "FREQ=DAILY;UNTIL=20270401T130000Z",
    "FREQ=DAILY;UNTIL=20270401",
    "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
  ])("round-trips %s", (text) => {
    expect(formatRRule(parseRRule(text))).toBe(text);
  });

  it("normalises so two spellings of the same rule become one stored string", () => {
    expect(formatRRule(parseRRule("byday=we,mo;freq=weekly;interval=1"))).toBe(
      formatRRule(parseRRule("FREQ=WEEKLY;BYDAY=WE,MO")),
    );
  });
});

describe("untilInstantMs", () => {
  it("passes a UTC bound through", () => {
    expect(untilInstantMs({ kind: "utc", instantMs: 1234 })).toBe(1234);
  });

  it("takes a DATE bound to the END of its day", () => {
    // Otherwise `UNTIL=20270401` would drop an occurrence at 09:00 on the 1st, which is
    // the opposite of what the author wrote.
    expect(untilInstantMs({ kind: "date", date: "2027-04-01" })).toBe(
      Date.UTC(2027, 3, 1, 23, 59, 59, 999),
    );
  });
});
