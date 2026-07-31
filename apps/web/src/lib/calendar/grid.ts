import {
  addCivilDays,
  type CivilDateTime,
  civilToInstant,
  dayOfWeek,
  daysInMonth,
  fromDayNumber,
  instantToCivil,
  type LocalDateTime,
  parseLocalDateTime,
  toDayNumber,
} from "@repo/calendar";
import type { WeekStart } from "@repo/db/schema";

/**
 * Month-grid geometry. Pure functions over plain data — no React, no `Date`, no
 * `Intl` formatting. The month view renders what this returns; it decides nothing
 * about how a day *looks*.
 *
 * Two conventions in here are load-bearing and easy to get wrong in opposite
 * directions:
 *
 * 1. **A timed event is placed by its instant, in the VIEWER's zone.** A 21:00 New
 *    York meeting is a *next-day* entry for a viewer in Tokyo, and that is correct.
 * 2. **An all-day event is placed by its wall dates, in NO zone at all.** "14 March,
 *    all day" is the 14th everywhere; running it through a zone conversion is the
 *    classic bug that slides all-day events onto the previous day for half the
 *    planet. `e2e/calendar.spec.ts` pins this with a DST transition in a
 *    midnight-transition zone, where a naive implementation lands on two cells.
 */

/** `"YYYY-MM-DD"` — a calendar date with no time and no zone. */
export type LocalDate = string;

export const DAYS_PER_WEEK = 7;

const pad2 = (value: number) => String(value).padStart(2, "0");

const toLocalDate = (civil: Pick<CivilDateTime, "year" | "month" | "day">): LocalDate =>
  `${String(civil.year).padStart(4, "0")}-${pad2(civil.month)}-${pad2(civil.day)}`;

const dayNumberOf = (date: LocalDate): number =>
  toDayNumber(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)));

const dateFromDayNumber = (dayNumber: number): LocalDate => toLocalDate(fromDayNumber(dayNumber));

export interface MonthGridCell {
  readonly date: LocalDate;
  readonly day: number;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  readonly inMonth: boolean;
}

export interface MonthGrid {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly weekStart: WeekStart;
  /** Whole weeks only — four to six of them, never a ragged row. */
  readonly weeks: readonly (readonly MonthGridCell[])[];
  readonly firstDate: LocalDate;
  readonly lastDate: LocalDate;
}

/**
 * The visible grid for a month, padded out to whole weeks from `weekStart`.
 *
 * The week count is whatever the month needs (four for a February that starts on the
 * week-start day, six for a 31-day month that starts late) rather than a fixed six.
 * A fixed six would keep the page height stable but would also render a whole week
 * of a neighbouring month, which reads as a bug to anyone counting.
 */
