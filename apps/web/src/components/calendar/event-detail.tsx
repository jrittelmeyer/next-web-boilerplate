"use client";

import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { deleteEvent } from "@/server/actions/calendar";

/**
 * The single-event page body.
 *
 * Both times are rendered twice on purpose: once in the viewer's zone (what "when is
 * this for me" means) and once as the stored civil reading with its zone id (what the
 * organiser actually meant). For a same-zone event the two agree and the second line
 * is quiet redundancy; for a flight, a remote meeting or anything crossing a DST
 * boundary it is the only way to see that the event is at 09:00 *there*.
 */
export function EventDetail({
  event,
  calendarName,
}: {
  event: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    url: string | null;
    status: string;
    visibility: string;
    transparency: string;
    allDay: boolean;
    startAt: Date;
    endAt: Date;
    startWall: string;
    startTzid: string;
    endWall: string;
    endTzid: string;
  };
  calendarName: string;
}) {
  const t = useTranslations("Calendar.detail");
  const format = useFormatter();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    const result = await deleteEvent({ id: event.id });
    setDeleting(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("deleted"));
    router.push("/calendar");
  }

  // All-day rows carry no clock, and their stored end is EXCLUSIVE, so rendering
  // `endAt` for one would name the following midnight. The date line is enough.
  const when = event.allDay
    ? format.dateTime(event.startAt, "dateOnly")
    : `${format.dateTime(event.startAt, "short")} – ${format.dateTime(event.endAt, "timeOnly")}`;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
        <p className="text-muted-foreground">{calendarName}</p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <dt className="text-sm font-medium">{t("when")}</dt>
        <dd className="text-sm">
          {when}
          <span className="block text-muted-foreground">
            {t("asEntered", {
              start: event.startWall,
              startZone: event.startTzid,
              end: event.endWall,
              endZone: event.endTzid,
            })}
          </span>
        </dd>

        {event.location ? (
          <>
            <dt className="text-sm font-medium">{t("location")}</dt>
            <dd className="text-sm">{event.location}</dd>
          </>
        ) : null}

        {event.url ? (
          <>
            <dt className="text-sm font-medium">{t("url")}</dt>
            <dd className="text-sm">
              <a className="underline" href={event.url} rel="noreferrer noopener" target="_blank">
                {event.url}
              </a>
            </dd>
          </>
        ) : null}

        <dt className="text-sm font-medium">{t("status")}</dt>
        <dd className="text-sm">{t(`statusValue.${event.status}`)}</dd>

        <dt className="text-sm font-medium">{t("visibility")}</dt>
        <dd className="text-sm">{t(`visibilityValue.${event.visibility}`)}</dd>

        <dt className="text-sm font-medium">{t("transparency")}</dt>
        <dd className="text-sm">{t(`transparencyValue.${event.transparency}`)}</dd>
      </dl>

      {event.description ? (
        <p className="whitespace-pre-wrap text-sm">{event.description}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
          {deleting ? t("deleting") : t("delete")}
        </Button>
      </div>
    </article>
  );
}
