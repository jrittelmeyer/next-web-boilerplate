import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InvitesList } from "@/components/calendar/invites-list";
import { type Locale, routing } from "@/i18n/routing";
import { resolveUserPreferences } from "@/lib/user-preferences";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("calendarInvites") };
}

/**
 * The invitations you hold.
 *
 * Inside `PROTECTED_PREFIXES` for free — `proxy.ts` matches `/calendar` with
 * `startsWith`, which is also the reason a Phase-4 public RSVP page must live at
 * `/rsvp/[token]` and not under this prefix.
 *
 * The scoped `timeZone` override is the Phase-0 pattern: a per-request zone in
 * `i18n/request.ts` would make every next-intl route dynamic and kill the static
 * prerender of the marketing pages, so it is nested here instead and overrides nothing
 * else.
 */
export default async function CalendarInvitesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const preferences = await resolveUserPreferences(session.user.id, activeLocale);
  const t = await getTranslations({ locale: activeLocale, namespace: "Calendar.invites" });

  return (
    <NextIntlClientProvider timeZone={preferences.timeZone}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </header>
        <InvitesList />
      </div>
    </NextIntlClientProvider>
  );
}
