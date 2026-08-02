import { expandSeries, type SeriesInput } from "@repo/calendar";

/**
 * The reminder sweeper's **pure half** — window arithmetic and occurrence selection, with
 * no database, no clock and no I/O. The I/O shell that feeds it is `run.ts`.
 *
 * The split is not tidiness. `packages/jobs/vitest.config.ts` gates `src/handlers/**` at
 * 90/90/80/90 while the DB-backed integration config reports no coverage at all, so
 * behaviour that lives in a handler is measured but nearly untestable there, and behaviour
 * that lives only in the integration suite is untested by the gate. Everything with a branch
 * worth arguing about therefore lives HERE, where a unit test can reach it — and this file
 * is named explicitly in `coverage.include` for the same reason.
 */

/**
 * How far back a sweep looks. A worker that was down for less than this catches up on the
 * next tick; one that was down for longer drops what it slept through.
 *
 * **A fixed lookback, not a persisted cursor.** A cursor is one stuck row away from either
 * replaying everything or silently skipping a day, and would need its own table, migration
 * and recovery story. The dedupe unique already makes an overlapping window a no-op, so the
 * lookback is free to overlap — and a two-hour-late "starts in about 15 minutes" is noise,
 * not a reminder.
 */
export const GRACE_MINUTES = 60;

/**
 * Slack on the recurring branch's `series_end_at` pre-filter. **367, not 366**, and that is
 * the same off-by-an-hour `calendar-events.ts` documents: the span CHECK measures ELAPSED
 * time, so a 366-day span crossing a DST transition is 366 days ± 1 hour. The window query
 * in `apps/web` already uses 367 for exactly this reason.
 */
export const SERIES_SLACK_DAYS = 367;

const MS_PER_MINUTE = 60_000;

/** Delivery is ±5–6 minutes, so the number the copy shows is rounded to match. */
export const ROUNDING_MINUTES = 5;

export interface FireWindow {
  /** Exclusive. */
  readonly fromMs: number;
  /** Inclusive — "now", from Postgres's clock. */
  readonly toMs: number;
}

/**
 * The window of fire times this tick is responsible for.
 *
 * Half-open `(from, to]` rather than closed on both ends: consecutive ticks must not both
 * own the same boundary instant. The dedupe ledger would absorb a double-claim anyway, but
 * an interval that cannot overlap is one fewer thing resting on it.
 */
export function fireWindow(nowMs: number, graceMinutes = GRACE_MINUTES): FireWindow {
  return { fromMs: nowMs - graceMinutes * MS_PER_MINUTE, toMs: nowMs };
}

/**
 * The window of occurrence STARTS that could fire inside `window`, for one offset.
 *
 * A reminder fires at `start + offset`, so a fire window of `(f, t]` corresponds to starts in
 * `(f - offset, t - offset]`. A "1 day before" reminder (`offset = -1440`) is therefore
 * asking about occurrences starting roughly a day from now, which is why an unbounded offset
 * would mean an unbounded expansion window — and why the column carries a ±366-day CHECK.
 */
export function occurrenceWindowFor(window: FireWindow, offsetMinutes: number): FireWindow {
  const shift = offsetMinutes * MS_PER_MINUTE;
  return { fromMs: window.fromMs - shift, toMs: window.toMs - shift };
}

/** Whether a single concrete occurrence's start fires inside the window for this offset. */
export function firesInWindow(
  startAtMs: number,
  offsetMinutes: number,
  window: FireWindow,
): boolean {
  const fireAt = startAtMs + offsetMinutes * MS_PER_MINUTE;
  return fireAt > window.fromMs && fireAt <= window.toMs;
}

/**
 * Minutes until the occurrence starts, rounded to the nearest 5 and never negative.
 *
 * Clamped at 0 because a reminder caught by the grace window can be dispatched *after* the
 * event began — "starts in about -25 minutes" is worse than saying nothing about the
 * remaining time, and the email states the actual start time regardless.
 */
export function startsInMinutes(startAtMs: number, nowMs: number): number {
  const raw = (startAtMs - nowMs) / MS_PER_MINUTE;
  if (raw <= 0) return 0;
  return Math.round(raw / ROUNDING_MINUTES) * ROUNDING_MINUTES;
}

/**
 * The lower bound a series must be able to reach to be worth expanding.
 *
 * `series_end_at` bounds when the series stops producing occurrences. A reminder with a
 * POSITIVE offset fires after its occurrence, so a series that ended minutes ago can still
 * owe a reminder now — which is why this subtracts the slack instead of comparing the fire
 * window's lower bound directly.
 */
export function seriesFloorMs(window: FireWindow): number {
  return window.fromMs - SERIES_SLACK_DAYS * 24 * 60 * MS_PER_MINUTE;
}

export interface DueOccurrence {
  /** The occurrence's start instant — the dedupe ledger's key. */
  readonly startAtMs: number;
  readonly startWall: string;
  readonly startTzid: string;
}

/**
 * Every occurrence of one recurring master that fires inside `window` for one offset.
 *
 * `series.overriddenRecurrenceIds` **must** be populated by the caller. An occurrence that
 * has an override row is a concrete event in its own right and is swept by the concrete
 * branch; leaving it in the expansion too would remind the user twice for one meeting.
 *
 * `limit` bounds a pathological series (a per-minute rule under a 60-minute grace window)
 * rather than expressing a policy — the window itself terminates every ordinary shape.
 */
export function dueOccurrences(
  series: SeriesInput,
  offsetMinutes: number,
  window: FireWindow,
  limit = 512,
): DueOccurrence[] {
  const occurrenceWindow = occurrenceWindowFor(window, offsetMinutes);
  const { occurrences } = expandSeries(
    series,
    // expandSeries's window is inclusive at both ends; the half-open filter below is what
    // actually decides, so widening by a millisecond here only affects what it considers.
    { fromMs: occurrenceWindow.fromMs, toMs: occurrenceWindow.toMs },
    limit,
  );

  const due: DueOccurrence[] = [];
  for (const occurrence of occurrences) {
    if (!firesInWindow(occurrence.startAtMs, offsetMinutes, window)) continue;
    due.push({
      startAtMs: occurrence.startAtMs,
      startWall: occurrence.startWall,
      startTzid: occurrence.startTzid,
    });
  }
  return due;
}
