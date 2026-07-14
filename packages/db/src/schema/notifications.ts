import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Per-user notifications (Tier 4 · A22) — the persisted backbone of the realtime
 * SSE example. A row is the durable record; the live push over
 * `/api/notifications/stream` is an *enhancement* layered on top. Because every
 * notification is stored here, the feature degrades cleanly: strip the SSE route
 * and the client falls back to "refresh to see new" with no data loss (see
 * DEPLOYMENT.md → the serverless caveat).
 *
 * Follows the repo convention (snake_case-plural name, `id` UUID, `created_at`).
 * `userId` foreign-keys the Better Auth `user` table (its `id` is `text`, not
 * `uuid`), `onDelete: "cascade"` so deleting a user drops their notifications.
 *
 * `type` is a plain `text` union (not a `pgEnum`) — the `audit_log.action`
 * precedent: adding a kind later is a one-line edit with no `ALTER TYPE` migration,
 * while the helper types keep a typo from compiling. `read` defaults false; a read
 * is flipped by `markAllRead` (server action). There is no `updated_at`: a
 * notification is immutable except for the single read flip, which `read` captures.
 */
export const NOTIFICATION_TYPES = ["test", "system"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    body: text("body").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The only read is "this user's notifications, newest-first" (notification.list),
    // keyset-paginated by (created_at DESC, id DESC). The index must match that ORDER
    // BY exactly, so user_id leads (the always-present `WHERE user_id = $1` filter),
    // then the sort columns. `.nullsFirst()` mirrors posts_org_id_created_at_id_idx:
    // Drizzle's bare `.desc()` emits DESC NULLS LAST, but a plain `ORDER BY … DESC`
    // is NULLS FIRST in Postgres, and the planner treats them as different sort orders
    // — the index would be silently skipped. This one index also covers the
    // user-delete cascade scan (Postgres does NOT auto-index FK columns).
    index("notifications_user_id_created_at_id_idx").on(
      t.userId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
