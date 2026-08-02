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
  type AttendeeValues,
  CALENDAR_COLORS,
  type CreateEventValues,
  createEventSchema,
  type EditScope,
  EVENT_STATUSES,
  EVENT_TRANSPARENCIES,
  EVENT_VISIBILITIES,
  type ReminderValues,
} from "@repo/validators/calendar";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { allDayWallRange, inclusiveEndDate } from "@/lib/calendar/grid";
import { applyFieldErrors } from "@/lib/forms";
import { createEvent, deleteEvent, updateEvent } from "@/server/actions/calendar";
import { AttendeeField } from "./attendee-field";
import { EditScopeDialog } from "./edit-scope-dialog";
import { RecurrenceField } from "./recurrence-field";
import { ReminderField } from "./reminder-field";
import type { CalendarSummary } from "./types";

/** The storage form, `"YYYY-MM-DD HH:MM:SS"`, from a `datetime-local` value. */
const fromDateTimeLocal = (value: string) =>
  value.length === 16 ? `${value.replace("T", " ")}:00` : value.replace("T", " ");

/** …and back, for the control. */
const toDateTimeLocal = (wall: string) => wall.slice(0, 16).replace(" ", "T");

const INHERIT = "inherit";

export interface EventComposerDefaults {
  /** **Always a series master's id**, never an override's — the identity contract. */
  readonly id?: string;
  /**
   * Set when the editor was opened on one occurrence of a series. Its presence is what
   * turns Save and Delete into scoped writes, and what makes the scope dialog appear.
   */
  readonly recurrenceId?: string | null;
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
  /**
   * The **series master's** guest list, and it must be seeded on an edit.
   *
   * The composer posts the whole list on every save and the action diffs it by address,
   * so opening an existing event with this empty and pressing Save would read as
   * "remove everyone" — cancelling the meeting for every guest on a title change.
   */
  readonly attendees?: readonly AttendeeValues[];
  /**
   * The viewer's OWN reminders on this event, seeded for exactly the reason `attendees`
   * above is: the composer posts the whole list on every save and the action diffs it, so
   * opening an existing event with this empty and pressing Save would delete every reminder
   * the user had set — and with them the delivery ledger that stops a re-send.
   */
  readonly reminders?: readonly ReminderValues[];
  /**
   * The **series master's** rule — `null` for a one-off.
   *
   * Deliberately the master's even when the editor is showing an override, whose own
   * `rrule` is NULL by constraint (`calendar_events_override_not_recurring`): seeding
   * this field from the override row would submit "no rule" for a `thisAndFollowing`
   * edit, which the action refuses.
   */
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
      attendees: [...(defaults.attendees ?? [])],
      reminders: [...(defaults.reminders ?? [])],
      rrule: defaults.rrule ?? null,
    },
  });

  const values = form.watch();
  const hint = disambiguationHint(values);
  const recurrenceId = defaults.recurrenceId ?? null;

  // Which write is waiting on a scope. `null` means no dialog is open.
  const [pending, setPending] = useState<{
    intent: "edit" | "delete";
    values: CreateEventValues | null;
  } | null>(null);

  /**
   * Whether `scope: "all"` would drop the series' overrides and skipped dates.
   *
   * The same four inputs the action compares: change any of them and every stored
   * `recurrence_id` names an occurrence that no longer exists. Computed here so the
   * warning is shown *before* the write rather than explained after it.
   */
  const movesTheSeries =
    (values.rrule ?? null) !== (defaults.rrule ?? null) ||
    String(values.startWall) !== defaults.startWall ||
    String(values.startTzid) !== defaults.startTzid ||
    String(values.endTzid) !== defaults.endTzid;

  async function save(submitted: CreateEventValues, scope: EditScope | null) {
    const result = defaults.id
      ? await updateEvent({
          ...submitted,
          // An override may not carry a rule of its own — the schema refines it and
          // `calendar_events_override_not_recurring` enforces it.
          rrule: scope === "this" ? null : submitted.rrule,
          id: defaults.id,
          // `scope` and `recurrenceId` are both-or-neither by schema.
          scope,
          recurrenceId: scope === null ? null : recurrenceId,
        })
      : await createEvent(submitted);
    if ("error" in result) {
      if (result.fieldErrors) applyFieldErrors(form.setError, result.fieldErrors);
      toast.error(result.error);
      return;
    }
    toast.success(defaults.id ? t("updated") : t("created"));
    onDone();
  }

  async function remove(scope: EditScope | null) {
    if (!defaults.id) return;
    const result = await deleteEvent({
      id: defaults.id,
      scope,
      recurrenceId: scope === null ? null : recurrenceId,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("deleted"));
    onDone();
  }

  async function onSubmit(submitted: CreateEventValues) {
    // An occurrence cannot be written without saying which occurrences it applies to,
    // so the dialog comes first and the values wait for it.
    if (defaults.id && recurrenceId !== null) {
      setPending({ intent: "edit", values: submitted });
      return;
    }
    await save(submitted, null);
  }

  function onDelete() {
    if (recurrenceId !== null) {
      setPending({ intent: "delete", values: null });
      return;
    }
    void remove(null);
  }

  async function onScopeChosen(scope: EditScope) {
    const chosen = pending;
    setPending(null);
    if (!chosen) return;
    if (chosen.intent === "delete") return await remove(scope);
    if (chosen.values) await save(chosen.values, scope);
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
          name="rrule"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("repeatLabel")}</FormLabel>
              <RecurrenceField
                value={field.value ?? null}
                // Presets follow the start the user is actually looking at, so
                // "monthly" means the 14th when the event starts on the 14th.
                startWall={String(values.startWall)}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />

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

        <FormField
          control={form.control}
          name="attendees"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("attendeesLabel")}</FormLabel>
              <AttendeeField value={field.value} onChange={field.onChange} />
              {/* Only `scope: "all"` (and a plain non-recurring save) applies this list.
                  A single-occurrence edit inherits the series' guests rather than
                  carrying its own, and a "this and following" split copies the source's
                  list verbatim — see docs/context/calendar/attendees.md. */}
              <FormDescription>{t("attendeesHelp")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reminders"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("remindersLabel")}</FormLabel>
              <ReminderField value={field.value} onChange={field.onChange} />
              {/* Private to the viewer, and attached to the SERIES — an occurrence edit
                  adjusts the whole series' reminders rather than creating a second set
                  nothing would reconcile. See docs/context/calendar/reminders.md. */}
              <FormDescription>{t("remindersHelp")}</FormDescription>
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
          {defaults.id ? (
            <Button
              type="button"
              variant="destructive"
              className="ml-auto"
              data-testid="event-delete"
              onClick={onDelete}
            >
              {t("delete")}
            </Button>
          ) : null}
        </div>
      </form>

      {pending ? (
        <EditScopeDialog
          intent={pending.intent}
          // Deleting never drops anything the user did not ask to lose, so the warning
          // belongs to the edit path only.
          warnOnAll={pending.intent === "edit" && movesTheSeries}
          onCancel={() => setPending(null)}
          onConfirm={(scope) => void onScopeChosen(scope)}
        />
      ) : null}
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
