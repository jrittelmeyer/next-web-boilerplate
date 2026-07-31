"use client";

import { Button } from "@repo/ui/components/button";
import { useFormatter, useTranslations } from "next-intl";

/**
 * Month navigation and the composer entry point.
 *
 * The heading is the grid's accessible title as well as its visible one, and it is
 * built from `format.dateTime(…, "monthYear")` rather than a month-name array — the
 * whole reason the seven named formats exist (I18N.md).
 */
export function CalendarToolbar({
  year,
  month,
  onMonthChange,
  onToday,
  onNewEvent,
  canCreateEvent,
}: {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  onToday: () => void;
  onNewEvent: () => void;
  canCreateEvent: boolean;
}) {
  const t = useTranslations("Calendar.toolbar");
  const format = useFormatter();

  // The 15th, in UTC: a mid-month instant names the right month in every zone.
  const label = format.dateTime(new Date(Date.UTC(year, month - 1, 15)), "monthYear");

  function shift(delta: number) {
    const zeroBased = month - 1 + delta;
    onMonthChange(year + Math.floor(zeroBased / 12), (((zeroBased % 12) + 12) % 12) + 1);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => shift(-1)}
          aria-label={t("previousMonth")}
        >
          ‹
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => shift(1)}
          aria-label={t("nextMonth")}
        >
          ›
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onToday}>
          {t("today")}
        </Button>
        <h2 className="ml-2 text-lg font-semibold tracking-tight" aria-live="polite">
          {label}
        </h2>
      </div>
      <Button type="button" size="sm" onClick={onNewEvent} disabled={!canCreateEvent}>
        {t("newEvent")}
      </Button>
    </div>
  );
}
