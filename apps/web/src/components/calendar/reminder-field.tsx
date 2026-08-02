"use client";

import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { MAX_REMINDERS_PER_EVENT, type ReminderValues } from "@repo/validators/calendar";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * The composer's reminder list: two selects and a row of removable entries.
 *
 * **Presets only, no free-form minutes box.** The column is a signed integer and would
 * happily take 7, but a picker that offers "7 minutes before" invites the reader to expect
 * a precision the sweeper does not have — delivery is ±5–6 minutes because the cron is
 * every five. Every preset here is a multiple of five for that reason, and the help text
 * says so rather than leaving it to be discovered.
 *
 * **Only "before" offsets are offered**, and only the `start` anchor exists in Phase 5 (the
 * column CHECK refuses `end`). A positive offset is representable and no surface produces
 * one, which is the same rule that keeps `chair` out of the attendee roles.
 */

/** Minutes before start. Every value is a multiple of 5 — see the note above. */
const PRESET_MINUTES = [5, 10, 15, 30, 60, 120, 1440, 2880, 10080] as const;

export function ReminderField({
  value,
  onChange,
}: {
  value: readonly ReminderValues[] | undefined;
  onChange: (next: ReminderValues[]) => void;
}) {
  const t = useTranslations("Calendar.reminders");
  const [channel, setChannel] = useState<"email" | "in-app">("in-app");
  const [minutes, setMinutes] = useState<string>("15");

  const reminders = value ?? [];
  const full = reminders.length >= MAX_REMINDERS_PER_EVENT;

  /** Mirrors `reminderKey` in lib/calendar-reminders.ts — and the DB's unique. */
  const keyOf = (reminder: ReminderValues) =>
    `${reminder.channel}|${reminder.anchor ?? "start"}|${reminder.offsetMinutes}`;

  function add() {
    if (full) return;
    // Negative: the column is signed and "before" is the only direction Phase 5 offers.
    const next: ReminderValues = { channel, anchor: "start", offsetMinutes: -Number(minutes) };
    // De-duplicated here as an affordance, not as the guard —
    // `calendar_event_reminders_rule_key` is the guard, and reaching it would surface as a
    // generic write error for a form the user could hit by clicking Add twice.
    if (reminders.some((reminder) => keyOf(reminder) === keyOf(next))) return;
    onChange([...reminders, next]);
  }

  function remove(target: ReminderValues) {
    onChange(reminders.filter((reminder) => keyOf(reminder) !== keyOf(target)));
  }

  function labelFor(reminder: ReminderValues) {
    const before = Math.abs(reminder.offsetMinutes);
    const channelLabel = reminder.channel === "email" ? t("channelEmail") : t("channelInApp");
    return `${t("beforeStart", { time: humanize(before, t) })} · ${channelLabel}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Select onValueChange={setMinutes} value={minutes}>
          <SelectTrigger className="w-[180px]" data-testid="event-reminder-offset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESET_MINUTES.map((preset) => (
              <SelectItem key={preset} value={String(preset)}>
                {t("beforeStart", { time: humanize(preset, t) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={(next) => setChannel(next as "email" | "in-app")} value={channel}>
          <SelectTrigger className="w-[140px]" data-testid="event-reminder-channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in-app">{t("channelInApp")}</SelectItem>
            <SelectItem value="email">{t("channelEmail")}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={full}
          data-testid="event-reminder-add"
        >
          {t("add")}
        </Button>
      </div>

      {reminders.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="event-reminder-list">
          {reminders.map((reminder) => (
            <li
              key={keyOf(reminder)}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>{labelFor(reminder)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(reminder)}
                aria-label={t("remove", { reminder: labelFor(reminder) })}
              >
                {t("removeShort")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Minutes → a readable duration, through next-intl rather than a hand-rolled pluraliser.
 *
 * The presets are chosen so this only ever has to say minutes, hours, days or weeks — a
 * general duration formatter would be more code and more translation surface for values no
 * surface can produce.
 */
function humanize(minutes: number, t: (key: string, values?: Record<string, number>) => string) {
  if (minutes % 10080 === 0) return t("weeks", { count: minutes / 10080 });
  if (minutes % 1440 === 0) return t("days", { count: minutes / 1440 });
  if (minutes % 60 === 0) return t("hours", { count: minutes / 60 });
  return t("minutes", { count: minutes });
}
