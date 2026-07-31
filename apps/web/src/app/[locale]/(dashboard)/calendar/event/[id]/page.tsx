import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { calendarEventMasters, calendars } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventDetail } from "@/components/calendar/event-detail";
import { type Locale, routing } from "@/i18n/routing";
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
 * The join to `calendars` is the authorization: ownership is `calendars.user_id`, so
 * scoping the join to the caller makes an event on someone else's calendar
 * indistinguishable from one that does not exist — which is the answer that leaks
 * least.
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
    .where(and(eq(calendarEventMasters.id, id), eq(calendars.userId, session.user.id)))
    .limit(1);
  if (!row) notFound();

  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const preferences = await resolveUserPreferences(session.user.id, activeLocale);

  return (
    <NextIntlClientProvider timeZone={preferences.timeZone}>
      <EventDetail event={row.calendar_event_masters} calendarName={row.calendars.name} />
    </NextIntlClientProvider>
  );
}
