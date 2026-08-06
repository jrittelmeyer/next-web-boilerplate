/**
 * Window-bounded `RRULE` expansion.
 *
 * **Everything here is civil arithmetic.** Occurrences are generated as wall-clock
 * readings with no zone, and each one resolves its own instant afterwards. That is the
 * entire reason a 09:00 weekly meeting reads 09:00 on both sides of a DST transition
 * instead of drifting an hour: an expander working in instants reports a uniform 7 days
 * between occurrences and is silently wrong twice a year.
 *
 * The one place a zone appears is the `UNTIL` comparison and the window bounds, because
 * both are instants and an occurrence is not one until it is resolved.
 *
 * Expansion is **always** bounded. `packages/calendar/AGENTS.md`: an unbounded series
 * must never allocate past `to`.
 */

import {
  addCivilDays,
  type CivilDateTime,
  daysInMonth,
  fromDayNumber,
  isLeapYear,
  MS_PER_DAY,
  toDayNumber,
} from "./civil";
import type { RecurrenceByDay, RecurrenceRule, Weekday } from "./rrule";
import { untilInstantMs } from "./rrule";
import { instantToCivil, resolveCivil } from "./timezone";

/**
 * A backstop, not a policy. Some rules generate nothing *ever* —
 * `FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30` is legal, matches no date, and with a `COUNT`
 * would otherwise spin forever looking for occurrences that cannot exist. The window
 * bound terminates every other shape.
 */
const MAX_EXPANSION_PERIODS = 10_000;

export interface ExpandRRuleInput {
  readonly rule: RecurrenceRule;
  /** The series master's `start_wall`, parsed. Defines the period grid's anchor. */
  readonly dtstart: CivilDateTime;
  /** The master's `start_tzid` — used only to resolve instants for the bounds. */
  readonly timeZone: string;
  readonly fromMs: number;
  readonly toMs: number;
  /** Hard cap on returned occurrences. */
  readonly limit: number;
  /**
   * Replaces the default `fromMs <= start <= toMs` window test, for a caller that needs
   * occurrences selected by something other than where they *start* — the overlap mode
   * in `occurrences.ts`, whose predicate has to reach the occurrence's END.
   *
   * It is applied **before** the `limit` check on purpose. `limit` must count what is
   * returned, not what was considered: a predicate that admits occurrences starting
   * before the window would otherwise fill the cap with them and evict the ones the
   * caller asked for — silently, because truncation is a bit, not an error.
   *
   * ⚠️ An accept that admits occurrences ENDING after `fromMs` must come with a matching
   * `seekBackDays`, or those occurrences are never generated: the seek still decides
   * where generation *starts*, and a predicate cannot select what was never produced.
   */
  readonly accept?: (occurrence: CivilDateTime, instantMs: number) => boolean;
  /**
   * Widens the seek's lower bound by this many civil days before `fromMs`'s reading —
   * the generation-side half of an end-reaching `accept` (see its note above). The
   * caller owns the number because only it knows how far an occurrence's end trails its
   * start; `expandSeries` passes the master's whole-day span plus zone slack. Extra days
   * only generate candidates the accept then rejects. Default 0.
   */
  readonly seekBackDays?: number;
}

export interface ExpandRRuleResult {
  /** Ascending, deduplicated, every one at `dtstart`'s wall time. */
  readonly occurrences: readonly CivilDateTime[];
  /** The cap bit before the window was exhausted. */
  readonly truncated: boolean;
}

/** 0 = Sunday. `dayOfWeek` takes a civil value; the period grid works in day numbers. */
function weekdayOfDayNumber(dayNumber: number): Weekday {
  return ((((dayNumber + 4) % 7) + 7) % 7) as Weekday;
}

