"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
  type CreateCalendarValues,
  createCalendarSchema,
} from "@repo/validators/calendar";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { applyFieldErrors } from "@/lib/forms";
import { createCalendar, updateCalendar } from "@/server/actions/calendar";
import type { CalendarSummary } from "./types";

/**
 * Create or edit a calendar. One form for both, because the fields are identical and
 * the only difference is whether an id rides along.
 *
 * The zone list is `Intl.supportedValuesOf("timeZone")` in a `<datalist>` — the
 * `PreferencesCard` precedent. It costs no bundle bytes and cannot drift from the
 * runtime that will interpret the choice. It holds only ICU's *primary* ids, so it
 * suggests `America/New_York` but still accepts a typed `US/Eastern`: the schema
 * validates the grammar and the action validates against `canonicalizeTimeZone`,
 * neither of which consults this list.
 */
export function CalendarForm({
  calendar,
  defaultTimeZone,
  onDone,
}: {
  calendar?: CalendarSummary;
  defaultTimeZone: string;
  onDone: () => void;
}) {
  const t = useTranslations("Calendar.calendarForm");
  const listId = useId();

  const form = useForm<CreateCalendarValues>({
    resolver: zodResolver(createCalendarSchema),
    defaultValues: {
      name: calendar?.name ?? "",
      description: calendar?.description ?? null,
      color: calendar?.color ?? "chart-1",
      timeZone: calendar?.timeZone ?? defaultTimeZone,
      isPrimary: calendar?.isPrimary ?? false,
    },
  });

  async function onSubmit(values: CreateCalendarValues) {
    const result = calendar
      ? await updateCalendar({ ...values, id: calendar.id })
      : await createCalendar(values);
    if ("error" in result) {
      if (result.fieldErrors) applyFieldErrors(form.setError, result.fieldErrors);
      toast.error(result.error);
      return;
    }
    toast.success(calendar ? t("updated") : t("created", { name: result.data.name }));
    onDone();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nameLabel")}</FormLabel>
              <FormControl>
                <Input {...field} />
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
                  rows={2}
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
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("colorLabel")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CALENDAR_COLORS.map((color) => (
                    <SelectItem key={color} value={color}>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="inline-block size-3 rounded-full"
                          style={{ backgroundColor: `var(--${color})` }}
                        />
                        {t(`color.${color}`)}
                      </span>
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
          name="timeZone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("timeZoneLabel")}</FormLabel>
              <FormControl>
                <Input list={listId} {...field} />
              </FormControl>
              <datalist id={listId}>
                {timeZoneOptions().map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <FormDescription>{t("timeZoneHelp")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isPrimary"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={field.value}
                  onChange={(event) => field.onChange(event.target.checked)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
                {t("primaryLabel")}
              </label>
              <FormDescription>{t("primaryHelp")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
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

function timeZoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}
