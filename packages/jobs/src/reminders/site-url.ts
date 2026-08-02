/**
 * The worker's optional public base URL, for the one thing that needs an absolute link: the
 * reminder email's button.
 *
 * **Optional, and null when unset.** `packages/jobs/AGENTS.md` says this package "cannot mint
 * anything needing `apps/web`'s env", and the reason it gives is the failure mode that
 * matters — a worker holding the wrong value fails *quietly*, producing a wrong link rather
 * than refusing to boot. Phase 4 never hit it because `apps/web` was the producer and minted
 * every link at enqueue time. The reminder sweeper has no such producer, so this exists — and
 * degrades rather than guesses: unset means the email ships **without** a button, never with
 * "undefined/calendar/event/…" in it.
 *
 * `BETTER_AUTH_URL` is the fallback because `apps/web` already treats it that way when
 * `SITE_URL` is absent, and `docker-compose.prod.yml` deliberately sets only the former.
 *
 * The in-app notification needs none of this: its `link` is a relative path, which is also
 * what `notifications_link_same_origin` demands.
 */
function readBaseUrl(): string | null {
  const raw = process.env.SITE_URL || process.env.BETTER_AUTH_URL;
  if (!raw) return null;
  try {
    // Parse rather than string-check: a malformed value must degrade to "no link" exactly
    // like an unset one, not ship a broken href. Trailing slash is normalised away so
    // joining a path cannot produce a double slash.
    return new URL(raw).origin;
  } catch {
    console.warn(
      "[jobs] SITE_URL/BETTER_AUTH_URL is not a valid URL — reminder emails will omit the event link",
    );
    return null;
  }
}

/** The event's path, which is all the in-app notification may store. */
export function eventPath(eventId: string): string {
  return `/calendar/event/${eventId}`;
}

/** The event's absolute URL, or `null` when this deployment has no base URL configured. */
export function eventUrl(eventId: string): string | null {
  const base = readBaseUrl();
  return base ? `${base}${eventPath(eventId)}` : null;
}
