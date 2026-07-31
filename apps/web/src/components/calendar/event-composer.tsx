"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { deriveEventInstants } from "@repo/calendar";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import {
  CALENDAR_COLORS,
  type CreateEventValues,
  createEventSchema,
  EVENT_STATUSES,
  EVENT_TRANSPARENCIES,
  EVENT_VISIBILITIES,
} from "@repo/validators/calendar";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { allDayWallRange, inclusiveEndDate } from "@/lib/calendar/grid";
import { applyFieldErrors } from "@/lib/forms";
import { createEvent, updateEvent } from "@/server/actions/calendar";
import type { CalendarSummary } from "./types";

/** The storage form, `"YYYY-MM-DD HH:MM:SS"`, from a `datetime-local` value. */
const fromDateTimeLocal = (value: string) =>
  value.length === 16 ? `${value.replace("T", " ")}:00` : value.replace("T", " ");

/** …and back, for the control. */
const toDateTimeLocal = (wall: string) => wall.slice(0, 16).replace(" ", "T");

const INHERIT = "inherit";

export interface EventComposerDefaults {
  readonly id?: string;
  readonly calendarId: string;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly url: string | null;
  readonly color: string | null;
  readonly status: string;
  readonly visibility: string;
  readonly transparency: string;
  readonly allDay: boolean;
  readonly startWall: string;
  readonly startTzid: string;
  readonly endWall: string;
  readonly endTzid: string;
  /** `null` = a one-off. The recurrence builder lands on this in the next step. */
  readonly rrule?: string | null;
}

/**
 * Create or edit an event.
 *
 * Two things here are more than form plumbing:
 *
 * **The all-day toggle converts, it does not just flip a boolean.** All-day rows are
 * stored on midnight with an *exclusive* end (RFC 5545), so switching modes runs the
 * values through `allDayWallRange` / `inclusiveEndDate` in `lib/calendar/grid.ts` —
 * the single owner of that convention. A composer that only set `allDay = true`
 * would produce a row `calendar_events_all_day_midnight` rejects, and the user would
 * see a constraint violation for pressing a checkbox.
 *
 * **The disambiguation hint is why `deriveEventInstants` returns `*Kind`.** Running
 * the real resolver — the same pure function the action will run — tells the user
 * *before* they save that 02:30 does not exist on that date and that we will use
 * 03:30, or that 01:30 happens twice and we take the first. `@repo/calendar` has no
 * I/O and no dependencies, so importing it into a client component costs a few
 * hundred bytes and buys an answer that cannot disagree with the server's.
 */
