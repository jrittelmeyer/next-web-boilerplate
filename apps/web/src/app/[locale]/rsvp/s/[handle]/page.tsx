import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RsvpForm } from "@/components/calendar/rsvp-form";
import type { Locale } from "@/i18n/routing";
import { rsvpCookieName } from "@/lib/calendar-tokens";
import { loadRsvpView } from "@/server/calendar/rsvp";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("rsvp"),
    // An invitation link is a capability. Keeping it out of an index is the obvious half;
    // `nofollow` and `no-referrer` are the half that stops the handle travelling onward.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/**
 * The public RSVP page — the **only** unauthenticated page in the app, and the only way an
 * external guest can answer.
 *
 * It renders from a cookie, never from the URL: `/rsvp/[token]` verified the token, moved it
 * into an httpOnly cookie and redirected here with an opaque handle
 * ([`route.ts`](../../[token]/route.ts)).
 *
 * **Every failure renders this same page at HTTP 200**, with copy that does not distinguish
 * them: no cookie, forged token, expired token, guest removed, event deleted. There is no
 * `notFound()` here on purpose — a 404 answers "does this invitation exist?" for anyone who
 * asks, which is exactly the question an unauthenticated route must not answer. Same posture
 * as `respondToEvent`'s flat "Event not found" (docs/context/calendar/attendees.md).
 */
export default async function RsvpPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Rsvp" });

  const token = (await cookies()).get(rsvpCookieName(handle))?.value;
  const view = token === undefined ? null : await loadRsvpView(token, Date.now());

  if (view === null) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("invalidTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("invalidBody")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t("invitedBy", { organizer: view.organizerEmail })}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{view.eventTitle}</h1>
        <p className="text-sm font-medium">{view.when}</p>
        {view.location ? <p className="text-sm text-muted-foreground">{view.location}</p> : null}
      </header>

      {view.stale ? <p className="text-sm font-medium">{t("stale")}</p> : null}

      <RsvpForm handle={handle} recipient={view.email} status={view.status} stale={view.stale} />
    </main>
  );
}
