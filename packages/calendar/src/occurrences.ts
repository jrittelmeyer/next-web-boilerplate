/**
 * A series master plus its modifiers, materialised into concrete occurrences.
 *
 * This is where `expandRRule`'s bare civil starts become things that could be rows:
 * both ends, both zones, both instants and both offsets — the shape
 * `calendar_events_start_at_derived` accepts.
 *
 * The order of operations is RFC 5545's and it is not interchangeable:
 *
 *   1. expand the `RRULE`  ← `COUNT` is consumed HERE, before any exclusion
 *   2. union the `RDATE`s
 *   3. subtract the `EXDATE`s
 *   4. subtract occurrences that already have an override row
 *
 * Step 1 before step 3 is the one most implementations get wrong: `COUNT=5` with one
 * `EXDATE` yields **four** occurrences, not five, because `COUNT` counts what the rule
 * generates. The frozen oracle pins that.
 *
 * Step 4 exists because an overridden occurrence arrives as a real row through the range
 * query's concrete branch. Emitting it here too would paint it twice — once where it was
 * moved to, once where it used to be.
 */

import {
  addCivilDays,
  type CivilDateTime,
  formatLocalDateTime,
  type LocalDateTime,
  MS_PER_DAY,
  parseLocalDateTime,
  toDayNumber,
} from "./civil";
import { deriveEventInstants } from "./derive";
import { expandRRule } from "./expand";
import { parseRRule, type RecurrenceRule, untilInstantMs } from "./rrule";
import { resolveCivil } from "./timezone";

/**
 * "No window" for the `COUNT` walk. Finite on purpose: `Intl.DateTimeFormat` rejects a
 * non-finite time value, so `Infinity` here would throw inside `expandRRule`'s own bound
 * conversion rather than meaning what it looks like it means.
 */
const EARLIEST_INSTANT_MS = toDayNumber(1, 1, 1) * MS_PER_DAY;
const LATEST_INSTANT_MS = toDayNumber(9999, 12, 31) * MS_PER_DAY;

/** Matches the master row's columns, minus everything expansion does not read. */
export interface SeriesInput {
  readonly rrule: string;
  readonly startWall: LocalDateTime;
  readonly startTzid: string;
  readonly endWall: LocalDateTime;
  readonly endTzid: string;
  /** Occurrences the user skipped, by their ORIGINAL civil start. */
  readonly exdates: readonly LocalDateTime[];
  /** Extra occurrences, by civil start. They take the master's nominal span. */
  readonly rdates: readonly LocalDateTime[];
  /** `recurrence_id` of every occurrence that already has an override row. */
  readonly overriddenRecurrenceIds: readonly LocalDateTime[];
}

export interface MaterialisedOccurrence {
  /** The occurrence's ORIGINAL civil start — its identity, never the moved-to time. */
  readonly recurrenceId: LocalDateTime;
  readonly startWall: LocalDateTime;
  readonly startTzid: string;
  readonly startAtMs: number;
  readonly startOffsetMinutes: number;
  readonly endWall: LocalDateTime;
  readonly endTzid: string;
  readonly endAtMs: number;
  readonly endOffsetMinutes: number;
}

export interface ExpandSeriesResult {
  readonly occurrences: readonly MaterialisedOccurrence[];
  readonly truncated: boolean;
}

