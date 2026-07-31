"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setRecurrenceDate } from "@/server/actions/calendar";

/** The storage form, `"YYYY-MM-DD HH:MM:SS"`, from a `datetime-local` value. */
const fromDateTimeLocal = (value: string) =>
  value.length === 16 ? `${value.replace("T", " ")}:00` : value.replace("T", " ");

/** …and back, for the control. */
const toDateTimeLocal = (wall: string) => wall.slice(0, 16).replace(" ", "T");

/**
 * Skip a date, or add one, without editing the series.
 *
 * The date is a **civil reading in the series' own zone** — the same space as
 * `recurrence_id` — which is why the control is seeded from the master's `start_wall`
 * and keeps its clock: an `EXDATE` only skips something if it names an occurrence
 * exactly, and an `RDATE` carries no duration of its own, so the added occurrence takes
 * the master's nominal span.
 *
 * Both writes go through one action and one `ON CONFLICT DO NOTHING`, which is what makes
 * pressing the button twice — or two people pressing it at once — idempotent rather than
 * a race. That is the reason these are rows and not a jsonb array.
 */
export function RecurrenceDatesField({
  eventId,
  startWall,
  startTzid,
}: {
  eventId: string;
  startWall: string;
  startTzid: string;
}) {
  const t = useTranslations("Calendar.recurrenceDates");
  const router = useRouter();
  const [dateWall, setDateWall] = useState(startWall);
  const [pending, setPending] = useState(false);

  async function submit(kind: "exdate" | "rdate") {
    setPending(true);
    const result = await setRecurrenceDate({ eventId, kind, dateWall });
    setPending(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t(kind === "exdate" ? "skipped" : "added"));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor="recurrence-date">
        {t("label")}
      </label>
      <Input
        id="recurrence-date"
        type="datetime-local"
        data-testid="recurrence-date"
        value={toDateTimeLocal(dateWall)}
        onChange={(event) => setDateWall(fromDateTimeLocal(event.target.value))}
      />
      <p className="text-sm text-muted-foreground">{t("help", { zone: startTzid })}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          data-testid="recurrence-skip"
          onClick={() => submit("exdate")}
        >
          {t("skip")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          data-testid="recurrence-add"
          onClick={() => submit("rdate")}
        >
          {t("add")}
        </Button>
      </div>
    </div>
  );
}
