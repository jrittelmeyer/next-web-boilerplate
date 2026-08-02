"use client";

import type { AttendeeRole, AttendeeStatus } from "@repo/validators/calendar";
import { useTranslations } from "next-intl";

/**
 * The guest list.
 *
 * **Every attendee sees all of it**, which is Google's default and a deliberate Phase-3
 * decision rather than an omission: the alternative is the per-guest permission columns
 * (may-invite / may-modify / may-see-list) the program assigns to Phase 6, and shipping
 * half of that model would mean migrating it twice.
 *
 * **Addresses only, never a resolved display name** (decision 11). Filling `user_id`
 * changes storage and nothing on screen, so an organizer typing an address cannot tell
 * from this list whether it belongs to an account here. The protection is honest rather
 * than complete — a registered invitee's row can later move to `accepted`, an unregistered
 * one's cannot, so the list is a *slower* oracle, not no oracle. SECURITY.md says so
 * outright.
 */
export function AttendeeList({
  attendees,
}: {
  attendees: readonly {
    email: string;
    role: AttendeeRole;
    status: AttendeeStatus;
    comment: string | null;
    /** Answered before the event last moved (Phase 4) — the answer itself is still theirs. */
    stale: boolean;
    /**
     * The Phase-4 fallback: present only when email is unconfigured **and** the reader may
     * write this calendar, because the link is the capability to answer as that guest.
     */
    rsvpUrl: string | null;
  }[];
}) {
  const t = useTranslations("Calendar.attendees");

  if (attendees.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="event-guest-list">
      {attendees.map((attendee) => (
        <li key={attendee.email} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span>{attendee.email}</span>
          <span className="text-muted-foreground">{t(`status.${attendee.status}`)}</span>
          {/* Not "no response": they DID answer, and their answer is still on the row —
              it just predates the reschedule. Saying otherwise would erase it on screen
              the way a reset would have erased it in the database. */}
          {attendee.stale ? (
            <span className="text-muted-foreground" data-testid="attendee-stale">
              {t("stale")}
            </span>
          ) : null}
          {attendee.role === "organizer" ? (
            <span className="text-muted-foreground">{t("role.organizer")}</span>
          ) : null}
          {attendee.comment ? (
            <span className="w-full text-muted-foreground">{attendee.comment}</span>
          ) : null}
          {attendee.rsvpUrl ? (
            <span className="flex w-full flex-col gap-1">
              <span className="text-muted-foreground text-xs">{t("rsvpLinkHint")}</span>
              <input
                readOnly
                aria-label={t("rsvpLinkLabel", { email: attendee.email })}
                data-testid={`rsvp-link-${attendee.email}`}
                className="w-full rounded border bg-muted px-2 py-1 font-mono text-xs"
                value={attendee.rsvpUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
