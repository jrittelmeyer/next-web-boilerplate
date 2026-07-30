/**
 * Civil (wall-clock) date-time arithmetic. Zone-free by construction: nothing in
 * this file knows what a timezone is, and nothing in it constructs a `Date`.
 *
 * This is the layer the recurrence engine runs on, and that is the whole reason a
 * 09:00 weekly meeting survives a DST transition: expansion is pure calendar
 * arithmetic, so each occurrence re-resolves its own offset later (see
 * `timezone.ts`) rather than inheriting the first occurrence's.
 */

/**
 * A wall-clock reading with NO zone — `"2026-03-08 09:30:00"`.
 *
 * The wire/storage form of `CivilDateTime`, matching Postgres's rendering of
 * `timestamp(0) without time zone`. It is **not** an instant: never `new Date()`
 * it and never hand it to a display formatter. Pair it with an IANA zone id.
 */
export type LocalDateTime = string;

export interface CivilDateTime {
  /** Proleptic Gregorian year. */
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  /** 1–31, validated against the month. */
  readonly day: number;
  /** 0–23. */
  readonly hour: number;
  /** 0–59. */
  readonly minute: number;
  /** 0–59. Leap seconds are rejected — RFC 5545 has no representation for them. */
  readonly second: number;
}

const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

/** Floor division — `Math.floor` so negative years behave, unlike `/` + `| 0`. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in `month` (1–12) of `year`. Throws on an out-of-range month. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Month out of range: ${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  // Computed rather than table-indexed on purpose: under `noUncheckedIndexedAccess`
  // a lookup table needs an `?? 31` fallback that no input can ever reach, and an
  // unreachable branch cannot be covered — which the 100% gate would reject.
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Days since 1970-01-01 for a proleptic-Gregorian date (Howard Hinnant's
 * `days_from_civil`). Chosen over `Date.UTC` because `Date.UTC` silently maps
 * years 0–99 into 1900–1999, which would corrupt any date that far in the past.
 */
