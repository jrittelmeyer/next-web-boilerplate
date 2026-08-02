import { db, NOTIFICATIONS_CHANNEL, notify } from "@repo/db";
import { notifications } from "@repo/db/schema";
import { notificationPayloadSchema } from "@repo/validators";
import { calendarReminderNotifyPayload } from "../queues";

/**
 * Process one `calendar-reminder-notify` job (Phase 5) — persist the reminder to the feed
 * and push it to any open SSE stream.
 *
 * **The worker can do this without reaching `apps/web`**, which is the whole reason the
 * in-app channel is buildable here: `@repo/db` exports both halves of the transport, and
 * `notification-bus.ts` documents that a `notify()` from any instance, webhook **or job**
 * reaches every instance's single listener. `apps/web/src/server/notifications/create.ts` is
 * `server-only` and unreachable, so its ~10 lines are re-implemented rather than moved —
 * moving them would drag the app's only persist-then-publish path into a package to serve
 * one caller. The ordering rule they exist to protect (publish strictly AFTER commit) holds
 * trivially here: this insert is not in a transaction.
 *
 * The payload is validated once more against `notificationPayloadSchema` before publishing,
 * because the bus `safeParse`s and **fails closed with no log, no error and no Sentry
 * event** — a malformed publish would vanish rather than fail. Validating here turns that
 * into a throw the DLQ can show someone.
 */
export async function handleCalendarReminderNotify(data: unknown): Promise<void> {
  const payload = calendarReminderNotifyPayload.parse(data);

  const [row] = await db
    .insert(notifications)
    .values({
      userId: payload.userId,
      type: "calendar_reminder",
      // A MACHINE value, never a phrase. There is no stored user locale, so a body written
      // here cannot be localized — the renderer picks the sentence per the reader's locale.
      // The current sentence interpolates `{event}` only; the number is kept because it is
      // the one durable fact a future sentence or a support query would want.
      body: String(payload.startsInMinutes),
      title: payload.eventTitle,
      // Relative, and the schema already refused an absolute one. `notifications_link_same_origin`
      // would otherwise reject the insert, throw, and retry every reminder into the DLQ.
      link: payload.eventPath,
    })
    .returning();

  if (!row)
    throw new Error(`calendar-reminder-notify insert returned no row (${payload.deliveryId})`);

  await notify(
    NOTIFICATIONS_CHANNEL,
    notificationPayloadSchema.parse({
      id: row.id,
      userId: row.userId,
      type: row.type,
      body: row.body,
      title: row.title,
      link: row.link,
      read: row.read,
      // ISO string, not a Date: the value round-trips through JSON.stringify (the NOTIFY
      // payload) and EventSource text frames, where a Date would stringify anyway.
      createdAt: row.createdAt.toISOString(),
    }),
  );

  console.info(`[jobs] calendar-reminder-notify delivered to ${payload.userId} (${row.id})`);
}