export function EventComposer({
  defaults,
  calendars,
  onDone,
}: {
  defaults: EventComposerDefaults;
  calendars: readonly CalendarSummary[];
  onDone: () => void;
}) {
  const t = useTranslations("Calendar.composer");

  const form = useForm<CreateEventValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      calendarId: defaults.calendarId,
      title: defaults.title,
      description: defaults.description,
      location: defaults.location,
      url: defaults.url,
      color: (defaults.color as CreateEventValues["color"]) ?? null,
      status: defaults.status as CreateEventValues["status"],
      visibility: defaults.visibility as CreateEventValues["visibility"],
      transparency: defaults.transparency as CreateEventValues["transparency"],
      allDay: defaults.allDay,
      startWall: defaults.startWall,
      startTzid: defaults.startTzid,
      endWall: defaults.endWall,
      endTzid: defaults.endTzid,
      rrule: defaults.rrule ?? null,
    },
  });

  const values = form.watch();
  const hint = disambiguationHint(values);

  async function onSubmit(submitted: CreateEventValues) {
    const result = defaults.id
      ? // No scope yet: every event this composer can reach is still a one-off, and
        // `scope` and `recurrenceId` are both-or-neither by schema.
        await updateEvent({ ...submitted, id: defaults.id, scope: null, recurrenceId: null })
      : await createEvent(submitted);
    if ("error" in result) {
      if (result.fieldErrors) applyFieldErrors(form.setError, result.fieldErrors);
      toast.error(result.error);
      return;
    }
    toast.success(defaults.id ? t("updated") : t("created"));
    onDone();
  }

  function setAllDay(next: boolean) {
    const startDate = String(form.getValues("startWall")).slice(0, 10);
    const endDate = String(form.getValues("endWall")).slice(0, 10);
    if (next) {
      // Interpret the current end as the day the user can see, then store the
      // exclusive form. Without this the row fails the midnight constraint.
      const range = allDayWallRange(startDate, endDate);
      form.setValue("startWall", range.startWall);
      form.setValue("endWall", range.endWall);
    } else {
      // Coming back out, the visible last day becomes a same-day 09:00–10:00 slot:
      // an all-day range has no clock to restore, and inventing midnight-to-midnight
      // would make an ordinary event that silently blocks the whole day.
      form.setValue("startWall", `${startDate} 09:00:00`);
      form.setValue("endWall", `${startDate} 10:00:00`);
    }
    form.setValue("allDay", next, { shouldValidate: true });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("titleLabel")}</FormLabel>
              <FormControl>
                <Input {...field} data-testid="event-title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="calendarId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("calendarLabel")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {calendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="allDay"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  data-testid="event-all-day"
                  checked={field.value}
                  onChange={(event) => setAllDay(event.target.checked)}
                />
                {t("allDayLabel")}
              </label>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startWall"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("startLabel")}</FormLabel>
                <FormControl>
                  {values.allDay ? (
                    <Input
                      type="date"
                      data-testid="event-start"
                      value={String(field.value).slice(0, 10)}
                      onChange={(event) => field.onChange(`${event.target.value} 00:00:00`)}
                    />
                  ) : (
                    <Input
                      type="datetime-local"
                      data-testid="event-start"
                      value={toDateTimeLocal(String(field.value))}
                      onChange={(event) => field.onChange(fromDateTimeLocal(event.target.value))}
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endWall"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("endLabel")}</FormLabel>
                <FormControl>
                  {values.allDay ? (
                    <Input
                      type="date"
                      data-testid="event-end"
                      // The control shows the INCLUSIVE last day; storage keeps the
                      // exclusive one. Both directions go through grid.ts.
                      value={inclusiveEndDate(String(values.startWall), String(field.value))}
                      onChange={(event) =>
                        field.onChange(
                          allDayWallRange(String(values.startWall).slice(0, 10), event.target.value)
                            .endWall,
                        )
                      }
                    />
                  ) : (
                    <Input
                      type="datetime-local"
                      data-testid="event-end"
                      value={toDateTimeLocal(String(field.value))}
                      onChange={(event) => field.onChange(fromDateTimeLocal(event.target.value))}
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startTzid"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("startZoneLabel")}</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="event-start-tzid" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endTzid"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("endZoneLabel")}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>{t("zoneHelp")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {hint ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t(hint.key, { time: hint.time })}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("locationLabel")}</FormLabel>
              <FormControl>
                <Input
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("descriptionLabel")}</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("colorLabel")}</FormLabel>
                <Select
                  value={field.value ?? INHERIT}
                  onValueChange={(value) => field.onChange(value === INHERIT ? null : value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={INHERIT}>{t("colorInherit")}</SelectItem>
                    {CALENDAR_COLORS.map((color) => (
                      <SelectItem key={color} value={color}>
                        {t(`color.${color}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("statusLabel")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EVENT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`status.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("visibilityLabel")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EVENT_VISIBILITIES.map((visibility) => (
                      <SelectItem key={visibility} value={visibility}>
                        {t(`visibility.${visibility}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="transparency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("transparencyLabel")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EVENT_TRANSPARENCIES.map((transparency) => (
                      <SelectItem key={transparency} value={transparency}>
                        {t(`transparency.${transparency}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("urlLabel")}</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value || null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting} data-testid="event-save">
            {form.formState.isSubmitting ? t("saving") : t("save")}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * Runs the real resolver over the current values and reports a gap or an overlap.
 *
 * `deriveEventInstants` throws on a half-typed date or an unknown zone, which is the
 * normal state of a form being filled in — so a throw means "nothing to say yet",
 * not an error. The action re-runs the same function and is the authority.
 */
function disambiguationHint(
  values: CreateEventValues,
): { key: "hintGap" | "hintOverlap"; time: string } | null {
  try {
    const derived = deriveEventInstants({
      startWall: String(values.startWall),
      startTzid: String(values.startTzid),
      endWall: String(values.endWall),
      endTzid: String(values.endTzid),
    });
    if (derived.startKind === "gap") {
      return { key: "hintGap", time: String(values.startWall).slice(11, 16) };
    }
    if (derived.startKind === "overlap") {
      return { key: "hintOverlap", time: String(values.startWall).slice(11, 16) };
    }
    return null;
  } catch {
    return null;
  }
}