export function toDayNumber(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = floorDiv(y, 400);
  const yearOfEra = y - era * 400; // [0, 399]
  const monthShifted = month + (month > 2 ? -3 : 9); // March = 0
  const dayOfYear = floorDiv(153 * monthShifted + 2, 5) + day - 1; // [0, 365]
  const dayOfEra = yearOfEra * 365 + floorDiv(yearOfEra, 4) - floorDiv(yearOfEra, 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** Inverse of {@link toDayNumber} (Hinnant's `civil_from_days`). */
export function fromDayNumber(dayNumber: number): {
  year: number;
  month: number;
  day: number;
} {
  const z = dayNumber + 719_468;
  const era = floorDiv(z, 146_097);
  const dayOfEra = z - era * 146_097; // [0, 146096]
  const yearOfEra = floorDiv(
    dayOfEra - floorDiv(dayOfEra, 1460) + floorDiv(dayOfEra, 36_524) - floorDiv(dayOfEra, 146_096),
    365,
  ); // [0, 399]
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + floorDiv(yearOfEra, 4) - floorDiv(yearOfEra, 100)); // [0, 365]
  const monthShifted = floorDiv(5 * dayOfYear + 2, 153); // [0, 11], March = 0
  const day = dayOfYear - floorDiv(153 * monthShifted + 2, 5) + 1; // [1, 31]
  const month = monthShifted + (monthShifted < 10 ? 3 : -9); // [1, 12]
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(civil: CivilDateTime): number {
  const days = toDayNumber(civil.year, civil.month, civil.day);
  // 1970-01-01 was a Thursday (4). `% 7` can be negative for pre-epoch dates.
  return (((days + 4) % 7) + 7) % 7;
}

/**
 * The civil value reinterpreted as if it were UTC. This is a *pseudo*-instant: it
 * is only meaningful as an intermediate in zone conversion (see `timezone.ts`) and
 * must never be handed out as a real instant.
 */
export function civilToPseudoUtcMs(civil: CivilDateTime): number {
  return (
    toDayNumber(civil.year, civil.month, civil.day) * MS_PER_DAY +
    (civil.hour * 3600 + civil.minute * 60 + civil.second) * 1000
  );
}

/** Inverse of {@link civilToPseudoUtcMs}. */
export function pseudoUtcMsToCivil(ms: number): CivilDateTime {
  const dayNumber = floorDiv(ms, MS_PER_DAY);
  const { year, month, day } = fromDayNumber(dayNumber);
  const secondOfDay = Math.floor((ms - dayNumber * MS_PER_DAY) / 1000);
  return {
    year,
    month,
    day,
    hour: floorDiv(secondOfDay, 3600),
    minute: floorDiv(secondOfDay, 60) % 60,
    second: secondOfDay % 60,
  };
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Renders the canonical storage form: `"2026-03-08 09:30:00"` (space, not `T`). */
export function formatLocalDateTime(civil: CivilDateTime): LocalDateTime {
  const year = String(civil.year).padStart(4, "0");
  return (
    `${year}-${pad2(civil.month)}-${pad2(civil.day)} ` +
    `${pad2(civil.hour)}:${pad2(civil.minute)}:${pad2(civil.second)}`
  );
}

/**
 * Strict parse. Accepts `" "` or `"T"` as the separator — Postgres emits a space
 * and ISO 8601 uses `T`, and both reach this function from real inputs — but
 * {@link formatLocalDateTime} always emits the space form, so round-tripping
 * normalises. Rejects out-of-range fields, including February 30.
 */
export function parseLocalDateTime(value: string): CivilDateTime {
  if (!LOCAL_DATE_TIME_RE.test(value)) {
    throw new RangeError(`Not a local date-time: ${JSON.stringify(value)}`);
  }
  // Fixed-offset slices rather than capture groups: the regex has already pinned
  // every field's position and width, and `slice` returns `string` where
  // `match[n]` would be `string | undefined` under `noUncheckedIndexedAccess` —
  // forcing guards that no input can reach, which the 100% gate would reject.
  const civil: CivilDateTime = {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
    hour: Number(value.slice(11, 13)),
    minute: Number(value.slice(14, 16)),
    second: Number(value.slice(17, 19)),
  };
  if (civil.month < 1 || civil.month > 12) {
    throw new RangeError(`Month out of range: ${value}`);
  }
  if (civil.day < 1 || civil.day > daysInMonth(civil.year, civil.month)) {
    throw new RangeError(`Day out of range: ${value}`);
  }
  if (civil.hour > 23 || civil.minute > 59 || civil.second > 59) {
    throw new RangeError(`Time out of range: ${value}`);
  }
  return civil;
}

/** Non-throwing companion to {@link parseLocalDateTime}. */
export function isLocalDateTime(value: string): boolean {
  try {
    parseLocalDateTime(value);
    return true;
  } catch {
    return false;
  }
}

export function civilEquals(a: CivilDateTime, b: CivilDateTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

/** Negative when `a` is earlier. Ordering only — says nothing about instants. */
export function compareCivil(a: CivilDateTime, b: CivilDateTime): number {
  return civilToPseudoUtcMs(a) - civilToPseudoUtcMs(b);
}

/** Calendar-day arithmetic: the clock time is preserved exactly. */
export function addCivilDays(civil: CivilDateTime, days: number): CivilDateTime {
  const { year, month, day } = fromDayNumber(
    toDayNumber(civil.year, civil.month, civil.day) + days,
  );
  return { ...civil, year, month, day };
}

/** Nominal minute arithmetic — no zone, so no DST is applied. */
export function addCivilMinutes(civil: CivilDateTime, minutes: number): CivilDateTime {
  return pseudoUtcMsToCivil(civilToPseudoUtcMs(civil) + minutes * MS_PER_MINUTE);
}

/**
 * The nominal wall-clock distance in minutes, ignoring zones entirely. This is
 * what preserves an event's *duration as written*: a 09:00–10:00 meeting ends at
 * 10:00 wall-clock every week, and a 01:00–04:00 meeting on a spring-forward day
 * correctly occupies two real hours rather than three.
 */
export function civilDiffMinutes(from: CivilDateTime, to: CivilDateTime): number {
  return (civilToPseudoUtcMs(to) - civilToPseudoUtcMs(from)) / MS_PER_MINUTE;
}

/** True when the civil value sits exactly on midnight — the all-day invariant. */
export function isMidnight(civil: CivilDateTime): boolean {
  return civil.hour === 0 && civil.minute === 0 && civil.second === 0;
}
