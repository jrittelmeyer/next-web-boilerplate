/**
 * The RFC 5545 `RRULE` grammar — parse and serialise. **This module is the grammar's
 * only owner.**
 *
 * `@repo/validators/calendar` constrains the *shape* of the string (length, `KEY=VALUE`
 * pairs, a `FREQ=` part) so a form can show a message under the right field; what a rule
 * actually *means* is decided here. That is the same split `localDateTimeSchema` and
 * `parseLocalDateTime` already use, and it exists because two RFC 5545 parsers in two
 * packages would be two answers.
 *
 * Parsing is deliberately strict, because the obvious reference implementation is not.
 * Measured against `rrule@2.8.1`, every one of these is accepted by it: a rule with no
 * `FREQ`; `COUNT` and `UNTIL` together, which RFC 5545 §3.3.10 forbids; `INTERVAL=0`;
 * and `COUNT=-1`, which yields 416,011 occurrences. Each is rejected here, and the
 * message names the offending part so the action can attribute it to a field.
 *
 * `RangeError` rather than a bespoke error class, matching `derive.ts` — a caller that
 * wants to distinguish causes reads the message, and one that doesn't gets a single
 * catch.
 *
 * No `Date` is constructed anywhere in this file, and no lookup is written as a bare
 * index. Both follow `civil.ts`: `Date.UTC` silently maps years 0–99 into 1900–1999, and
 * an indexed table under `noUncheckedIndexedAccess` needs a fallback no input can reach —
 * and an unreachable branch cannot be covered, which the 100% gate rejects.
 */

import { daysInMonth, MS_PER_DAY, toDayNumber } from "./civil";
import { instantToCivil } from "./timezone";

export const RECURRENCE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/**
 * Bounds `COUNT`. Load-bearing rather than hygiene: `series_end_at` for a `COUNT` rule is
 * computed by expanding to the count on every write, so an uncapped `COUNT` is an
 * uncapped write.
 */
export const MAX_RECURRENCE_COUNT = 1000;

/** 0 = Sunday … 6 = Saturday, matching `dayOfWeek`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** RFC 5545's default when `WKST` is absent. */
const DEFAULT_WKST: Weekday = 1; // Monday

/**
 * The one place a weekday code becomes a number. A `switch` rather than an indexed
 * table so the "unknown code" branch is *reachable* — `WKST=XX` and `BYDAY=XX` both
 * land on it, which is how it gets covered instead of being an unreachable fallback.
 */
function weekdayFromCode(code: string): Weekday | null {
  switch (code) {
    case "SU":
      return 0;
    case "MO":
      return 1;
    case "TU":
      return 2;
    case "WE":
      return 3;
    case "TH":
      return 4;
    case "FR":
      return 5;
    case "SA":
      return 6;
    default:
      return null;
  }
}

/**
 * The inverse. A `readonly` tuple indexed by the `Weekday` literal union, which is the
 * one indexed read that stays total under `noUncheckedIndexedAccess` — TypeScript
 * narrows a tuple to the union of its members when the index is in-bounds literals.
 */
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

function codeFromWeekday(weekday: Weekday): string {
  return WEEKDAY_CODES[weekday];
}

export interface RecurrenceByDay {
  /** `null` = every such weekday in the period; `-1` = the last one. */
  readonly ordinal: number | null;
  readonly weekday: Weekday;
}

/**
 * The two RFC forms are different *types*, not one string plus a flag: with a `TZID`ed
 * `DTSTART` the spec requires `UNTIL` in UTC, and an all-day series uses a bare `DATE`.
 * Collapsing them is how a series stops a day early on the other side of the world.
 */
export type RecurrenceUntil =
  | { readonly kind: "utc"; readonly instantMs: number }
  | { readonly kind: "date"; readonly date: string };

export interface RecurrenceRule {
  readonly freq: RecurrenceFrequency;
  readonly interval: number;
  readonly count: number | null;
  readonly until: RecurrenceUntil | null;
  readonly wkst: Weekday;
  readonly byMonth: readonly number[];
  readonly byMonthDay: readonly number[];
  readonly byDay: readonly RecurrenceByDay[];
  readonly bySetPos: readonly number[];
}

