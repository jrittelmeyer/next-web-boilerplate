import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

/**
 * Example domain entity (Step 28) — the "copy-me" template for your own tables.
 * Follows the repo convention (snake_case-plural table name, `id` UUID, `created_at`
 * / `updated_at` on every table — unlike the Better Auth tables in auth.ts, which are
 * a deliberate exception; see DATABASE.md).
 *
 * `authorId` foreign-keys into the Better Auth `user` table. That table's `id` is
 * `text` (not `uuid`), so the FK column is `text` too. `onDelete: "cascade"` ties a
 * post's lifetime to its author — deleting a user removes their posts (and the
 * db:seed author cascades to the seed posts).
 *
 * The author's display name is joined in at read time (post.list does a `leftJoin`
 * on `user`) rather than via Drizzle `relations()`, which keeps the Better Auth
 * schema untouched. Define `relations()` here if you prefer the `db.query.posts
 * .findMany({ with: { author: true } })` API.
 *
 * Multi-tenancy (Tier 4 · Band 4): `organizationId` scopes a post to an org
 * workspace. NULLABLE by design — `NULL` = the personal workspace, so a zero-org
 * clone behaves exactly as before with no backfill (see DECISIONS.md →
 * Organizations). `onDelete: "set null"` (not cascade): deleting an organization
 * orphans its posts back to the author's personal workspace rather than destroying
 * them — the safer default for user-authored content. post.list scopes every read
 * to either the caller's active org (`= $1`) or personal (`IS NULL`); createPost
 * stamps the caller's active org authoritatively (see lib/organization.ts).
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // NULL = personal workspace. SET NULL on org delete orphans (never nukes) posts.
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Keyset pagination needs an index matching its ORDER BY exactly: post.list
    // orders by (created_at DESC, id DESC), so the sort columns must too — a plain
    // created_at index can't serve the id tiebreak without a re-sort.
    // `.nullsFirst()` is load-bearing: Drizzle's bare `.desc()` emits DESC NULLS
    // LAST, but a plain `ORDER BY … DESC` means NULLS FIRST in Postgres, and the
    // planner treats that as a different sort order (even on NOT NULL columns,
    // verified on PG 16) — the index would be silently ignored.
    //
    // organization_id LEADS the composite because post.list is now ALWAYS scoped:
    // `WHERE organization_id = $1` (an org) or `WHERE organization_id IS NULL`
    // (personal) — both are valid leading btree predicates, so one index serves the
    // filter AND the (created_at, id) keyset sort for every query the router issues.
    // It also covers the org-delete SET NULL scan + any org_id lookup (Postgres does
    // NOT auto-index FK referencing columns), so no separate org_id index is needed.
    index("posts_org_id_created_at_id_idx").on(
      t.organizationId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // Postgres does NOT auto-index FK referencing columns (only the referenced
    // side's PK/unique) — without this, the user-delete cascade and author joins
    // scan the whole table.
    index("posts_author_id_idx").on(t.authorId),
  ],
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
