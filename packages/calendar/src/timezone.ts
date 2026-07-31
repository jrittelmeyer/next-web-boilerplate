/**
 * The only place in the codebase that converts between a wall-clock reading and a
 * point on the timeline.
 *
 * `Intl.DateTimeFormat` is used purely as a **computation** primitive here — it is
 * the one IANA timezone database that ships with the runtime, and it updates when
 * Node updates. Nothing in this file formats anything for a human; display
 * formatting is next-intl's job in `apps/web`. The locale is pinned to
 * `en-US-u-ca-iso8601` so neither the ambient locale nor a non-Gregorian default
 * calendar can change the numbers.
 *
 * Postgres is deliberately never asked to do this conversion. It **can**: the
 * two-argument `timezone(text, timestamp)` behind `AT TIME ZONE <non-constant>` is
 * marked `IMMUTABLE` on PG 18 (only the one-argument session-`TimeZone` form is
 * `STABLE`), so it is legal in a generated column, an index and a CHECK. That
 * marking is a deliberate upstream fiat despite the function's dependence on a
 * mutable timezone database — the accepted cost is rebuilding affected indexes
 * after a tzdata update. We decline anyway, for reasons that have nothing to do
 * with legality: its ambiguity resolution differs from ours (Postgres takes the
 * *later* instant on a fall-back overlap, `resolveCivil` takes the earlier — the
 * `compatible` rule), and its bundled tzdata is a separate copy from Node's ICU on
 * a separate release cadence, so anything in the schema that consulted it would
 * start rejecting existing rows on every UPDATE once the two skew.
 *
 * Note that a CHECK constraint is not evidence either way here: Postgres does not
 * enforce volatility in CHECKs at all — a `STABLE` expression builds fine in one.
 * Generated columns do enforce it, and are the discriminator that established the
 * marking above.
 */

import {
  type CivilDateTime,
  civilEquals,
  civilToPseudoUtcMs,
  MS_PER_DAY,
  MS_PER_MINUTE,
} from "./civil";