/**
 * Parts we refuse rather than mis-expand. Rendering *wrong* dates is worse than
 * rendering fewer, and each of these changes the answer in a way the period model cannot
 * express. On ICS import (Phase 6) such a rule is parked verbatim and the event imports
 * as non-recurring, with the report saying so.
 */
const UNSUPPORTED_PARTS = [
  "BYWEEKNO",
  "BYYEARDAY",
  "BYHOUR",
  "BYMINUTE",
  "BYSECOND",
  "RSCALE",
  "SKIP",
] as const;

const SUB_DAILY_FREQUENCIES = ["SECONDLY", "MINUTELY", "HOURLY"] as const;

const KNOWN_PARTS = new Set([
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "WKST",
  "BYMONTH",
  "BYMONTHDAY",
  "BYDAY",
  "BYSETPOS",
]);

const UNTIL_UTC_RE = /^\d{8}T\d{6}Z$/;
const UNTIL_DATE_RE = /^\d{8}$/;
const BYDAY_RE = /^[+-]?\d{0,2}[A-Z]{2}$/;
const INTEGER_RE = /^[+-]?\d+$/;

function fail(message: string): never {
  throw new RangeError(message);
}

/** Shared by every numeric BY* part. Fixed-width slices, never regex captures. */
function parseIntegerList(
  part: string,
  raw: string,
  isValid: (value: number) => boolean,
  expectation: string,
): number[] {
  return raw.split(",").map((piece) => {
    const trimmed = piece.trim();
    // The regex in front of `Number` is not belt-and-braces: `Number("")` is 0 and
    // `Number("1x")` is NaN, and only a pattern test rejects the trailing-garbage form.
    if (!INTEGER_RE.test(trimmed)) fail(`${part} expects ${expectation}, got "${piece}"`);
    const value = Number(trimmed);
    if (!isValid(value)) fail(`${part} expects ${expectation}, got "${piece}"`);
    return value;
  });
}

function parseSingleInteger(
  part: string,
  raw: string,
  isValid: (value: number) => boolean,
  expectation: string,
): number {
  if (raw.includes(",")) fail(`${part} takes a single value`);
  const trimmed = raw.trim();
  if (!INTEGER_RE.test(trimmed)) fail(`${part} expects ${expectation}, got "${raw}"`);
  const value = Number(trimmed);
  if (!isValid(value)) fail(`${part} expects ${expectation}, got "${raw}"`);
  return value;
}

