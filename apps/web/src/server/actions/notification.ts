"use server";

import { auth } from "@repo/auth";
import { db, NOTIFICATIONS_CHANNEL, notify } from "@repo/db";
import { notifications } from "@repo/db/schema";
import type { ActionResult, NotificationPayload } from "@repo/validators";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";

// The realtime notifications example (Tier 4 · A22). Writes live in Server Actions
// (reads live in the notification.list tRPC query, server/trpc/routers/notification.ts)
// — the same tRPC-reads / action-writes split as the rest of the app. `sendTestNotification`
// is the demo trigger that both PERSISTS a notification and PUSHES it over Postgres
// NOTIFY → the in-process bus → every open SSE stream for the user. In a real app you'd
// call the same `notify()` from wherever the event actually originates (a webhook, a
// finished background job, another user's action). See docs/context/API.md → Realtime.

type SendResult = ActionResult<{ id: string }>;
type MarkAllReadResult = ActionResult<{ updated: number }>;

/**
 * Insert a notification for the caller and broadcast it live. Auth-gated and
 * rate-limited (a write that also fans out over SSE), mirroring the post write
 * actions. The DB row is the durable source of truth; the NOTIFY is the enhancement
 * — if no stream is open the row is still there for the next `notification.list` load.
 * The body is a plain server-generated string: notification CONTENT is data, not UI
 * chrome, so it isn't run through next-intl (a real app would store structured data
 * and localize at render, or store the already-localized copy).
 */
export async function sendTestNotification(): Promise<SendResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  // Server Actions can't set a 429 status, so the limit surfaces as the typed error
  // the UI already renders (same posture as the post write actions).
  const limit = await rateLimit(`notify:test:${session.user.id}`, { limit: 10, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  const body = `Test notification · ${new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;

  const [row] = await db
    .insert(notifications)
    .values({ userId: session.user.id, type: "test", body })
    .returning();
  if (!row) return { error: "Failed to create notification." };

  // Broadcast on the single notifications channel. Every instance's listener receives
  // it and dispatches to the streams whose userId matches this payload's. createdAt is
  // sent as an ISO string — it round-trips through JSON.stringify (NOTIFY) and the SSE
  // text frame; the client re-hydrates it to a Date (see the feed component).
  const payload: NotificationPayload = {
    id: row.id,
    userId: row.userId,
    type: row.type,
    body: row.body,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
  await notify(NOTIFICATIONS_CHANNEL, payload);

  return { data: { id: row.id } };
}

/**
 * Mark every one of the caller's unread notifications read. Returns the count changed
 * so the client can reconcile its cache. No revalidatePath: the feed is a client
 * component driven by tRPC + SSE, so it updates its own TanStack Query cache
 * optimistically rather than through a server re-render.
 */
export async function markAllRead(): Promise<MarkAllReadResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const updated = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, session.user.id), eq(notifications.read, false)))
    .returning({ id: notifications.id });

  return { data: { updated: updated.length } };
}
