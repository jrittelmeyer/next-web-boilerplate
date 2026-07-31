"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { CalendarEventView } from "./types";

/**
 * One event, as it appears inside a day cell.
 *
 * **Never text on a saturated `--chart-*` fill.** At chip type sizes (12–13 px) the
 * chart tokens fail `color-contrast` against both black and white in at least one
 * theme, which `a11y.spec.ts` would catch. The chip is therefore a heavily tinted
 * wash (`color-mix`, ~15%) carrying normal foreground text, with the saturated token
 * used only as a solid 3 px accent bar — the colour still identifies the calendar at
 * a glance, but nothing has to be legible *on* it.
 *
 * `tabIndex={-1}` is deliberate and is half of the grid's single-tab-stop contract:
 * the day cell owns the tab stop, arrow keys move between cells, and `Enter` opens
 * the day's popover where chips become reachable normally. A month with 40 events
 * would otherwise cost 40 Tab presses to walk past.
 */
export function EventChip({
  event,
  showLabel,
  continuesBefore,
  continuesAfter,
  onOpen,
}: {
  event: CalendarEventView;
  /** False on the continuation cells of a multi-day bar, which show colour only. */
  showLabel: boolean;
  continuesBefore: boolean;
  continuesAfter: boolean;
  onOpen: (eventId: string) => void;
}) {
  const t = useTranslations("Calendar.chip");
  const format = useFormatter();

  // All-day rows carry no meaningful clock, and a timed row's start is the only
  // thing that fits. `timeOnly` is one of the named formats in i18n/request.ts, so
  // 12h/24h follows the locale instead of a hard-coded pattern.
  const time = event.allDay ? null : format.dateTime(event.startAt, "timeOnly");

  const label = event.allDay ? event.title : `${time} ${event.title}`;
  const accessibleLabel = continuesBefore ? t("continued", { title: event.title }) : label;

  return (
    <button
      type="button"
      tabIndex={-1}
      // `stopPropagation` is load-bearing, not defensive: the day cell this chip sits
      // in is itself clickable (it opens the day popover), so without it a click on a
      // chip opens the composer AND the popover at once — two dialogs, fighting over
      // the focus trap. Caught by e2e/calendar.spec.ts, which could not find the
      // composer's fields because the day popover had taken focus.
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onOpen(event.id);
      }}
      aria-label={accessibleLabel}
      title={label}
      data-testid="calendar-event-chip"
      data-event-id={event.id}
      className={[
        "flex h-5 w-full items-center gap-1 overflow-hidden px-1 text-left text-xs",
        "border-l-[3px] text-foreground hover:brightness-95 dark:hover:brightness-125",
        continuesBefore ? "rounded-l-none border-l-0 pl-2" : "rounded-l-sm",
        continuesAfter ? "rounded-r-none" : "rounded-r-sm",
      ].join(" ")}
      style={{
        backgroundColor: `color-mix(in oklab, var(--${event.resolvedColor}) 15%, transparent)`,
        borderLeftColor: `var(--${event.resolvedColor})`,
      }}
    >
      {showLabel ? (
        <span className="truncate">
          {time ? <span className="tabular-nums text-muted-foreground">{time} </span> : null}
          {event.title}
        </span>
      ) : null}
    </button>
  );
}