export interface OccurrenceWindow {
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * Builds one occurrence's full shape from a civil start.
 *
 * **The end is the master's end shifted by whole days, not by a duration in minutes.**
 * Every supported occurrence differs from `DTSTART` by a whole number of days at the
 * same wall time — we support no `BYHOUR` — so the shift is exact, and it is the only
 * formulation that survives independent start and end zones: a flight departing 09:00
 * New York and arriving 11:30 Los Angeles has no meaningful "duration in wall minutes".
 * Where the two zones match, the two formulations agree.
 */
function materialise(
  series: SeriesInput,
  masterStart: CivilDateTime,
  masterEnd: CivilDateTime,
  occurrenceStart: CivilDateTime,
): MaterialisedOccurrence {
  const dayDelta =
    toDayNumber(occurrenceStart.year, occurrenceStart.month, occurrenceStart.day) -
    toDayNumber(masterStart.year, masterStart.month, masterStart.day);
  const startWall = formatLocalDateTime(occurrenceStart);
  const endWall = formatLocalDateTime(addCivilDays(masterEnd, dayDelta));

  // The single writer, unchanged. Each occurrence re-resolves its own offset, which is
  // what keeps a 09:00 series at 09:00 across a DST transition.
  const derived = deriveEventInstants({
    startWall,
    startTzid: series.startTzid,
    endWall,
    endTzid: series.endTzid,
  });

  return {
    recurrenceId: startWall,
    startWall,
    startTzid: series.startTzid,
    startAtMs: derived.startAtMs,
    startOffsetMinutes: derived.startOffsetMinutes,
    endWall,
    endTzid: series.endTzid,
    endAtMs: derived.endAtMs,
    endOffsetMinutes: derived.endOffsetMinutes,
  };
}

/** Expands a master into the occurrences that fall inside a window. */
export function expandSeries(
  series: SeriesInput,
  window: OccurrenceWindow,
  limit: number,
): ExpandSeriesResult {
  const rule = parseRRule(series.rrule);
  const masterStart = parseLocalDateTime(series.startWall);
  const masterEnd = parseLocalDateTime(series.endWall);

  const expanded = expandRRule({
    rule,
    dtstart: masterStart,
    timeZone: series.startTzid,
    fromMs: window.fromMs,
    toMs: window.toMs,
    limit,
  });

  const byRecurrenceId = new Map<LocalDateTime, CivilDateTime>();
  for (const civil of expanded.occurrences) byRecurrenceId.set(formatLocalDateTime(civil), civil);

  // RDATEs are explicit additions, so they are not subject to the rule at all — only to
  // the window. A duplicate of a generated occurrence collapses, which is what makes
  // "add this date" idempotent from the caller's side as well as the database's.
  for (const rdate of series.rdates) {
    const civil = parseLocalDateTime(rdate);
    const key = formatLocalDateTime(civil);
    if (byRecurrenceId.has(key)) continue;
    const instantMs = resolveCivil(civil, series.startTzid).instantMs;
    if (instantMs >= window.fromMs && instantMs <= window.toMs) byRecurrenceId.set(key, civil);
  }

  for (const exdate of series.exdates) {
    byRecurrenceId.delete(formatLocalDateTime(parseLocalDateTime(exdate)));
  }
  for (const overridden of series.overriddenRecurrenceIds) {
    byRecurrenceId.delete(formatLocalDateTime(parseLocalDateTime(overridden)));
  }

  const occurrences = [...byRecurrenceId.values()]
    .map((civil) => materialise(series, masterStart, masterEnd, civil))
    .sort((a, b) => a.startAtMs - b.startAtMs);

  return {
    occurrences: occurrences.length > limit ? occurrences.slice(0, limit) : occurrences,
    truncated: expanded.truncated || occurrences.length > limit,
  };
}

/**
 * The instant a series can no longer produce anything after — `calendar_events.series_end_at`.
 *
 * **It may over-estimate. It must never under-estimate.** The range query uses it to
 * *exclude* masters, so the two error directions are not symmetric: over-estimating costs
 * a wasted expansion, under-estimating makes an entire series vanish from the grid.
 *
 * It is computed from the `RRULE` (and any `RDATE` past the rule's end) and is
 * **deliberately blind to `EXDATE`s**, so it is a permanent over-estimate. Stated that
 * way on purpose — "an EXDATE can only shorten it" is not the reason the rule holds, and
 * a maintainer who believed it would optimise this to track a trailing `EXDATE` and break
 * the invariant.
 *
 * `null` = unbounded.
 */
export function seriesEndInstantMs(series: SeriesInput): number | null {
  const rule = parseRRule(series.rrule);
  const masterStart = parseLocalDateTime(series.startWall);
  const masterEnd = parseLocalDateTime(series.endWall);
  const master = materialise(series, masterStart, masterEnd, masterStart);
  const spanMs = master.endAtMs - master.startAtMs;

  const ruleEnd = ruleEndInstantMs(rule, series, masterStart, masterEnd, spanMs);
  const rdateEnd = latestRDateEndMs(series, masterStart, masterEnd);

  if (ruleEnd === null) return null;
  if (rdateEnd === null) return ruleEnd;
  return Math.max(ruleEnd, rdateEnd);
}

function ruleEndInstantMs(
  rule: RecurrenceRule,
  series: SeriesInput,
  masterStart: CivilDateTime,
  masterEnd: CivilDateTime,
  spanMs: number,
): number | null {
  if (rule.until !== null) {
    // No expansion needed: no occurrence can start after UNTIL, so UNTIL plus the span
    // bounds every end. A small over-estimate, in the safe direction.
    return untilInstantMs(rule.until) + spanMs;
  }
  if (rule.count === null) return null;

  // A COUNT rule has to be walked — the nth occurrence is only knowable by generating the
  // first n-1. Bounded by MAX_RECURRENCE_COUNT at parse time, which is why that cap is
  // load-bearing rather than hygiene: this runs on every write.
  const expanded = expandRRule({
    rule,
    dtstart: masterStart,
    timeZone: series.startTzid,
    fromMs: EARLIEST_INSTANT_MS,
    toMs: LATEST_INSTANT_MS,
    limit: rule.count,
  });
  const last = expanded.occurrences.at(-1);
  // A rule that matches no date at all (`BYMONTH=2;BYMONTHDAY=30`) produces nothing, and
  // a series that can never occur has no end to record.
  if (last === undefined) return null;
  return materialise(series, masterStart, masterEnd, last).endAtMs;
}

function latestRDateEndMs(
  series: SeriesInput,
  masterStart: CivilDateTime,
  masterEnd: CivilDateTime,
): number | null {
  let latest: number | null = null;
  for (const rdate of series.rdates) {
    const end = materialise(series, masterStart, masterEnd, parseLocalDateTime(rdate)).endAtMs;
    if (latest === null || end > latest) latest = end;
  }
  return latest;
}
