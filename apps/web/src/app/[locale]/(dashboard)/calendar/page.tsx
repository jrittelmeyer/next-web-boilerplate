import { auth } from "@repo/auth";
import { instantToCivil } from "@repo/calendar";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { type Locale, routing } from "@/i18n/routing";
import { resolveUserPreferences } from "@/lib/user-preferences";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("calendar") };
}

/**
 * The month view, inside the protected `(dashboard)` shell.
 *
 * Nothing calendar-related may live on a public path: `proxy.ts` gates
 * `PROTECTED_PREFIXES` with `startsWith`, and `/calendar` is one — which is exactly
 * why `EVENT_VISIBILITIES` has no `"public"` member and why Phase 6's RSVP page will
 * live at `/rsvp/[token]` instead.
 */
export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const preferences = await resolveUserPreferences(session.user.id, activeLocale);

  // "Today" is a fact about the user's zone, not the server's, and it is computed
  // here rather than in the client so the first paint already knows which month to
  // open. `instantToCivil` is the same conversion the grid uses, so the page and the
  // grid can never disagree about which day it is.
  const now = instantToCivil(Date.now(), preferences.timeZone);
  const todayDate = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;

  // The SCOPED timeZone override (the Phase-0 pattern from account/page.tsx): a
  // per-request zone in i18n/request.ts would make every next-intl route dynamic and
  // kill the static prerender of the marketing pages. Nested here it inherits
  // messages and formats and overrides only the zone, so every time this subtree
  // formats renders in the user's zone on both the SSR and hydration passes.
  return (
    <NextIntlClientProvider timeZone={preferences.timeZone}>
      <CalendarWorkspace
        timeZone={preferences.timeZone}
        weekStart={preferences.weekStart}
        initialYear={now.year}
        initialMonth={now.month}
        todayDate={todayDate}
      />
    </NextIntlClientProvider>
  );
}
