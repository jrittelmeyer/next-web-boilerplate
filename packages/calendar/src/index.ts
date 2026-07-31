/**
 * The calendar domain core: pure, I/O-free, framework-free.
 *
 * @public — the package's whole surface. Consumers arrive by phase (`apps/web`
 * first, then the `@repo/jobs` reminder sweeper), so an export can legitimately
 * exist a phase before its first caller.
 */
export {
  addCivilDays,
  addCivilMinutes,
  type CivilDateTime,
  civilDiffMinutes,
  civilEquals,
  compareCivil,
  dayOfWeek,
  daysInMonth,
  formatLocalDateTime,
  fromDayNumber,
  isLeapYear,
  isLocalDateTime,
  isMidnight,
  type LocalDateTime,
  MS_PER_DAY,
  MS_PER_MINUTE,
  parseLocalDateTime,
  toDayNumber,
} from "./civil";
export {
  type DerivedEventInstants,
  type DeriveEventInstantsInput,
  deriveEventInstants,
} from "./derive";
export {
  type ExpandRRuleInput,
  type ExpandRRuleResult,
  expandRRule,
} from "./expand";
export {
  type ExpandSeriesResult,
  expandSeries,
  type MaterialisedOccurrence,
  type OccurrenceWindow,
  type SeriesInput,
  seriesEndInstantMs,
} from "./occurrences";
export {
  formatRRule,
  MAX_RECURRENCE_COUNT,
  parseRRule,
  RECURRENCE_FREQUENCIES,
  type RecurrenceByDay,
  type RecurrenceFrequency,
  type RecurrenceRule,
  type RecurrenceUntil,
  untilInstantMs,
  type Weekday,
} from "./rrule";
export {
  type CivilResolutionKind,
  canonicalizeTimeZone,
  civilToInstant,
  type Disambiguation,
  instantToCivil,
  offsetMinutesAt,
  type ResolvedInstant,
  resolveCivil,
} from "./timezone";
