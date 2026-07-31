"use client";

import type { WeekStart } from "@repo/db/schema";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { buildMonthGrid, eventSpan, monthGridWindowMs } from "@/lib/calendar/grid";
import { useTRPC } from "@/lib/trpc/client";
import { CalendarList } from "./calendar-list";
import { CalendarToolbar } from "./calendar-toolbar";
import { EventComposer, type EventComposerDefaults } from "./event-composer";
import { MonthGrid } from "./month-grid";
import { type CalendarEventView, toEventView } from "./types";

/**
 * The month view's client shell: which month, which calendars, and which dialog is
 * open. Everything below it is presentational or a form.
 *
 * The window query runs from the client rather than being SSR-seeded, because the
 * month changes without a navigation — an RSC round-trip per arrow press would make
 * paging through a year feel like using a website from 2009.
 */
export function CalendarWorkspace({
  timeZone,
  weekStart,
  initialYear,
  initialMonth,
  todayDate,
}: {
  timeZone: string;
  weekStart: WeekStart;
  initialYear: number;
  initialMonth: number;
  /** `"YYYY-MM-DD"` for the user's own zone, computed on the server. */
  todayDate: string;
}) {
  const t = useTranslations("Calendar.workspace");
  const format = useFormatter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [{ year, month }, setMonth] = useState({ year: initialYear, month: initialMonth });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [composer, setComposer] = useState<EventComposerDefaults | null>(null);
  // Editing goes through `calendar.byId` rather than reusing the grid row.
  // `calendar.range` deliberately does not select `description` or `url` — a month
  // of full event bodies is a lot of wire for text nothing on the grid renders — so
  // seeding the composer from a grid row would submit `null` for both and silently
  // erase them. The detail read is the one that has the whole event.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const editingQuery = useQuery({
    ...trpc.calendar.byId.queryOptions({ id: editingId ?? "" }),
    enabled: editingId !== null,
  });

  const calendarsQuery = useQuery(trpc.calendar.list.queryOptions({}));
  const calendars = calendarsQuery.data ?? [];
  const visibleCalendars = calendars.filter((calendar) => !hidden.has(calendar.id));

  const grid = buildMonthGrid(year, month, weekStart);
  const window = monthGridWindowMs(grid, timeZone);

  const rangeQuery = useQuery({
    ...trpc.calendar.range.queryOptions({
      calendarIds: visibleCalendars.map((calendar) => calendar.id),
      fromMs: window.fromMs,
      toMs: window.toMs,
    }),
    // The schema requires at least one calendar; with everything hidden (or before
    // the list arrives) there is nothing to ask for and asking would be a 400.
    enabled: visibleCalendars.length > 0,
  });

  const colorById = new Map(calendars.map((calendar) => [calendar.id, calendar.color]));
  const events: CalendarEventView[] = (rangeQuery.data?.items ?? []).map((event) =>
    toEventView(event, colorById.get(event.calendarId) ?? "chart-1"),
  );

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: trpc.calendar.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.calendar.range.queryKey() });
  }

  function defaultsForDate(date: string): EventComposerDefaults | null {
    const target = visibleCalendars[0] ?? calendars[0];
    if (!target) return null;
    return {
      calendarId: target.id,
      title: "",
      description: null,
      location: null,
      url: null,
      color: null,
      status: "confirmed",
      visibility: "default",
      transparency: "opaque",
      allDay: false,
      startWall: `${date} 09:00:00`,
      // The calendar's own zone, not the viewer's: a work calendar pinned to
      // America/New_York should keep making New York events when its owner is
      // travelling, which is the entire reason the column exists.
      startTzid: target.timeZone,
      endWall: `${date} 10:00:00`,
      endTzid: target.timeZone,
    };
  }

  const loaded = editingQuery.data;
  const editingDefaults: EventComposerDefaults | null = loaded
    ? {
        id: loaded.event.id,
        calendarId: loaded.event.calendarId,
        title: loaded.event.title,
        description: loaded.event.description,
        location: loaded.event.location,
        url: loaded.event.url,
        color: loaded.event.color,
        status: loaded.event.status,
        visibility: loaded.event.visibility,
        transparency: loaded.event.transparency,
        allDay: loaded.event.allDay,
        startWall: loaded.event.startWall,
        startTzid: loaded.event.startTzid,
        endWall: loaded.event.endWall,
        endTzid: loaded.event.endTzid,
      }
    : null;
  const activeDefaults = editingId ? editingDefaults : composer;

  const dayEvents = openDay
    ? events.filter((event) => {
        const span = eventSpan(event, timeZone);
        return span.firstDate <= openDay && openDay <= span.lastDate;
      })
    : [];

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <CalendarList
          calendars={calendars}
          selectedIds={new Set(visibleCalendars.map((calendar) => calendar.id))}
          onToggle={(calendarId) =>
            setHidden((current) => {
              const next = new Set(current);
              if (next.has(calendarId)) next.delete(calendarId);
              else next.add(calendarId);
              return next;
            })
          }
          defaultTimeZone={timeZone}
          onChanged={refetchAll}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <CalendarToolbar
          year={year}
          month={month}
          onMonthChange={(nextYear, nextMonth) => setMonth({ year: nextYear, month: nextMonth })}
          onToday={() =>
            setMonth({
              year: Number(todayDate.slice(0, 4)),
              month: Number(todayDate.slice(5, 7)),
            })
          }
          onNewEvent={() => setComposer(defaultsForDate(todayDate))}
          canCreateEvent={calendars.length > 0}
        />

        {rangeQuery.data?.truncated ? (
          // Never a silent short month: the cap exists, so it says so.
          <p
            className="rounded-md border border-dashed p-2 text-sm text-muted-foreground"
            role="status"
          >
            {t("truncated")}
          </p>
        ) : null}

        {calendarsQuery.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : calendars.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("noCalendars")}
          </p>
        ) : (
          <MonthGrid
            // Remounting on a month change re-seeds the roving tab stop to the 1st,
            // which is where a keyboard user expects to land after paging.
            key={`${year}-${month}`}
            year={year}
            month={month}
            weekStart={weekStart}
            timeZone={timeZone}
            events={events}
            onOpenDay={setOpenDay}
            onOpenEvent={setEditingId}
          />
        )}
      </div>

      <Dialog open={openDay !== null} onOpenChange={(open) => !open && setOpenDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openDay
                ? format.dateTime(new Date(`${openDay}T12:00:00Z`), {
                    dateStyle: "full",
                    timeZone: "UTC",
                  })
                : ""}
            </DialogTitle>
            <DialogDescription>{t("dayDescription")}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {dayEvents.map((event) => (
              <li key={event.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setOpenDay(null);
                    setEditingId(event.id);
                  }}
                >
                  {event.title}
                </Button>
              </li>
            ))}
            {dayEvents.length === 0 ? (
              <li className="text-sm text-muted-foreground">{t("dayEmpty")}</li>
            ) : null}
          </ul>
          <Button
            type="button"
            onClick={() => {
              const date = openDay;
              setOpenDay(null);
              if (date) setComposer(defaultsForDate(date));
            }}
            disabled={calendars.length === 0}
          >
            {t("addOnThisDay")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={composer !== null || editingId !== null}
        onOpenChange={(open) => {
          if (open) return;
          setComposer(null);
          setEditingId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("composerDescription")}</DialogDescription>
          </DialogHeader>
          {activeDefaults ? (
            <EventComposer
              key={editingId ?? "new"}
              defaults={activeDefaults}
              calendars={calendars}
              onDone={() => {
                setComposer(null);
                setEditingId(null);
                refetchAll();
              }}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
