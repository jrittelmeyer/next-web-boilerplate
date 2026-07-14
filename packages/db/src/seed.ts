import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Idempotent seed for the example `posts` entity (Step 28). Run it with:
 *
 *   pnpm --filter @repo/db db:seed
 *
 * It inserts a deterministic demo author into the Better Auth `user` table, then a
 * handful of posts owned by that author. Both inserts use fixed primary keys +
 * `onConflictDoNothing`, so re-running is a no-op (no duplicates). FK order matters:
 * the author row goes in first because `posts.author_id` references it.
 *
 * `@repo/db` is intentionally pure Drizzle/Postgres (no Meilisearch import), so the
 * seed does NOT touch the search engine. To make seeded posts searchable, run the
 * app's "Reindex posts from database" action on /search (or create posts via the
 * /posts UI, which indexes on write). See SERVICES.md.
 *
 * `dotenv` must load the monorepo-root `.env` BEFORE the DB client is constructed
 * (the pool reads DATABASE_URL at import time). ESM hoists static imports above this
 * call, so the client + schema are pulled in via dynamic `import()` inside `main()`.
 */
config({ path: resolve(process.cwd(), "../../.env") });

// A fixed, recognizable author so re-seeding is idempotent and the rows are easy to
// spot/remove. `user.id` is `text`, so a readable string id is fine here. This row
// has no `account`, so it can't password-log-in — it only exists to own seed posts.
const SEED_AUTHOR = {
  id: "seed-author",
  name: "Seed Author",
  email: "seed-author@example.com",
  emailVerified: true,
} as const;

// Fixed UUIDs keep the post inserts idempotent across re-runs. Explicit, ascending
// `createdAt` values make the newest-first ordering deterministic AND give the
// cursor-paginated list (POSTS_PAGE_SIZE = 5) more than one page out of the box, so
// the "Load more" button is exercised on a fresh seed. `created_at` is otherwise
// `defaultNow()`, which would put all eight rows in the same instant.
const SEED_POSTS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Welcome to next-web-boilerplate",
    content: "This post was created by the db:seed script as example data you can delete.",
    createdAt: new Date("2025-01-01T12:00:00Z"),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "The read/write split",
    content: "Reads go through tRPC queries; writes go through Server Actions. See API.md.",
    createdAt: new Date("2025-01-02T12:00:00Z"),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Search on write",
    content: "Creating a post indexes it into Meilisearch so it is immediately searchable.",
    createdAt: new Date("2025-01-03T12:00:00Z"),
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Type-safe all the way down",
    content: "Drizzle types the schema, Zod validates the input, tRPC types the wire.",
    createdAt: new Date("2025-01-04T12:00:00Z"),
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    title: "Cursor pagination, not offset",
    content: "post.list pages by a (createdAt, id) keyset — no skipped or repeated rows.",
    createdAt: new Date("2025-01-05T12:00:00Z"),
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    title: "Optimistic UI with rollback",
    content: "Create/edit/delete patch the TanStack cache immediately and roll back on error.",
    createdAt: new Date("2025-01-06T12:00:00Z"),
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    title: "Author-only edits",
    content: "updatePost re-checks ownership server-side; a non-author sees a typed Forbidden.",
    createdAt: new Date("2025-01-07T12:00:00Z"),
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    title: "Delete me to start fresh",
    content: "These eight rows are seed data — clear them once you have real posts.",
    createdAt: new Date("2025-01-08T12:00:00Z"),
  },
] as const;

async function main() {
  const { db, pool } = await import("./client");
  const { posts, user } = await import("./schema");

  await db.insert(user).values(SEED_AUTHOR).onConflictDoNothing();
  await db
    .insert(posts)
    .values(SEED_POSTS.map((post) => ({ ...post, authorId: SEED_AUTHOR.id })))
    .onConflictDoNothing();

  console.log(
    `Seeded ${SEED_POSTS.length} posts for author "${SEED_AUTHOR.email}" (idempotent — re-running is a no-op).`,
  );
  console.log('Run the "Reindex posts from database" action on /search to make them searchable.');

  await pool.end();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