function startOfWeek(dayNumber: number, wkst: Weekday): number {
  const offset = (((weekdayOfDayNumber(dayNumber) - wkst) % 7) + 7) % 7;
  return dayNumber - offset;
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

/** Resolves a `BYMONTHDAY` entry inside a month, dropping the ones that do not exist. */
function monthDayNumbers(year: number, month: number, byMonthDay: readonly number[]): number[] {
  const length = daysInMonth(year, month);
  const first = toDayNumber(year, month, 1);
  const days: number[] = [];
  for (const value of byMonthDay) {
    const day = value > 0 ? value : length + value + 1;
    // `BYMONTHDAY=31` in February and `BYMONTHDAY=-31` in a 30-day month both land here.
    // Skipping the month entirely is the RFC behaviour and the reason a "31st of every
    // month" series has gaps.
    if (day >= 1 && day <= length) days.push(first + day - 1);
  }
  return days;
}

/** Every day in `[first, first + length)` whose weekday matches, in order. */
function weekdayMatches(first: number, length: number, weekday: Weekday): number[] {
  const offset = (((weekday - weekdayOfDayNumber(first)) % 7) + 7) % 7;
  const matches: number[] = [];
  for (let index = offset; index < length; index += 7) matches.push(first + index);
  return matches;
}

/** `BYDAY` expanding over a span — a month for MONTHLY, a whole year for bare YEARLY. */
function expandByDay(first: number, length: number, byDay: readonly RecurrenceByDay[]): number[] {
  const days: number[] = [];
  for (const entry of byDay) {
    const matches = weekdayMatches(first, length, entry.weekday);
    if (entry.ordinal === null) {
      days.push(...matches);
      continue;
    }
    const index = entry.ordinal > 0 ? entry.ordinal - 1 : matches.length + entry.ordinal;
    const picked = matches[index];
    // `5MO` in a month with four Mondays: the ordinal simply selects nothing.
    if (picked !== undefined) days.push(picked);
  }
  return days;
}

/** `BYDAY` used as a *limit* rather than an expansion — weekday only, ordinals ignored. */
function keepMatchingWeekday(days: number[], byDay: readonly RecurrenceByDay[]): number[] {
  const weekdays = new Set(byDay.map((entry) => entry.weekday));
  return days.filter((day) => weekdays.has(weekdayOfDayNumber(day)));
}

function sortUnique(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

/** Applies `BYSETPOS` to a period's candidate set. 1-based; negatives count from the end. */
function applySetPos(days: number[], bySetPos: readonly number[]): number[] {
  const picked: number[] = [];
  for (const position of bySetPos) {
    const index = position > 0 ? position - 1 : days.length + position;
    const day = days[index];
    // A position past the end of a short period selects nothing, which is why
    // `BYSETPOS=5` on a month with four candidates is legal and simply skips it.
    if (day !== undefined) picked.push(day);
  }
  return sortUnique(picked);
}

/** The first day of a period, used both to seek and to decide when to stop. */
function periodAnchorDay(rule: RecurrenceRule, dtstart: CivilDateTime, index: number): number {
  const dtstartDay = toDayNumber(dtstart.year, dtstart.month, dtstart.day);
  const step = index * rule.interval;
  switch (rule.freq) {
    case "DAILY":
      return dtstartDay + step;
    case "WEEKLY":
      return startOfWeek(dtstartDay, rule.wkst) + step * 7;
    case "MONTHLY": {
      const { year, month } = addMonths(dtstart.year, dtstart.month, step);
      return toDayNumber(year, month, 1);
    }
    default:
      return toDayNumber(dtstart.year + step, 1, 1);
  }
}

/** The candidate day numbers a single period contributes, before `BYSETPOS`. */
function periodDays(rule: RecurrenceRule, dtstart: CivilDateTime, index: number): number[] {
  const dtstartDay = toDayNumber(dtstart.year, dtstart.month, dtstart.day);
  const step = index * rule.interval;
  const months = new Set(rule.byMonth);
  let days: number[];

  switch (rule.freq) {
    case "DAILY": {
      days = [dtstartDay + step];
      if (rule.byDay.length > 0) days = keepMatchingWeekday(days, rule.byDay);
      break;
    }
    case "WEEKLY": {
      const weekStart = startOfWeek(dtstartDay, rule.wkst) + step * 7;
      const all = Array.from({ length: 7 }, (_, offset) => weekStart + offset);
      days =
        rule.byDay.length > 0
          ? keepMatchingWeekday(all, rule.byDay)
          : all.filter((day) => weekdayOfDayNumber(day) === weekdayOfDayNumber(dtstartDay));
      break;
    }
    case "MONTHLY": {
      const { year, month } = addMonths(dtstart.year, dtstart.month, step);
      days = monthlyDays(rule, year, month, dtstart.day);
      break;
    }
    default: {
      const year = dtstart.year + step;
      days = yearlyDays(rule, year, dtstart);
      break;
    }
  }

  // BYMONTH is a limit for every frequency except YEARLY, where it expands and has
  // already been applied.
  if (months.size > 0 && rule.freq !== "YEARLY") {
    days = days.filter((day) => months.has(fromDayNumber(day).month));
  }

  days = sortUnique(days);
  return rule.bySetPos.length > 0 ? applySetPos(days, rule.bySetPos) : days;
}

function monthlyDays(
  rule: RecurrenceRule,
  year: number,
  month: number,
  dtstartDay: number,
): number[] {
  if (rule.byMonthDay.length > 0) {
    const days = monthDayNumbers(year, month, rule.byMonthDay);
    return rule.byDay.length > 0 ? keepMatchingWeekday(days, rule.byDay) : days;
  }
  if (rule.byDay.length > 0) {
    return expandByDay(toDayNumber(year, month, 1), daysInMonth(year, month), rule.byDay);
  }
  return monthDayNumbers(year, month, [dtstartDay]);
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function yearlyDays(rule: RecurrenceRule, year: number, dtstart: CivilDateTime): number[] {
  // BYDAY alone on a YEARLY rule expands across the whole year, so `-1FR` is the last
  // Friday of the *year*. With BYMONTH or BYMONTHDAY present it is scoped to the month
  // instead — the same token meaning two different things is RFC 5545's design, not ours.
  if (rule.byDay.length > 0 && rule.byMonth.length === 0 && rule.byMonthDay.length === 0) {
    return expandByDay(toDayNumber(year, 1, 1), isLeapYear(year) ? 366 : 365, rule.byDay);
  }

  // BYMONTHDAY at YEARLY frequency is an *expansion* (RFC 5545 §3.3.10): with no
  // BYMONTH, "the 13th every year" means the 13th of every MONTH — twelve a year, not
  // DTSTART's month once (audit F8; the frozen oracle agrees). The DTSTART-month
  // fallback is only correct for the bare anniversary shape, where no BY part names a
  // day at all.
  let months: readonly number[];
  if (rule.byMonth.length > 0) months = rule.byMonth;
  else if (rule.byMonthDay.length > 0) months = ALL_MONTHS;
  else months = [dtstart.month];
  const days: number[] = [];
  for (const month of months) {
    if (rule.byMonthDay.length > 0) {
      const inMonth = monthDayNumbers(year, month, rule.byMonthDay);
      days.push(...(rule.byDay.length > 0 ? keepMatchingWeekday(inMonth, rule.byDay) : inMonth));
    } else if (rule.byDay.length > 0) {
      days.push(...expandByDay(toDayNumber(year, month, 1), daysInMonth(year, month), rule.byDay));
    } else {
      days.push(...monthDayNumbers(year, month, [dtstart.day]));
    }
  }
  return days;
}

/**
 * The first period index worth visiting for a window.
 *
 * Rules with `COUNT` cannot seek — `COUNT` is positional, so the nth occurrence is only
 * knowable by generating the first n-1 — and this returns 0 for them. Everything else
 * jumps, because the period grid is anchored at `DTSTART` and is therefore arithmetic.
 * Measured on `rrule@2.8.1`, whose `between()` iterates from `DTSTART`: 8.3 ms to skip
 * seven years of a daily rule, every time the month view is drawn.
 */
function seekPeriodIndex(rule: RecurrenceRule, dtstart: CivilDateTime, fromCivil: CivilDateTime) {
  if (rule.count !== null) return 0;

  const dtstartDay = toDayNumber(dtstart.year, dtstart.month, dtstart.day);
  const fromDay = toDayNumber(fromCivil.year, fromCivil.month, fromCivil.day);
  let periods: number;
  switch (rule.freq) {
    case "DAILY":
      periods = Math.floor((fromDay - dtstartDay) / rule.interval);
      break;
    case "WEEKLY":
      periods = Math.floor(
        (startOfWeek(fromDay, rule.wkst) - startOfWeek(dtstartDay, rule.wkst)) /
          (7 * rule.interval),
      );
      break;
    case "MONTHLY":
      periods = Math.floor(
        (fromCivil.year * 12 + fromCivil.month - (dtstart.year * 12 + dtstart.month)) /
          rule.interval,
      );
      break;
    default:
      periods = Math.floor((fromCivil.year - dtstart.year) / rule.interval);
      break;
  }
  // One period of slack: a candidate generated by the previous period can still land
  // inside the window (a multi-day span, or a BYSETPOS pick near a boundary).
  return Math.max(0, periods - 1);
}

/**
 * Expands a rule across a window.
 *
 * Occurrences before `fromMs` are still *generated* when the rule has a `COUNT`, because
 * they consume it — they are simply not returned. That is the same reason `EXDATE` is
 * applied after expansion rather than during it.
 */
export function expandRRule(input: ExpandRRuleInput): ExpandRRuleResult {
  const { rule, dtstart, timeZone, fromMs, toMs, limit, accept, seekBackDays = 0 } = input;
  const occurrences: CivilDateTime[] = [];

  const dtstartDay = toDayNumber(dtstart.year, dtstart.month, dtstart.day);
  const untilMs = rule.until === null ? null : untilInstantMs(rule.until);
  // The window's end as a civil day in the series' own zone, plus a day of slack, is what
  // stops the period walk. Comparing civil days rather than instants keeps the loop
  // condition in the same space as the generator.
  const endCivil = instantToCivil(toMs + MS_PER_DAY, timeZone);
  const endDay = toDayNumber(endCivil.year, endCivil.month, endCivil.day);
  let index = seekPeriodIndex(
    rule,
    dtstart,
    addCivilDays(instantToCivil(fromMs, timeZone), -seekBackDays),
  );

  let emitted = 0;

  for (let visited = 0; visited < MAX_EXPANSION_PERIODS; visited += 1) {
    // The window closing is the ordinary exit, and it is not truncation: the caller
    // asked for a window and got all of it.
    if (periodAnchorDay(rule, dtstart, index) > endDay) return { occurrences, truncated: false };

    for (const day of periodDays(rule, dtstart, index)) {
      if (day < dtstartDay) continue; // a period can open before DTSTART itself
      const { year, month, day: dayOfMonth } = fromDayNumber(day);
      const civil: CivilDateTime = {
        year,
        month,
        day: dayOfMonth,
        hour: dtstart.hour,
        minute: dtstart.minute,
        second: dtstart.second,
      };
      const instantMs = resolveCivil(civil, timeZone).instantMs;
      if (untilMs !== null && instantMs > untilMs) return { occurrences, truncated: false };

      // Counted before the window test, never after: `COUNT` is a property of the SERIES,
      // so occurrences that fall outside the requested window still consume it. Counting
      // only what is returned would make a month view in June disagree with one in May
      // about when the series ends.
      emitted += 1;
      if (rule.count !== null && emitted > rule.count) return { occurrences, truncated: false };

      const selected = accept ? accept(civil, instantMs) : instantMs >= fromMs && instantMs <= toMs;
      if (selected) {
        if (occurrences.length >= limit) return { occurrences, truncated: true };
        occurrences.push(civil);
      }
    }

    index += 1;
  }

  // The backstop bit. Only a rule that matches no date can get here — the window bound
  // ends every other shape — and it is reported as truncation so a caller never mistakes
  // it for "the series ended".
  return { occurrences, truncated: true };
}
