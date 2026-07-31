import type { RecurrenceFrequency, RecurrenceRule, RecurrenceUntil } from "@repo/calendar";

/**
 * A parsed `RRULE`, as a sentence the reader can check.
 *
 * **Locale-safe by construction, not by translation.** Weekday and month names come from
 * `format.dateTime`, lists from `format.list`, ordinals from ICU `selectordinal` and
 * counts from ICU plurals — so a locale whose weekday order, ordinal suffixes or list
 * conjunction differ gets the right answer without anyone editing this file. A
 * hand-rolled `["Monday", …]` array here would be an English fact hiding in a shared
 * module, and `es.json` could not fix it.
 *
 * Pure, and therefore in `apps/web/vitest.config.ts`'s `coverage.include` — an explicit
 * file list, not a glob. The formatters arrive as parameters rather than as hooks
 * precisely so this stays testable without React: the caller supplies four small
 * functions and gets a string back.
 */

/** Every message this module reads, so a caller's `t` can be checked against it. */
export type RecurrenceProseKey =
  | `every.${RecurrenceFrequency}`
  | "inMonths"
  | "onOrdinals"
  | "onWeekdays"
  | "positions"
  | "count"
  | "until"
  | "ordinal"
  | "fromEnd"
  | "ordinalWeekday"
  | "dayOfMonth";

export interface RecurrenceProseFormat {
  readonly t: (key: RecurrenceProseKey, values?: Record<string, string | number>) => string;
  /** A weekday's name, 0 = Sunday — from `format.dateTime`, never from an array. */
  readonly weekday: (weekday: number) => string;
  /** A month's name, 1 = January. */
  readonly month: (month: number) => string;
  /** `format.list`, so the conjunction and the commas follow the locale. */
  readonly list: (items: readonly string[]) => string;
  /** An `UNTIL` bound. Its two RFC forms are different types and stay that way. */
  readonly date: (until: RecurrenceUntil) => string;
}

/**
 * `-1` reads as "last", not as "-1st". The RFC's negative ordinals count from the end of
 * the period, and every `BY*` part that takes them means the same thing by them, so the
 * label is shared between `BYMONTHDAY`, ordinal `BYDAY` and `BYSETPOS`.
 */
function positionLabel(position: number, format: RecurrenceProseFormat): string {
  return position < 0
    ? format.t("fromEnd", { position: -position })
    : format.t("ordinal", { position });
}

export function recurrenceProse(rule: RecurrenceRule, format: RecurrenceProseFormat): string {
  let text = format.t(`every.${rule.freq}`, { interval: rule.interval });

  if (rule.byMonth.length > 0) {
    text = format.t("inMonths", {
      base: text,
      months: format.list(rule.byMonth.map((month) => format.month(month))),
    });
  }

  // `BYMONTHDAY` and an ordinal `BYDAY` are the same clause to a reader — "on the 15th
  // day", "on the last Friday" — so they share one list. A plain `BYDAY` is not: "on the
  // Monday" is wrong where "on the last Friday" is right.
  const ordinals: string[] = rule.byMonthDay.map((day) =>
    format.t("dayOfMonth", { position: positionLabel(day, format) }),
  );
  const weekdays: string[] = [];
  for (const entry of rule.byDay) {
    if (entry.ordinal === null) {
      weekdays.push(format.weekday(entry.weekday));
      continue;
    }
    ordinals.push(
      format.t("ordinalWeekday", {
        position: positionLabel(entry.ordinal, format),
        weekday: format.weekday(entry.weekday),
      }),
    );
  }

  if (ordinals.length > 0) {
    text = format.t("onOrdinals", { base: text, days: format.list(ordinals) });
  }
  if (weekdays.length > 0) {
    text = format.t("onWeekdays", { base: text, days: format.list(weekdays) });
  }

  if (rule.bySetPos.length > 0) {
    text = format.t("positions", {
      base: text,
      positions: format.list(rule.bySetPos.map((position) => positionLabel(position, format))),
    });
  }

  // `COUNT` and `UNTIL` are mutually exclusive — `parseRRule` refuses a rule carrying
  // both — so this reads as the two ends of one choice rather than as two clauses.
  if (rule.count !== null) return format.t("count", { base: text, count: rule.count });
  if (rule.until !== null) return format.t("until", { base: text, date: format.date(rule.until) });
  return text;
}
