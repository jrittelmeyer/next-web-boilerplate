import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Uploaded files (Phase 3 · D9) — the worked example for persisting Uploadthing
 * uploads, the upload analog of the `subscriptions` table (C4). Populated by the
 * file router's `onUploadComplete` callback
 * (`apps/web/src/lib/uploadthing.ts`) once a file finishes uploading. See
 * SERVICES.md (Uploadthing) + DATABASE.md.
 *
 * `id` is a surrogate UUID (the repo convention, like `posts`) rather than a
 * natural key — files have no Stripe-id-style identifier. `key` is Uploadthing's
 * storage key: stable and unique, so the callback upserts on it
 * (`onConflictDoUpdate(target: uploads.key)`) and a redelivered callback is a
 * no-op instead of a duplicate row.
 *
 * `userId` foreign-keys into the Better Auth `user` table (`text` id, not `uuid`),
 * `onDelete: "cascade"` so removing a user drops their uploads. `url` stores
 * `file.ufsUrl` (the served file on `*.ufs.sh`); `size` is bytes; `type` is the
 * MIME type and nullable (Uploadthing occasionally reports it empty).
 */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(), // Uploadthing storage key (idempotency)
    name: text("name").notNull(),
    url: text("url").notNull(), // file.ufsUrl
    size: integer("size").notNull(), // bytes
    type: text("type"), // MIME type (nullable — sometimes empty)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Postgres doesn't auto-index FK referencing columns — the user-delete cascade
  // and the P2-3 per-user uploads listing scan without this.
  (t) => [index("uploads_user_id_idx").on(t.userId)],
);

export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
