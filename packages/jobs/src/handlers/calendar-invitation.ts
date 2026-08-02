import {
  isEmailConfigured,
  sendCalendarEventCancelledEmail,
  sendCalendarEventUpdatedEmail,
  sendCalendarInvitationEmail,
} from "@repo/email";
import { type CalendarInvitationPayload, calendarInvitationPayload } from "../queues";

/**
 * Process one `calendar-invitation` job — an invitation, an update, or a cancellation for
 * exactly one guest (Phase 4).
 *
 * The payload is **self-contained**, so this handler reads nothing: the `.ics` and the RSVP
 * link were built at enqueue time by the writer that had the transaction, the guest list and
 * the signing key. See `calendarInvitationPayload` for why (a cancellation's attendee row is
 * already hard-deleted by the time this runs, and the worker cannot mint a token anyway).
 *
 * Return = job complete. Throw = pg-boss retries. Same posture as `welcome-email`: only a
 * real provider error throws, because an unconfigured install and a suppressed address are
 * both states no retry can improve.
 */
export async function handleCalendarInvitation(data: unknown): Promise<void> {
  const payload = calendarInvitationPayload.parse(data);
  const result = await sendFor(payload);

  if ("data" in result) {
    console.info(
      `[jobs] calendar-invitation (${payload.kind}) sent to ${payload.to} (id: ${result.data.id})`,
    );
    return;
  }

  if (result.suppressed) {
    console.info(
      `[jobs] calendar-invitation for ${payload.to} skipped — address is suppressed, not retrying`,
    );
    return;
  }

  if (!isEmailConfigured()) {
    // Not a failure: with email unset the organizer's own UI surfaces a copyable RSVP link
    // per guest instead, so the invitation is still reachable.
    console.info(`[jobs] calendar-invitation for ${payload.to} skipped — email not configured`);
    return;
  }

  throw new Error(`calendar-invitation send failed for ${payload.to}: ${result.error}`);
}

function sendFor(payload: CalendarInvitationPayload) {
  switch (payload.kind) {
    case "invite":
      return sendCalendarInvitationEmail({
        to: payload.to,
        organizerEmail: payload.organizerEmail,
        eventTitle: payload.eventTitle,
        when: payload.when,
        location: payload.location,
        rsvpUrl: payload.rsvpUrl,
        ics: payload.ics,
      });
    case "update":
      return sendCalendarEventUpdatedEmail({
        to: payload.to,
        organizerEmail: payload.organizerEmail,
        eventTitle: payload.eventTitle,
        when: payload.when,
        location: payload.location,
        rsvpUrl: payload.rsvpUrl,
        reask: payload.reask,
        ics: payload.ics,
      });
    // No `default`: the union is exhaustive, and adding a fourth kind should stop this
    // file compiling rather than fall through to a cancellation.
    case "cancel":
      return sendCalendarEventCancelledEmail({
        to: payload.to,
        organizerEmail: payload.organizerEmail,
        eventTitle: payload.eventTitle,
        when: payload.when,
        reason: payload.reason,
        ics: payload.ics,
      });
  }
}
