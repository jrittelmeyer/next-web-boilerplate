"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteCalendar } from "@/server/actions/calendar";
import { CalendarForm } from "./calendar-form";
import type { CalendarSummary } from "./types";

/**
 * The calendar rail: which calendars exist, which are currently drawn, and the
 * entry points for creating and editing them.
 *
 * Visibility is client-only state owned by the workspace — it changes which
 * calendars the range query asks for, never what the server considers visible.
 */
export function CalendarList({
  calendars,
  selectedIds,
  onToggle,
  defaultTimeZone,
  onChanged,
}: {
  calendars: readonly CalendarSummary[];
  selectedIds: ReadonlySet<string>;
  onToggle: (calendarId: string) => void;
  defaultTimeZone: string;
  onChanged: () => void;
}) {
  const t = useTranslations("Calendar.list");
  const [editing, setEditing] = useState<CalendarSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onDelete(calendar: CalendarSummary) {
    setDeletingId(calendar.id);
    const result = await deleteCalendar({ id: calendar.id });
    setDeletingId(null);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("deleted", { name: calendar.name }));
    onChanged();
  }

  return (
    <section aria-labelledby="calendar-list-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="calendar-list-heading" className="text-sm font-medium">
          {t("heading")}
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
          {t("new")}
        </Button>
      </div>

      {calendars.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {calendars.map((calendar) => (
            <li key={calendar.id} className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selectedIds.has(calendar.id)}
                  onChange={() => onToggle(calendar.id)}
                />
                <span
                  aria-hidden="true"
                  className="inline-block size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--${calendar.color})` }}
                />
                <span className="truncate">{calendar.name}</span>
                {calendar.isPrimary ? (
                  <span className="text-xs text-muted-foreground">{t("primary")}</span>
                ) : null}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(calendar)}
                aria-label={t("editNamed", { name: calendar.name })}
              >
                {t("edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deletingId === calendar.id}
                onClick={() => onDelete(calendar)}
                aria-label={t("deleteNamed", { name: calendar.name })}
              >
                {t("delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <CalendarForm
            defaultTimeZone={defaultTimeZone}
            onDone={() => {
              setCreating(false);
              onChanged();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <CalendarForm
              calendar={editing}
              defaultTimeZone={defaultTimeZone}
              onDone={() => {
                setEditing(null);
                onChanged();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
