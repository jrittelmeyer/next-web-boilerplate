import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
/**
 * The `body` contract, which nothing else enforces:
 *
 * - `title IS NULL` ⇒ `body` is a complete, pre-composed sentence (`test`, `system`).
 * - `title IS NOT NULL` ⇒ `type` selects the sentence and (`body`, `title`) fill its
 *   slots — `body` is the actor's email, `title` the event title. There is no stored
 *   user locale, so a body cannot be localized at write time; the renderer picks the
 *   sentence per the reader's locale (I18N.md).
 *
 * Duplicated as a Zod enum in `@repo/validators` (`notificationPayloadSchema`) so that
 * package stays DB-free; `apps/web/src/lib/union-parity.test.ts` is what keeps the two
 * from drifting. Extending one alone makes the bus's `safeParse` drop every message of
 * the new type with no log, no error and no Sentry event.
 */
export const NOTIFICATION_TYPES = [
  "test",
  "system",
  "calendar_invite",
  "calendar_response_accepted",
  "calendar_response_declined",
  "calendar_response_tentative",
  "calendar_cancelled",
] as const;
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
    title: text("title"),
    link: text("link"),
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
    // `link` is rendered into an anchor, so a free-text column here is an open-redirect
    // and `javascript:` sink — the repo has already paid for one open-redirect fix. Only
    // a same-origin absolute path is storable. `//evil.com` and `/\evil.com` both begin
    // with `/` and are both protocol-relative to a browser, so rejecting `http://` alone
    // would miss both. Mirrored in Zod on the write path; the DB is the backstop.
    //
    // Spelled with `left()` rather than `NOT LIKE '/\%'` deliberately: backslash is
    // LIKE's default ESCAPE character, so that pattern means "slash then a literal %"
    // and would accept `/\evil.com`. `left()` compares plain text with no escape layer.
    check(
      "notifications_link_same_origin",
      sql`${t.link} IS NULL OR (left(${t.link}, 1) = '/' AND left(${t.link}, 2) <> '//' AND left(${t.link}, 2) <> '/\\')`,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