function parseUntil(raw: string): RecurrenceUntil {
  const isUtc = UNTIL_UTC_RE.test(raw);
  if (!isUtc && !UNTIL_DATE_RE.test(raw)) {
    // A floating `…T…` with no `Z` lands here deliberately. RFC 5545 requires UNTIL in
    // UTC whenever DTSTART carries a TZID, and every event here carries one, so a
    // floating UNTIL would silently mean a different instant for every viewer.
    fail(`UNTIL must be a UTC date-time (20270401T130000Z) or a date (20270401), got "${raw}"`);
  }

  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  if (month < 1 || month > 12) fail(`UNTIL has an impossible month: "${raw}"`);
  if (day < 1 || day > daysInMonth(year, month)) fail(`UNTIL has an impossible day: "${raw}"`);

  if (!isUtc) {
    return { kind: "date", date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` };
  }

  const hour = Number(raw.slice(9, 11));
  const minute = Number(raw.slice(11, 13));
  const second = Number(raw.slice(13, 15));
  if (hour > 23 || minute > 59 || second > 59) fail(`UNTIL has an impossible time: "${raw}"`);
  return {
    kind: "utc",
    instantMs:
      toDayNumber(year, month, day) * MS_PER_DAY + (hour * 3600 + minute * 60 + second) * 1000,
  };
}

function parseByDay(raw: string): RecurrenceByDay[] {
  return raw.split(",").map((piece) => {
    const token = piece.trim().toUpperCase();
    if (!BYDAY_RE.test(token)) {
      fail(`BYDAY expects a weekday, optionally with an ordinal, got "${piece}"`);
    }
    // The pattern pins the code to the last two characters, so slicing beats a capture
    // group: `match[n]` is `string | undefined` under noUncheckedIndexedAccess.
    const weekday = weekdayFromCode(token.slice(-2));
    if (weekday === null) fail(`BYDAY has an unknown weekday: "${piece}"`);

    const ordinalText = token.slice(0, -2);
    if (ordinalText === "") return { ordinal: null, weekday };
    if (ordinalText === "+" || ordinalText === "-") {
      fail(`BYDAY ordinal is missing its number: "${piece}"`);
    }
    const ordinal = Number(ordinalText);
    if (ordinal === 0) fail(`BYDAY ordinals start at 1, got "${piece}"`);
    return { ordinal, weekday };
  });
}

/**
 * Parses an `RRULE` value — the part *after* `RRULE:`, which is what the database stores.
 *
 * Canonicalises as it goes: parts may arrive in any order and any case, and the defaults
 * (`INTERVAL=1`, `WKST=MO`) are materialised so no consumer has to remember them.
 */
export function parseRRule(text: string): RecurrenceRule {
  const trimmed = text.trim();
  if (trimmed === "") fail("A recurrence rule cannot be empty");

  const seen = new Map<string, string>();
  for (const piece of trimmed.split(";")) {
    if (piece.trim() === "") continue; // a trailing `;` is harmless and common in the wild
    const equals = piece.indexOf("=");
    if (equals <= 0) fail(`Each recurrence part must be NAME=VALUE, got "${piece}"`);
    const name = piece.slice(0, equals).trim().toUpperCase();
    const value = piece.slice(equals + 1).trim();
    if (seen.has(name)) fail(`${name} appears more than once`);
    if (value === "") fail(`${name} has no value`);
    seen.set(name, value);
  }

  for (const part of UNSUPPORTED_PARTS) {
    if (seen.has(part)) {
      fail(`${part} is not supported. Dropping it would show wrong dates, so it is refused`);
    }
  }
  for (const name of seen.keys()) {
    if (!KNOWN_PARTS.has(name)) fail(`${name} is not a recurrence rule part`);
  }

  const freqRaw = seen.get("FREQ")?.toUpperCase();
  if (freqRaw === undefined) fail("A recurrence rule needs a FREQ");
  if (SUB_DAILY_FREQUENCIES.includes(freqRaw as (typeof SUB_DAILY_FREQUENCIES)[number])) {
    fail(`FREQ=${freqRaw} is not supported — the smallest supported frequency is DAILY`);
  }
  const freq = RECURRENCE_FREQUENCIES.find((candidate) => candidate === freqRaw);
  if (freq === undefined) {
    fail(`FREQ must be one of ${RECURRENCE_FREQUENCIES.join(", ")}, got "${freqRaw}"`);
  }

  const countRaw = seen.get("COUNT");
  const untilRaw = seen.get("UNTIL");
  if (countRaw !== undefined && untilRaw !== undefined) {
    fail("COUNT and UNTIL cannot both be set — RFC 5545 allows at most one");
  }

  const intervalRaw = seen.get("INTERVAL");
  const interval =
    intervalRaw === undefined
      ? 1
      : parseSingleInteger("INTERVAL", intervalRaw, (v) => v >= 1, "a positive whole number");

  const count =
    countRaw === undefined
      ? null
      : parseSingleInteger(
          "COUNT",
          countRaw,
          (v) => v >= 1 && v <= MAX_RECURRENCE_COUNT,
          `a whole number from 1 to ${MAX_RECURRENCE_COUNT}`,
        );

  const until = untilRaw === undefined ? null : parseUntil(untilRaw.toUpperCase());

  const wkstRaw = seen.get("WKST");
  let wkst = DEFAULT_WKST;
  if (wkstRaw !== undefined) {
    const parsed = weekdayFromCode(wkstRaw.trim().toUpperCase());
    if (parsed === null) fail(`WKST must be a weekday code, got "${wkstRaw}"`);
    wkst = parsed;
  }

  const byMonthRaw = seen.get("BYMONTH");
  const byMonth =
    byMonthRaw === undefined
      ? []
      : parseIntegerList("BYMONTH", byMonthRaw, (v) => v >= 1 && v <= 12, "a month from 1 to 12");

  const byMonthDayRaw = seen.get("BYMONTHDAY");
  const byMonthDay =
    byMonthDayRaw === undefined
      ? []
      : parseIntegerList(
          "BYMONTHDAY",
          byMonthDayRaw,
          (v) => v !== 0 && v >= -31 && v <= 31,
          "a day from 1 to 31 or -1 to -31",
        );

  const byDayRaw = seen.get("BYDAY");
  const byDay = byDayRaw === undefined ? [] : parseByDay(byDayRaw);

  const bySetPosRaw = seen.get("BYSETPOS");
  const bySetPos =
    bySetPosRaw === undefined
      ? []
      : parseIntegerList(
          "BYSETPOS",
          bySetPosRaw,
          (v) => v !== 0 && v >= -366 && v <= 366,
          "a non-zero position from -366 to 366",
        );

  // Combinations RFC 5545 §3.3.10 forbids outright. Refused rather than quietly ignored,
  // because "my weekly meeting silently stopped honouring BYMONTHDAY" is a support
  // ticket nobody can reproduce.
  if (byMonthDay.length > 0 && (freq === "WEEKLY" || freq === "DAILY")) {
    fail(`BYMONTHDAY cannot be combined with FREQ=${freq}`);
  }
  if (byDay.some((entry) => entry.ordinal !== null) && (freq === "WEEKLY" || freq === "DAILY")) {
    fail(`BYDAY ordinals (like 1MO or -1FR) are meaningless with FREQ=${freq}`);
  }
  if (bySetPos.length > 0 && byMonth.length + byMonthDay.length + byDay.length === 0) {
    fail("BYSETPOS needs another BY rule to select from");
  }

  return { freq, interval, count, until, wkst, byMonth, byMonthDay, byDay, bySetPos };
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatUntil(until: RecurrenceUntil): string {
  if (until.kind === "date") return until.date.replaceAll("-", "");
  // `instantToCivil(..., "UTC")` rather than `new Date().getUTC*`: timezone.ts is the one
  // place that reads an instant as a wall clock, and this file constructs no `Date`.
  const civil = instantToCivil(until.instantMs, "UTC");
  return (
    `${String(civil.year).padStart(4, "0")}${pad2(civil.month)}${pad2(civil.day)}T` +
    `${pad2(civil.hour)}${pad2(civil.minute)}${pad2(civil.second)}Z`
  );
}

/**
 * Serialises to the canonical form — parts in RFC order, defaults omitted.
 *
 * `parseRRule(formatRRule(rule))` is the identity on every rule this module can produce,
 * which is what lets the stored string be normalised on write: two users building the
 * same recurrence through the UI get byte-identical rows, and the ICS upsert in Phase 6
 * can compare rules as text.
 */
export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== null) parts.push(`UNTIL=${formatUntil(rule.until)}`);
  if (rule.wkst !== DEFAULT_WKST) parts.push(`WKST=${codeFromWeekday(rule.wkst)}`);
  if (rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  if (rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.byDay.length > 0) {
    const days = rule.byDay.map(
      (entry) => `${entry.ordinal === null ? "" : entry.ordinal}${codeFromWeekday(entry.weekday)}`,
    );
    parts.push(`BYDAY=${days.join(",")}`);
  }
  if (rule.bySetPos.length > 0) parts.push(`BYSETPOS=${rule.bySetPos.join(",")}`);
  return parts.join(";");
}

/**
 * The instant an `UNTIL` bound represents, for comparison against a resolved occurrence.
 *
 * A `DATE` form means "through the end of that day", so it resolves to the day's last
 * millisecond rather than its midnight — otherwise `UNTIL=20270401` would drop an
 * occurrence at 09:00 on the 1st, the opposite of what the author wrote.
 */
export function untilInstantMs(until: RecurrenceUntil): number {
  if (until.kind === "utc") return until.instantMs;
  const year = Number(until.date.slice(0, 4));
  const month = Number(until.date.slice(5, 7));
  const day = Number(until.date.slice(8, 10));
  return toDayNumber(year, month, day) * MS_PER_DAY + MS_PER_DAY - 1;
}