export function buildMonthGrid(year: number, month: number, weekStart: WeekStart): MonthGrid {
  const first: CivilDateTime = { year, month, day: 1, hour: 0, minute: 0, second: 0 };
  const leading = (dayOfWeek(first) - weekStart + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const length = daysInMonth(year, month);
  const totalCells = Math.ceil((leading + length) / DAYS_PER_WEEK) * DAYS_PER_WEEK;

  const firstDayNumber = toDayNumber(year, month, 1) - leading;
  const weeks: MonthGridCell[][] = [];
  for (let index = 0; index < totalCells; index += 1) {
    const civil = fromDayNumber(firstDayNumber + index);
    const cell: MonthGridCell = {
      date: toLocalDate(civil),
      day: civil.day,
      inMonth: civil.year === year && civil.month === month,
    };
    const week = weeks[Math.floor(index / DAYS_PER_WEEK)];
    if (week) week.push(cell);
    else weeks.push([cell]);
  }

  return {
    year,
    month,
    weekStart,
    weeks,
    firstDate: dateFromDayNumber(firstDayNumber),
    lastDate: dateFromDayNumber(firstDayNumber + totalCells - 1),
  };
}

/**
 * The window a month grid must query, as epoch milliseconds.
 *
 * Padded by a day on each side and computed in the viewer's zone, because the first
 * cell's midnight in Tokyo is the previous afternoon in UTC — querying the naive UTC
 * bounds drops events from the corners of the grid.
 */
export function monthGridWindowMs(
  grid: MonthGrid,
  viewerTimeZone: string,
): { fromMs: number; toMs: number } {
  const startCivil = parseLocalDateTime(`${grid.firstDate} 00:00:00`);
  const endCivil = parseLocalDateTime(`${grid.lastDate} 00:00:00`);
  // `civilToInstant`, never a local conversion: `packages/calendar/src/timezone.ts`
  // is the only place in the codebase that turns a wall reading into an instant, and
  // a second implementation here would be a second answer at every DST boundary.
  // A midnight bound can land in a gap or an overlap; the ±1 day of padding makes
  // the disambiguation choice irrelevant to the result, which is why the bound can
  // safely reuse the event-time function.
  return {
    fromMs: civilToInstant(addCivilDays(startCivil, -1), viewerTimeZone),
    toMs: civilToInstant(addCivilDays(endCivil, 2), viewerTimeZone),
  };
}

/** The minimum an event must expose to be placed. */
export interface EventSpanInput {
  readonly id: string;
  readonly allDay: boolean;
  readonly startWall: LocalDateTime;
  readonly endWall: LocalDateTime;
  readonly startAtMs: number;
  readonly endAtMs: number;
}

export interface EventSpan {
  readonly firstDate: LocalDate;
  /** Inclusive — the last cell the event paints. */
  readonly lastDate: LocalDate;
}

/**
 * The inclusive date range an event occupies on the grid.
 *
 * All-day rows are read straight off the wall columns and their **exclusive** end is
 * converted to the inclusive last day here — the one place in `apps/web` that knows
 * about the RFC 5545 `DTEND` convention (see `@repo/validators/calendar`).
 */
export function eventSpan(event: EventSpanInput, viewerTimeZone: string): EventSpan {
  if (event.allDay) {
    const firstDate = event.startWall.slice(0, 10);
    const exclusiveEnd = dayNumberOf(event.endWall.slice(0, 10));
    // A single all-day event stores end = start + 1 day, so the inclusive last day
    // is one back. `Math.max` guards a degenerate zero-length row rather than
    // painting nothing: the grid should still show something it can be deleted from.
    const lastDayNumber = Math.max(dayNumberOf(firstDate), exclusiveEnd - 1);
    return { firstDate, lastDate: dateFromDayNumber(lastDayNumber) };
  }

  const startCivil = instantToCivil(event.startAtMs, viewerTimeZone);
  const endCivil = instantToCivil(event.endAtMs, viewerTimeZone);
  const firstDayNumber = toDayNumber(startCivil.year, startCivil.month, startCivil.day);
  let lastDayNumber = toDayNumber(endCivil.year, endCivil.month, endCivil.day);
  // An event that ends exactly at midnight ends *at the boundary*, not on the day
  // after it — otherwise every 23:00–00:00 slot paints two cells.
  const endsAtMidnight = endCivil.hour === 0 && endCivil.minute === 0 && endCivil.second === 0;
  if (endsAtMidnight && lastDayNumber > firstDayNumber) lastDayNumber -= 1;

  return {
    firstDate: dateFromDayNumber(firstDayNumber),
    lastDate: dateFromDayNumber(Math.max(firstDayNumber, lastDayNumber)),
  };
}

export interface EventSegment<T> {
  readonly event: T;
  readonly weekIndex: number;
  /** 0–6, relative to `weekStart`. */
  readonly startColumn: number;
  readonly span: number;
  /** Stacking row within the week; 0 is closest to the date numbers. */
  readonly lane: number;
  /** The event started before this week's first cell / runs past its last. */
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface MonthPlacement<T> {
  readonly segments: readonly EventSegment<T>[];
  /** How many lanes each week actually used, so a row can size itself. */
  readonly laneCountByWeek: readonly number[];
}

/**
 * Lays events out as horizontal bars, one segment per week they touch.
 *
 * Lanes are allocated **per week**, not per event: a bar that wraps can sit in lane 0
 * one week and lane 2 the next, which is what every calendar does and what keeps a
 * long event from reserving a lane across weeks it does not occupy.
 *
 * Deterministic by construction — the sort is total (start, then longest, then id),
 * so the same input always produces the same lanes. A grid that reshuffles on every
 * refetch is the failure this avoids.
 */
export function placeEventsOnMonthGrid<T extends EventSpanInput>(
  grid: MonthGrid,
  events: readonly T[],
  viewerTimeZone: string,
): MonthPlacement<T> {
  const spans = events
    .map((event) => ({ event, ...eventSpan(event, viewerTimeZone) }))
    .sort((a, b) => {
      if (a.firstDate !== b.firstDate) return a.firstDate < b.firstDate ? -1 : 1;
      if (a.lastDate !== b.lastDate) return a.lastDate > b.lastDate ? -1 : 1;
      return a.event.id < b.event.id ? -1 : 1;
    });

  const segments: EventSegment<T>[] = [];
  const laneCountByWeek: number[] = [];

  grid.weeks.forEach((week, weekIndex) => {
    const firstCell = week[0];
    const lastCell = week[week.length - 1];
    if (!firstCell || !lastCell) {
      laneCountByWeek.push(0);
      return;
    }
    const weekStartDay = dayNumberOf(firstCell.date);
    const weekEndDay = dayNumberOf(lastCell.date);
    // occupied[lane] is a 7-slot row; a lane is free for a bar when every column it
    // would cover is free.
    const occupied: boolean[][] = [];

    for (const span of spans) {
      const spanStart = dayNumberOf(span.firstDate);
      const spanEnd = dayNumberOf(span.lastDate);
      if (spanEnd < weekStartDay || spanStart > weekEndDay) continue;

      const startColumn = Math.max(0, spanStart - weekStartDay);
      const endColumn = Math.min(DAYS_PER_WEEK - 1, spanEnd - weekStartDay);

      let lane = 0;
      while (isLaneTaken(occupied[lane], startColumn, endColumn)) lane += 1;
      let row = occupied[lane];
      if (!row) {
        row = new Array<boolean>(DAYS_PER_WEEK).fill(false);
        occupied[lane] = row;
      }
      for (let column = startColumn; column <= endColumn; column += 1) row[column] = true;

      segments.push({
        event: span.event,
        weekIndex,
        startColumn,
        span: endColumn - startColumn + 1,
        lane,
        continuesBefore: spanStart < weekStartDay,
        continuesAfter: spanEnd > weekEndDay,
      });
    }

    laneCountByWeek.push(occupied.length);
  });

  return { segments, laneCountByWeek };
}

function isLaneTaken(row: boolean[] | undefined, startColumn: number, endColumn: number): boolean {
  if (!row) return false;
  for (let column = startColumn; column <= endColumn; column += 1) {
    if (row[column]) return true;
  }
  return false;
}

/**
 * The composer shows a human an inclusive last day ("14 → 14 March" for a one-day
 * event); storage wants RFC 5545's exclusive end. These two are the only conversion
 * between those worlds, so the convention has exactly one owner.
 */
export function allDayWallRange(
  startDate: LocalDate,
  inclusiveEndDate: LocalDate,
): { startWall: LocalDateTime; endWall: LocalDateTime } {
  const startDay = dayNumberOf(startDate);
  const endDay = Math.max(startDay, dayNumberOf(inclusiveEndDate));
  return {
    startWall: `${dateFromDayNumber(startDay)} 00:00:00`,
    endWall: `${dateFromDayNumber(endDay + 1)} 00:00:00`,
  };
}

/** The inverse: the inclusive last day an editor should show for a stored end. */
export function inclusiveEndDate(startWall: LocalDateTime, endWall: LocalDateTime): LocalDate {
  const startDay = dayNumberOf(startWall.slice(0, 10));
  return dateFromDayNumber(Math.max(startDay, dayNumberOf(endWall.slice(0, 10)) - 1));
}
