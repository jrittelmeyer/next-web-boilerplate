import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { rsvpCookieName, rsvpHandle, verifyRsvpToken } from "@/lib/calendar-tokens";

/**
 * The token-for-cookie exchange behind the public RSVP page.
 *
 * **The token is verified here and then removed from the URL**, because a capability token
 * left in the address bar is a capability handed to everything that reads an address bar:
 * PostHog's `$current_url` autocapture (its provider is mounted in the `[locale]` layout,
 * so it covers this route's destination), Sentry's `request.url`, the `Referer` on any
 * outbound link, and the browser's own history. One redirect removes it from all four.
 *
 * A **route handler** rather than a page because only a route handler (or a Server Action)
 * may set a cookie; a Server Component that tried would throw.
 *
 * **Both outcomes redirect to a handle-shaped URL, and that is deliberate.** An invalid
 * token redirects to `rsvpHandle(token)` — a well-formed 12-character handle with no cookie
 * behind it — so the destination URL, the status code and the rendered page are identical
 * whether the token was real, forged, expired or revoked. Sending a valid one somewhere
 * structurally different would make this route an oracle for which invitations exist.
 *
 * See docs/context/calendar/invitations.md.
 */

/** Long enough to read the invitation and answer; short enough that a shared device forgets. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string; token: string }> },
): Promise<NextResponse> {
  const { locale, token } = await params;
  const attendeeId = verifyRsvpToken(token, Date.now());

  // A verified token names its row; an unverifiable one still yields a handle, derived from
  // the token itself, so the two paths are indistinguishable from outside.
  const handle = attendeeId === null ? rsvpHandle(token) : rsvpHandle(attendeeId);

  // `localePrefix: "as-needed"` leaves the default locale unprefixed, so re-prefixing it
  // here would produce `/en/rsvp/...` — a URL next-intl redirects straight back off.
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const response = NextResponse.redirect(new URL(`${prefix}/rsvp/s/${handle}`, request.url));

  if (attendeeId !== null) {
    response.cookies.set(rsvpCookieName(handle), token, {
      httpOnly: true,
      sameSite: "lax",
      // Lax, not Strict: the visitor arrives by a cross-site top-level navigation from
      // their mail client, and Strict would withhold the cookie on exactly that hop.
      secure: process.env.NODE_ENV === "production",
      // Scoped to the locale-prefixed path, not a bare "/rsvp": a Spanish visitor's page
      // lives at `/es/rsvp/...`, which a `/rsvp` cookie would never be sent to — so the
      // page would find nothing and render "link no longer valid" for a perfectly good link.
      path: `${prefix}/rsvp`,
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
