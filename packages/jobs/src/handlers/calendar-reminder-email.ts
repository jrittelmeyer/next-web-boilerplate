import { isEmailConfigured, sendCalendarReminderEmail } from "@repo/email";
import { calendarReminderEmailPayload } from "../queues";

/**
 * Process one `calendar-reminder-email` job (Phase 5) — one due reminder, one recipient.
 *
 * Same posture as `calendar-invitation`: **return = complete, throw = pg-boss retries**, and
 * only a real provider error throws. An unconfigured install and a suppressed address are
 * both states no retry can improve.
 *
 * **The event may have been deleted between the sweep and this dispatch, and that is
 * accepted.** The payload is self-contained, so this handler cannot tell — it sends a
 * reminder for an event that no longer exists. The window is seconds, and the alternative is
 * re-reading, which reintroduces the "the row is gone, so tell nobody" branch Phase 4
 * removed and would ALSO have to decide what the already-claimed ledger row means. What must
 * not happen is a throw: the DLQ stays for real failures.
 */
export async function handleCalendarReminderEmail(data: unknown): Promise<void> {
  const payload = calendarReminderEmailPayload.parse(data);
  const result = await sendCalendarReminderEmail({
    to: payload.to,
    eventTitle: payload.eventTitle,
    when: payload.when,
    location: payload.location,
    eventUrl: payload.eventUrl,
    startsInMinutes: payload.startsInMinutes,
  });

  if ("data" in result) {
    console.info(`[jobs] calendar-reminder-email sent to ${payload.to} (id: ${result.data.id})`);
    return;
  }

  if (result.suppressed) {
    console.info(
      `[jobs] calendar-reminder-email for ${payload.to} skipped — address is suppressed, not retrying`,
    );
    return;
  }

  if (!isEmailConfigured()) {
    // Not a failure: the in-app channel still delivers, which is the honest behaviour for a
    // deployment that never configured email.
    console.info(`[jobs] calendar-reminder-email for ${payload.to} skipped — email not configured`);
    return;
  }

  throw new Error(`calendar-reminder-email send failed for ${payload.to}: ${result.error}`);
}
