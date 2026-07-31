"use client";

import { parseRRule, type RecurrenceUntil } from "@repo/calendar";
import { useFormatter, useTranslations } from "next-intl";
import { type RecurrenceProseFormat, recurrenceProse } from "@/lib/calendar/recurrence-prose";

/**
 * A repeat rule, in a sentence.
 *
 * Every name in it comes from `format.dateTime` / `format.list` rather than from a
 * table, so "Every 2 weeks on Monday and Wednesday" becomes "Cada 2 semanas los lunes y
 * los miércoles" without this file knowing anything about Spanish. The composition lives
 * in `lib/calendar/recurrence-prose.ts`, which is pure and covered; this component is
 * only the wiring.
 *
 * An unreadable rule renders as a sentence too, not as a thrown error. The composer lets
 * a user type a rule by hand, so half-typed input is the normal state of this prop —
 * and a stored rule that no longer parses (a grammar narrowed by a later phase) should
 * still leave the event editable.
 */
export function RecurrenceSummary({ rrule }: { rrule: string | null }) {
  const t = useTranslations("Calendar.recurrence");
  const format = useFormatter();

  // 2027-08-01 is a Sunday, so `1 + weekday` walks Sunday→Saturday. Read in UTC: these
  // are UTC midnights, and rendering them in the viewer's zone would shift a day for
  // anyone west of Greenwich and name the wrong weekday.
  const proseFormat: RecurrenceProseFormat = {
    t: (key, values) => t(key, values),
    weekday: (weekday) =>
      format.dateTime(new Date(Date.UTC(2027, 7, 1 + weekday)), {
        weekday: "long",
        timeZone: "UTC",
      }),
    month: (month) =>
      format.dateTime(new Date(Date.UTC(2027, month - 1, 15)), {
        month: "long",
        timeZone: "UTC",
      }),
    list: (items) => format.list(items),
    date: (until: RecurrenceUntil) =>
      format.dateTime(
        // A `DATE`-form UNTIL carries no clock, so it is read at midday UTC: ±14 hours
        // from noon cannot cross a date boundary in any zone.
        new Date(until.kind === "utc" ? until.instantMs : `${until.date}T12:00:00Z`),
        { dateStyle: "long", timeZone: "UTC" },
      ),
  };

  if (rrule === null) return <span>{t("never")}</span>;

  let text: string;
  try {
    text = recurrenceProse(parseRRule(rrule), proseFormat);
  } catch {
    return <span>{t("unreadable")}</span>;
  }
  return <span data-testid="recurrence-summary">{text}</span>;
}
