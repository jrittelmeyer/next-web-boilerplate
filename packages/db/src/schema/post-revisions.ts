import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { posts } from "./posts";

/**
 * Append-only edit history for the example `posts` entity (Tier 4 · A15) — the worked
 * reason this repo reaches for `db.transaction`. Every `createPost` / `updatePost`
 * writes the `posts` row AND a revision here as ONE atomic unit
 * (apps/web/src/server/actions/post.ts): a search or DB hiccup mid-write can never
 * leave a post with no recorded version, or a version pointing at a post that never
 * committed. Without a transaction those two writes could partially apply.
 *
 * Revisions are immutable (no `updated_at`, no update path) — a new edit appends a
 * new row rather than mutating one, so the table is a full ordered version log.
 *
 * `postId` FK cascades (`onDelete: "cascade"`): deleting a post drops its history —
 * revisions have no meaning without their post. `authorId` records WHO made the edit
 * (an org admin/owner may edit a member's post, so it can differ from the post's
 * author); it FKs `user` with `onDelete: "set null"` (nullable) — losing the editor's
 * account must not erase the post's history, mirroring `posts.organizationId`'s
 * "orphan, don't nuke" choice (see posts.ts / DECISIONS.md).
 */
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    // Editor may be an org admin, not the post's author; keep history if they leave.
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres does NOT auto-index FK referencing columns. The history read path
    // (a post's revisions, newest-first) filters by post_id, and the post-delete
    // cascade scans it — so index it, exactly like posts_author_id_idx.
    index("post_revisions_post_id_idx").on(t.postId),
  ],
);

export type PostRevision = typeof postRevisions.$inferSelect;
export type NewPostRevision = typeof postRevisions.$inferInsert;
