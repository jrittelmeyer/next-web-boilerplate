/**
 * The single writer of an event's derived instants.
 *
 * Civil time is the source of truth (`start_wall` + `start_tzid`); `start_at` is a
 * cache that exists only so window queries can use a btree. Every write of that
 * cache comes from here, and the database rejects anything else — see
 * `calendar_events_start_at_derived` in `packages/db/src/schema/calendar-events.ts`.
 *
 * The resolved UTC offset is **returned, not discarded**, because it is what makes
 * that constraint enforceable without consulting a timezone database:
 *
 *   start_at = (start_wall - make_interval(mins => start_offset_minutes)) AT TIME ZONE 'UTC'
 *
 * is pure arithmetic. A constraint written the other way — re-deriving the instant
 * from the zone id inside Postgres — was measured against PG 18 and rejected for
 * three reasons: Postgres resolves a fall-back overlap to the *later* instant while
 * we resolve to the earlier, so it could not tell a correct row from a wrong-branch
 * one; its bundled tzdata is a different copy from Node's ICU, so a rule change
 * landing in one and not the other makes existing rows fail their own CHECK on
 * every UPDATE — including the UPDATE that soft-deletes them; and it disagrees with
 * us by seconds on pre-1900 local mean time, which `offsetMinutesAt` rounds to whole
 * minutes by design. Storing the offset sidesteps all three.
 */

import { type LocalDateTime, parseLocalDateTime } from "./civil";
import { type CivilResolutionKind, canonicalizeTimeZone, resolveCivil } from "./timezone";

export interface DeriveEventInstantsInput {
  readonly startWall: LocalDateTime;
  readonly startTzid: string;
  readonly endWall: LocalDateTime;
  readonly endTzid: string;
}

export interface DerivedEventInstants {
  /** Epoch milliseconds — never a `Date`; the caller wraps at the driver boundary. */
  readonly startAtMs: number;
  /** The offset actually applied, in minutes. Persisted; the CHECK reads it. */
  readonly startOffsetMinutes: number;
  readonly startKind: CivilResolutionKind;
  readonly endAtMs: number;
  readonly endOffsetMinutes: number;
  readonly endKind: CivilResolutionKind;
}

/**
 * Resolves both ends of an event.
 *
 * Start and end carry independent zones so a flight can depart 09:00 in New York
 * and arrive 11:30 in Los Angeles. `RangeError` on an unparseable civil value or an
 * unknown zone id, so bad input fails at this boundary rather than reaching
 * Postgres as a constraint violation the UI has to decode.
 *
 * `startKind`/`endKind` report whether the reading was `unique`, in a spring-forward
 * `gap`, or in a fall-back `overlap`, so a composer can say "2:30 AM doesn't exist on
 * this date — using 3:30 AM". Nothing about the resolution is stored beyond the
 * offset: the kind is recomputed deterministically from (civil, zone).
 */
export function deriveEventInstants(input: DeriveEventInstantsInput): DerivedEventInstants {
  const start = resolveEnd(input.startWall, input.startTzid);
  const end = resolveEnd(input.endWall, input.endTzid);

  return {
    startAtMs: start.instantMs,
    startOffsetMinutes: start.offsetMinutes,
    startKind: start.kind,
    endAtMs: end.instantMs,
    endOffsetMinutes: end.offsetMinutes,
    endKind: end.kind,
  };
}

function resolveEnd(wall: LocalDateTime, tzid: string) {
  if (canonicalizeTimeZone(tzid) === null) {
    throw new RangeError(`Unknown time zone: ${JSON.stringify(tzid)}`);
  }
  // `parseLocalDateTime` throws its own RangeError on a malformed or out-of-range
  // reading (February 30, hour 24), so no second validation is needed here.
  return resolveCivil(parseLocalDateTime(wall), tzid);
}
