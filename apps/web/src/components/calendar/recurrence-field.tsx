"use client";

import { dayOfWeek, formatRRule, parseLocalDateTime, type Weekday } from "@repo/calendar";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useTranslations } from "next-intl";
import { RecurrenceSummary } from "./recurrence-summary";

/**
 * The repeat builder: five presets derived from the event's own start, plus an escape
 * hatch for a rule typed by hand.
 *
 * The presets are **serialised by the engine** (`formatRRule`) rather than assembled as
 * text here. That is what keeps "weekly on the day this event starts" honest across the
 * ordinal and weekday-code details the RFC has, and it means the string the form holds is
 * byte-identical to the one the action will store after canonicalising — so reopening the
 * editor selects the preset the user chose instead of dropping to Custom.
 *
 * There is no separate "advanced" builder for `BYSETPOS`, ordinal `BYDAY` and friends.
 * The grammar is wide, the UI for it is a project of its own, and Custom + a live summary
 * lets a user reach every supported rule today while the summary tells them — in their
 * own language — whether they got it right.
 */

type PresetKey = "never" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

const PRESET_KEYS: readonly PresetKey[] = [
  "never",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "custom",
];

/** Defaults `parseRRule` would materialise anyway, so `formatRRule` omits them. */
const BASE = {
  interval: 1,
  count: null,
  until: null,
  wkst: 1,
  byMonth: [],
  byMonthDay: [],
  byDay: [],
  bySetPos: [],
} as const;

/**
 * `dayOfWeek` returns a plain `number` while `RecurrenceByDay.weekday` is `0 | … | 6`.
 * The table is the narrowing, not a lookup table of weekday *names* — those must come
 * from `format.dateTime`, and do, in `RecurrenceSummary`.
 */
const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

function presetRules(startWall: string): Partial<Record<PresetKey, string>> {
  let civil: ReturnType<typeof parseLocalDateTime>;
  try {
    civil = parseLocalDateTime(startWall);
  } catch {
    // A half-typed date is the normal state of a form being filled in. Daily is the one
    // preset that does not depend on the start, so it is the one that survives.
    return { daily: formatRRule({ ...BASE, freq: "DAILY" }) };
  }
  const weekday = WEEKDAYS[dayOfWeek(civil)] ?? 1;
  return {
    daily: formatRRule({ ...BASE, freq: "DAILY" }),
    weekly: formatRRule({ ...BASE, freq: "WEEKLY", byDay: [{ ordinal: null, weekday }] }),
    monthly: formatRRule({ ...BASE, freq: "MONTHLY", byMonthDay: [civil.day] }),
    yearly: formatRRule({
      ...BASE,
      freq: "YEARLY",
      byMonth: [civil.month],
      byMonthDay: [civil.day],
    }),
  };
}

export function RecurrenceField({
  value,
  startWall,
  onChange,
  disabled,
}: {
  value: string | null;
  /** The event's start, in storage form — what the presets are derived from. */
  startWall: string;
  onChange: (rrule: string | null) => void;
  /** True while editing a single occurrence: an override may not carry a rule. */
  disabled?: boolean;
}) {
  const t = useTranslations("Calendar.recurrence");
  const presets = presetRules(startWall);

  const selected: PresetKey =
    value === null
      ? "never"
      : (PRESET_KEYS.find((key) => presets[key] !== undefined && presets[key] === value) ??
        "custom");

  function choose(next: PresetKey) {
    if (next === "never") return onChange(null);
    // Custom starts from whatever is already selected, so switching to it never blanks a
    // rule the user just built.
    if (next === "custom") return onChange(value ?? presets.daily ?? null);
    onChange(presets[next] ?? null);
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={selected} onValueChange={(next) => choose(next as PresetKey)}>
        <SelectTrigger data-testid="event-repeat">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_KEYS.filter((key) => key === "never" || key === "custom" || presets[key]).map(
            (key) => (
              <SelectItem key={key} value={key}>
                {t(`preset.${key}`)}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>

      {selected === "custom" ? (
        <Input
          aria-label={t("customLabel")}
          data-testid="event-repeat-custom"
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || null)}
        />
      ) : null}

      <p className="text-sm text-muted-foreground">
        <RecurrenceSummary rrule={value} />
      </p>
    </div>
  );
}
