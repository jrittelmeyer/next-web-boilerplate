import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { calendarEventAttendees, calendarEventMasters, calendars } from "@repo/db/schema";
import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventDetail } from "@/components/calendar/event-detail";
import { type Locale, routing } from "@/i18n/routing";
import { canReadEvent, canRespondToEvent, getEventAccess } from "@/lib/calendar-acl";
import { resolveUserPreferences } from "@/lib/user-preferences";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("calendarEvent") };
}

/**
 * One event.
 *
 * Read through `calendar_event_masters` — the rule the month-view range query is the
 * documented exception to (model.md → The read surface is split). The view already
 * excludes soft-deleted rows and per-occurrence overrides, which is exactly right
 * here: from Phase 2 an override is an edit to an occurrence, not a thing with its
 * own URL, so a `notFound()` for one is the correct answer rather than an oversight.
 *
 * **From Phase 3 the join is no longer the authorization.** It used to scope to
 * `calendars.user_id = me`, which was exactly right while the only person who could see
 * an event was the person whose calendar it sat on — and exactly wrong the moment
 * attendees existed, because an invitee is not the calendar's owner and would have been
 * handed a `notFound()` on the very event they were invited to. `getEventAccess` answers
 * instead, and it composes the calendar role with the attendee row **internally**, so
 * this route cannot get the `||` wrong. A refusal is still `notFound()`, so
 * "someone else's" and "does not exist" stay indistinguishable.
 */
export default async function CalendarEventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // `calendar_events.id` is a uuid column, so a hand-typed `/calendar/event/nope`
  // would reach Postgres as `id = 'nope'` and throw `invalid input syntax for type
  // uuid` — a 500 whose error body carries the query text. This is a URL a human can
  // paste, so it degrades to a 404 (the A25 validation-boundary convention).
  if (!UUID_PATTERN.test(id)) notFound();

  const [row] = await db
    .select()
    .from(calendarEventMasters)
    .innerJoin(calendars, eq(calendars.id, calendarEventMasters.calendarId))
    .where(eq(calendarEventMasters.id, id))
    .limit(1);
  if (!row) notFound();

  // The loaded row is handed over rather than re-read. The view has already applied the
  // two filters that are part of the answer — no override, not soft-deleted — so what is
  // left for `getEventAccess` to decide is the caller's relationship to it.
  const access = await getEventAccess(id, session.user.id, {
    id: row.calendar_event_masters.id,
    calendarId: row.calendar_event_masters.calendarId,
    recurrenceParentId: row.calendar_event_masters.recurrenceParentId,
    deletedAt: row.calendar_event_masters.deletedAt,
  });
  if (!canReadEvent(access)) notFound();

  // The guest list every reader gets (decision 7), addresses only (decision 11). Read off
  // the master, which for this route is the row itself — the view has already excluded
  // overrides, and attendees hang off the series in any case.
  const attendees = await db
    .select({
      email: calendarEventAttendees.email,
      role: calendarEventAttendees.role,
      status: calendarEventAttendees.status,
      comment: calendarEventAttendees.comment,
    })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, row.calendar_event_masters.id))
    .orderBy(asc(calendarEventAttendees.email));

  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const preferences = await resolveUserPreferences(session.user.id, activeLocale);

  return (
    <NextIntlClientProvider timeZone={preferences.timeZone}>
      <EventDetail
        event={row.calendar_event_masters}
        calendarName={row.calendars.name}
        attendees={attendees}
        // The RSVP control belongs to people who hold a row, not to people who can write
        // the calendar: an organizer who never added themselves as a guest has nothing to
        // answer. `access` carries their own stored response, so this route never has to
        // work out which of the rows above is the caller.
        myResponse={canRespondToEvent(access) ? access.response : null}
      />
    </NextIntlClientProvider>
  );
}
