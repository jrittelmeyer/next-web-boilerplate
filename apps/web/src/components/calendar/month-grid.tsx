"use client";

import type { WeekStart } from "@repo/db/schema";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  buildMonthGrid,
  DAYS_PER_WEEK,
  type EventSegment,
  placeEventsOnMonthGrid,
} from "@/lib/calendar/grid";
import { EventChip } from "./event-chip";
import type { CalendarEventView } from "./types";

/**
 * The month view.
 *
 * A real `<table role="grid">`, not a div soup: the header row genuinely labels its
 * columns, so `<th scope="col">` does for free what an ARIA graph would otherwise
 * have to reconstruct.
 *
 * **One tab stop for the whole grid.** Exactly one cell carries `tabIndex={0}` (the
 * roving-tabindex pattern); arrows, Home/End and PageUp/PageDown move it, and Enter
 * or Space opens that day. Chips inside cells are `tabIndex={-1}`, so tabbing past a
 * busy month costs one keystroke rather than one per event.
 *
 * Multi-day events are drawn as lane-aligned chips repeated in every cell they
 * cover, rather than as one absolutely-positioned bar across the row. Absolute
 * positioning would need the table to lie about its layout and would take the bars
 * out of the cells a screen reader reads — this way the event is genuinely *in*
 * every day it occupies, and the lanes line up because every cell in a week renders
 * the same number of slots.
 */
export function MonthGrid({
  year,
  month,
  weekStart,
  timeZone,
  events,
  onOpenDay,
  onOpenEvent,
}: {
  year: number;
  month: number;
  weekStart: WeekStart;
  timeZone: string;
  events: readonly CalendarEventView[];
  onOpenDay: (date: string) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const t = useTranslations("Calendar.grid");
  const format = useFormatter();
  const grid = buildMonthGrid(year, month, weekStart);
  const placement = placeEventsOnMonthGrid(grid, events, timeZone);

  // The roving tab stop. Seeded to the 1st of the month so a fresh render always has
  // exactly one focusable cell, and re-seeded whenever the month changes (the key on
  // this component in the workspace remounts it).
  const [focusedDate, setFocusedDate] = useState(
    () => `${year}-${String(month).padStart(2, "0")}-01`,
  );
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());

  const cells = grid.weeks.flat();

  function moveFocus(from: string, deltaDays: number) {
    const index = cells.findIndex((cell) => cell.date === from);
    const next = cells[Math.min(cells.length - 1, Math.max(0, index + deltaDays))];
    if (!next) return;
    setFocusedDate(next.date);
    cellRefs.current.get(next.date)?.focus();
  }

  function onCellKeyDown(event: React.KeyboardEvent<HTMLTableCellElement>, date: string) {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -DAYS_PER_WEEK,
      ArrowDown: DAYS_PER_WEEK,
      PageUp: -cells.length,
      PageDown: cells.length,
      Home: -cells.length,
      End: cells.length,
    };
    const delta = deltas[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      moveFocus(date, delta);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDay(date);
    }
  }

  // Weekday headers come from `format.dateTime`, never a hard-coded array: a known
  // reference week is walked from `weekStart`, so the names, their order and their
  // script all follow the active locale. 2027-08-01 is a Sunday.
  //
  // Explicit options rather than the named `weekdayShort` format, for the one reason
  // a named format can't cover: these reference instants are UTC midnights, so they
  // must be READ in UTC. Rendered in the viewer's zone they would shift a day for
  // anyone west of Greenwich and the week would start on the wrong name.
  const weekdayNames = Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
    format.dateTime(new Date(Date.UTC(2027, 7, 1 + ((weekStart + index) % DAYS_PER_WEEK))), {
      weekday: "short",
      timeZone: "UTC",
    }),
  );

  // Mid-month, so the title names the right month in every zone: ±14 hours from the
  // 15th cannot cross a month boundary.
  const monthLabel = format.dateTime(new Date(Date.UTC(year, month - 1, 15)), "monthYear");

  return (
    <table
      // `<table role="grid">` with `<td role="gridcell">` is the WAI-ARIA APG
      // interactive-grid pattern, not a role bolted onto static content. The element
      // supplies the row/column semantics; the role supplies the interaction contract
      // (one tab stop, arrow-key navigation) that a plain table does not promise and
      // that this component genuinely implements. Biome's rule cannot tell the two
      // apart, and its suggested fix would leave a table whose cells take focus and
      // swallow arrow keys with nothing announcing why.
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: APG grid pattern, implemented in full.
      role="grid"
      aria-label={t("ariaLabel", { month: monthLabel })}
      className="w-full table-fixed border-collapse"
    >
      <thead>
        <tr>
          {weekdayNames.map((name) => (
            <th
              key={name}
              scope="col"
              className="border p-1 text-xs font-medium text-muted-foreground"
            >
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.weeks.map((week, weekIndex) => {
          const laneCount = placement.laneCountByWeek[weekIndex] ?? 0;
          return (
            <tr key={week[0]?.date ?? weekIndex}>
              {week.map((cell, column) => {
                const isFocusTarget = cell.date === focusedDate;
                const lanes = laneSlots(placement.segments, weekIndex, column, laneCount);
                return (
                  <td
                    key={cell.date}
                    ref={(node) => {
                      if (node) cellRefs.current.set(cell.date, node);
                      else cellRefs.current.delete(cell.date);
                    }}
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the other half of the APG grid pattern — see the <table role="grid"> note above.
                    role="gridcell"
                    tabIndex={isFocusTarget ? 0 : -1}
                    onFocus={() => setFocusedDate(cell.date)}
                    onKeyDown={(keyEvent) => onCellKeyDown(keyEvent, cell.date)}
                    onClick={() => onOpenDay(cell.date)}
                    data-date={cell.date}
                    data-in-month={cell.inMonth}
                    data-testid="calendar-day-cell"
                    className={[
                      "h-24 cursor-pointer border p-1 align-top",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                      cell.inMonth ? "" : "bg-muted/40 text-muted-foreground",
                    ].join(" ")}
                  >
                    <div className="mb-0.5 text-xs tabular-nums">{cell.day}</div>
                    <div className="flex flex-col gap-0.5">
                      {lanes.map((segment, lane) =>
                        segment ? (
                          <EventChip
                            key={segment.event.id}
                            event={segment.event}
                            showLabel={column === segment.startColumn}
                            continuesBefore={
                              column > segment.startColumn || segment.continuesBefore
                            }
                            continuesAfter={
                              column < segment.startColumn + segment.span - 1 ||
                              segment.continuesAfter
                            }
                            onOpen={onOpenEvent}
                          />
                        ) : (
                          // A spacer, not a gap: it is what keeps lane 2 in Tuesday
                          // level with lane 2 in Wednesday when Monday's event ended.
                          // biome-ignore lint/suspicious/noArrayIndexKey: the lane index IS the identity here.
                          <div key={`lane-${lane}`} className="h-5" aria-hidden="true" />
                        ),
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The per-cell lane array: `laneCount` slots, each holding the segment that covers
 * this column in that lane, or `null`.
 */
function laneSlots(
  segments: readonly EventSegment<CalendarEventView>[],
  weekIndex: number,
  column: number,
  laneCount: number,
): ReadonlyArray<EventSegment<CalendarEventView> | null> {
  const slots: Array<EventSegment<CalendarEventView> | null> = new Array(laneCount).fill(null);
  for (const segment of segments) {
    if (segment.weekIndex !== weekIndex) continue;
    if (column < segment.startColumn || column > segment.startColumn + segment.span - 1) continue;
    slots[segment.lane] = segment;
  }
  return slots;
}
