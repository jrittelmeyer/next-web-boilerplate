import "server-only";

import { type Database, NOTIFICATIONS_CHANNEL, notify } from "@repo/db";
import { type Notification, type NotificationType, notifications } from "@repo/db/schema";
import type { NotificationPayload } from "@repo/validators";

/**
 * The one persist-then-publish path for notifications (Phase 3).
 *
 * Split in two on purpose. `notify()` issues `pg_notify` on the **pooled** connection
 * (`packages/db/src/notify.ts`), not the caller's transaction connection, and Postgres
 * `NOTIFY` is transactional only for the transaction that issued it. Calling it inside
 * `db.transaction` therefore fires on a *different* connection and can reach a
 * subscriber before the row it describes is visible — a live notification whose link
 * 404s when the user clicks it, reproducible only under load. So rows are built inside
 * the transaction and payloads are published strictly after it commits.
 *
 * Callers own that ordering:
 *
 *   const payloads = await db.transaction(async (tx) => {
 *     ...writes...
 *     return createNotifications(tx, rows);
 *   });
 *   await publishNotifications(payloads);
 */

/** The transaction handle Drizzle hands a `db.transaction` callback. */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Either connection can insert; only a transaction gets the ordering guarantee above. */
type Writer = Database | Transaction;

export type NewNotificationInput = {
  readonly userId: string;
  readonly type: NotificationType;
  /** `title === null` ⇒ a complete pre-composed sentence; otherwise a sentence slot. */
  readonly body: string;
  readonly title?: string | null;
  /** A same-origin path. The DB CHECK is the backstop; see `schema/notifications.ts`. */
  readonly link?: string | null;
};

const toPayload = (row: Notification): NotificationPayload => ({
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
});

/**
 * Insert notification rows and return their wire payloads. Insert only — nothing is
 * broadcast here. An empty `rows` short-circuits, because Drizzle rejects an INSERT
 * with no VALUES and callers legitimately diff their way to nothing to do.
 */
export async function createNotifications(
  writer: Writer,
  rows: readonly NewNotificationInput[],
): Promise<NotificationPayload[]> {
  if (rows.length === 0) return [];

  const inserted = await writer
    .insert(notifications)
    .values(
      rows.map((row) => ({
        userId: row.userId,
        type: row.type,
        body: row.body,
        title: row.title ?? null,
        link: row.link ?? null,
      })),
    )
    .returning();

  return inserted.map(toPayload);
}

/**
 * Broadcast payloads that a committed transaction produced. Every instance's listener
 * receives them and dispatches to the streams whose `userId` matches.
 */
export async function publishNotifications(
  payloads: readonly NotificationPayload[],
): Promise<void> {
  for (const payload of payloads) {
    await notify(NOTIFICATIONS_CHANNEL, payload);
  }
}