/** Locale-independent by construction — see the file header. */
const COMPUTE_LOCALE = "en-US-u-ca-iso8601";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  // `hourCycle: "h23"` rather than `hour12: false`: the latter is specified to
  // produce hour 24 for midnight in some configurations, which would silently
  // shift a date by a day.
  const formatter = new Intl.DateTimeFormat(COMPUTE_LOCALE, {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * Validates an IANA zone id, returning the runtime's preferred spelling of it, or
 * `null` if the runtime does not know it.
 *
 * Deliberately not `Intl.supportedValuesOf("timeZone").includes(value)`: that list
 * holds only the identifiers ICU considers primary, so it rejects perfectly valid
 * aliases that real ICS files are full of. Verified on this runtime — `US/Eastern`,
 * `Asia/Kolkata` and `GMT` are all absent from the list yet all resolve correctly.
 *
 * **The returned spelling is runtime-dependent and must never be compared for
 * equality across systems.** Also verified here: this ICU build resolves
 * `Asia/Kolkata` *to* `Asia/Calcutta` — the reverse of the modern IANA primary —
 * so a value canonicalised by one Node version can disagree, as a string, with one
 * canonicalised by another. That is harmless for conversion (aliases share their
 * rules, so every function in this file returns identical results for either
 * spelling) and dangerous only if zone ids are diffed as text. Compare behaviour,
 * never spelling.
 */
export function canonicalizeTimeZone(value: string): string | null {
  try {
    return new Intl.DateTimeFormat(COMPUTE_LOCALE, { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Reads the wall clock in `timeZone` at a given instant. */
export function instantToCivil(instantMs: number, timeZone: string): CivilDateTime {
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  // `formatToParts` accepts a time value directly, so no `Date` is constructed.
  for (const part of getFormatter(timeZone).formatToParts(instantMs)) {
    switch (part.type) {
      case "year":
        year = Number(part.value);
        break;
      case "month":
        month = Number(part.value);
        break;
      case "day":
        day = Number(part.value);
        break;
      case "hour":
        hour = Number(part.value);
        break;
      case "minute":
        minute = Number(part.value);
        break;
      case "second":
        second = Number(part.value);
        break;
      default:
        // Literal separators ("-", ", ", ":") — nothing to read.
        break;
    }
  }
  return { year, month, day, hour, minute, second };
}

/**
 * The UTC offset in **minutes** at a given instant. Minutes, not hours, because
 * `Asia/Kolkata` is +05:30, `Pacific/Chatham` is +13:45, and `Australia/Lord_Howe`
 * shifts by 30 rather than 60 across its DST boundary.
 *
 * Sub-minute offsets (pre-1900 local mean time) round to the nearest minute; the
 * calendar does not model dates that far back.
 */
export function offsetMinutesAt(instantMs: number, timeZone: string): number {
  const civil = instantToCivil(instantMs, timeZone);
  return Math.round((civilToPseudoUtcMs(civil) - instantMs) / MS_PER_MINUTE);
}

/**
 * How to resolve a wall-clock reading that is not a single instant.
 *
 * `compatible` is the default and matches Temporal, `java.time.ZonedDateTime`,
 * Luxon and Google Calendar: a reading in a spring-forward **gap** shifts forward
 * past it, and a reading in a fall-back **overlap** takes the earlier instant.
 */
export type Disambiguation = "compatible" | "earlier" | "later";

export type CivilResolutionKind = "unique" | "gap" | "overlap";

export interface ResolvedInstant {
  readonly instantMs: number;
  readonly offsetMinutes: number;
  /**
   * `gap` and `overlap` are surfaced rather than swallowed so the composer can
   * warn ("2:30 AM doesn't exist on this date — using 3:30 AM"). Nothing is
   * stored: the resolution is recomputed deterministically from (civil, zone).
   */
  readonly kind: CivilResolutionKind;
}

/**
 * Resolves a wall-clock reading to an instant, reporting whether the reading was
 * unique.
 *
 * Both candidate offsets are sampled a day either side of the reading — offset
 * transitions are months apart, so a day is always enough to bracket one — and
 * each candidate is verified by converting back. Throwing on a gap is not an
 * option: a recurring event can drift into one years after it was created, and
 * throwing at expansion time would blank a whole month view for an event nobody
 * touched.
 */
export function resolveCivil(
  civil: CivilDateTime,
  timeZone: string,
  disambiguation: Disambiguation = "compatible",
): ResolvedInstant {
  const pseudo = civilToPseudoUtcMs(civil);
  const offsetBefore = offsetMinutesAt(pseudo - MS_PER_DAY, timeZone);
  const offsetAfter = offsetMinutesAt(pseudo + MS_PER_DAY, timeZone);

  if (offsetBefore === offsetAfter) {
    return {
      instantMs: pseudo - offsetBefore * MS_PER_MINUTE,
      offsetMinutes: offsetBefore,
      kind: "unique",
    };
  }

  const candidateBefore = pseudo - offsetBefore * MS_PER_MINUTE;
  const candidateAfter = pseudo - offsetAfter * MS_PER_MINUTE;
  const beforeMatches = civilEquals(instantToCivil(candidateBefore, timeZone), civil);
  const afterMatches = civilEquals(instantToCivil(candidateAfter, timeZone), civil);

  if (beforeMatches && afterMatches) {
    // Overlap. Comparing the resulting instants is deliberate rather than assuming
    // "the pre-transition offset is the larger one" — that assumption holds for
    // ordinary northern/southern DST but not for a zone whose tzdata models the
    // shift as a negative offset, and the comparison costs nothing.
    const takeBefore =
      disambiguation === "later"
        ? candidateBefore > candidateAfter
        : candidateBefore < candidateAfter;
    return {
      instantMs: takeBefore ? candidateBefore : candidateAfter,
      offsetMinutes: takeBefore ? offsetBefore : offsetAfter,
      kind: "overlap",
    };
  }

  if (beforeMatches || afterMatches) {
    return {
      instantMs: beforeMatches ? candidateBefore : candidateAfter,
      offsetMinutes: beforeMatches ? offsetBefore : offsetAfter,
      kind: "unique",
    };
  }

  // Gap: the reading does not exist. Applying the pre-transition offset lands
  // after the gap (compatible/later); the post-transition offset lands before it.
  const takeBefore = disambiguation !== "earlier";
  return {
    instantMs: takeBefore ? candidateBefore : candidateAfter,
    offsetMinutes: takeBefore ? offsetBefore : offsetAfter,
    kind: "gap",
  };
}

/** {@link resolveCivil} when only the instant is wanted. */
export function civilToInstant(
  civil: CivilDateTime,
  timeZone: string,
  disambiguation: Disambiguation = "compatible",
): number {
  return resolveCivil(civil, timeZone, disambiguation).instantMs;
}
