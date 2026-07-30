"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
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
import { type UpdateUserPreferencesInput, updateUserPreferencesSchema } from "@repo/validators";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { applyFieldErrors } from "@/lib/forms";
import { updateUserPreferences } from "@/server/actions/user";

/**
 * A Radix Select item may not carry an empty string value (that is reserved for
 * clearing), so "inherit the default" needs a real sentinel on the wire between
 * the control and the nullable schema field.
 */
const INHERIT = "auto";

/**
 * The zone list comes from the runtime, so it costs zero bundle bytes and can
 * never drift from the database that will interpret the choice. It holds only
 * primary identifiers — aliases like `US/Eastern` are still *accepted* on submit
 * (the action validates against Intl, not against this list), they are just not
 * suggested.
 */
function timeZoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

export function PreferencesCard({ defaultValues }: { defaultValues: UpdateUserPreferencesInput }) {
  const t = useTranslations("Account.preferences");
  const listId = useId();
  const [zones] = useState(timeZoneOptions);
  const form = useForm<UpdateUserPreferencesInput>({
    resolver: zodResolver(updateUserPreferencesSchema),
    defaultValues,
  });

  async function onSubmit(values: UpdateUserPreferencesInput) {
    const formData = new FormData();
    formData.set("timeZone", values.timeZone ?? "");
    formData.set("weekStart", values.weekStart === null ? "" : String(values.weekStart));
    formData.set("timeFormat", values.timeFormat ?? "");

    const result = await updateUserPreferences(formData);
    if ("error" in result) {
      // Per-field messages go inline via <FormMessage/>; the form-level string
      // (Unauthorized, rate-limited) surfaces as a toast — the A7 convention.
      if (result.fieldErrors) applyFieldErrors(form.setError, result.fieldErrors);
      toast.error(result.error);
      return;
    }

    toast.success(t("saved"));
    form.reset(result.data);
  }

  // Reading the browser's zone is a CLIENT-ONLY act, and it happens in an event
  // handler rather than during render: calling it while rendering would give the
  // server one answer and the browser another, which is a hydration mismatch on
  // every page that shows a timestamp.
  function detectTimeZone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      form.setValue("timeZone", detected, { shouldDirty: true, shouldValidate: true });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="timeZone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("timeZoneLabel")}</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        list={listId}
                        placeholder={t("timeZonePlaceholder")}
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value || null)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <Button type="button" variant="outline" onClick={detectTimeZone}>
                      {t("detect")}
                    </Button>
                  </div>
                  <datalist id={listId}>
                    {zones.map((zone) => (
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
              name="weekStart"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("weekStartLabel")}</FormLabel>
                  <Select
                    value={field.value === null ? INHERIT : String(field.value)}
                    onValueChange={(value) =>
                      field.onChange(value === INHERIT ? null : Number(value))
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={INHERIT}>{t("weekStartAuto")}</SelectItem>
                      <SelectItem value="0">{t("weekStartSunday")}</SelectItem>
                      <SelectItem value="1">{t("weekStartMonday")}</SelectItem>
                      <SelectItem value="6">{t("weekStartSaturday")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timeFormat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("timeFormatLabel")}</FormLabel>
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
                      <SelectItem value={INHERIT}>{t("timeFormatAuto")}</SelectItem>
                      <SelectItem value="12h">{t("timeFormat12h")}</SelectItem>
                      <SelectItem value="24h">{t("timeFormat24h")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("saving") : t("save")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
