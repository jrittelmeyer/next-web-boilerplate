import { db, postRevisions, posts, user } from "@repo/db";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * DB-backed integration test for the example `posts` entity (Step 29). It runs the
 * actual SQL behind the read/write paths against a REAL Postgres — no mocks — so it
 * proves the schema, the FK cascade, and the exact query shape the tRPC `post.list`
 * procedure (server/trpc/routers/post.ts) and the `createPost`/`deletePost` Server
 * Actions (server/actions/post.ts) rely on. Those app modules import `@/env` +
 * `server-only`, so we exercise the data layer here in `@repo/db` rather than
 * importing the procedures themselves (see TESTING.md).
 *
 * Scoped to a dedicated test author so it can clean up after itself (the FK cascade
 * does the work) WITHOUT touching the db:seed rows (a different author).
 */
const TEST_AUTHOR = {
  id: "integration-test-author",
  name: "Integration Test Author",
  email: "integration-test-author@example.com",
  emailVerified: true,
} as const;

// Deleting the author cascades to its posts (posts.author_id ... onDelete: cascade),
// so this is the only cleanup needed.
async function cleanup() {
  await db.delete(user).where(eq(user.id, TEST_AUTHOR.id));
}

async function seedAuthor() {
  await db.insert(user).values(TEST_AUTHOR);
}

// Mirrors the tRPC `post.list` query exactly (select projection + leftJoin author
// name + newest-first), then narrows to this test's author so the assertion is
// independent of any other rows (db:seed data, parallel runs).
async function listPostsForTestAuthor() {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorName: user.name,
    })
    .from(posts)
    .leftJoin(user, eq(posts.authorId, user.id))
    .orderBy(desc(posts.createdAt))
    .limit(50);

  return rows.filter((row) => row.authorId === TEST_AUTHOR.id);
}

// Mirrors the tRPC `post.list` keyset pagination (server/trpc/routers/post.ts), but
// scoped to this test's author so the page contents are deterministic regardless of
// db:seed rows or parallel runs. Fetches limit+1 to derive nextCursor, exactly like
// the procedure.
async function listPageForTestAuthor(
  cursor: { createdAt: Date; id: string } | null,
  limit: number,
) {
  const keyset = cursor
    ? or(
        lt(posts.createdAt, cursor.createdAt),
        and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
      )
    : undefined;

  const rows = await db
    .select({ id: posts.id, title: posts.title, createdAt: posts.createdAt })
    .from(posts)
    .where(and(eq(posts.authorId, TEST_AUTHOR.id), keyset))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
  return { items, nextCursor };
}

describe("posts (integration)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("lists posts newest-first with the author name joined in", async () => {
    await seedAuthor();
    // Explicit, ordered timestamps so "newest first" is deterministic (two quick
    // inserts could otherwise share a millisecond).
    await db.insert(posts).values([
      {
        authorId: TEST_AUTHOR.id,
        title: "Older post",
        content: "Written first.",
        createdAt: new Date("2025-01-01T00:00:00Z"),
      },
      {
        authorId: TEST_AUTHOR.id,
        title: "Newer post",
        content: "Written second.",
        createdAt: new Date("2025-06-01T00:00:00Z"),
      },
    ]);

    const list = await listPostsForTestAuthor();

    expect(list).toHaveLength(2);
    expect(list.map((p) => p.title)).toEqual(["Newer post", "Older post"]);
    // The leftJoin resolves the author's display name (not stored on the post row).
    expect(list[0]?.authorName).toBe(TEST_AUTHOR.name);
  });

  it("inserts a post and reads it back by id", async () => {
    await seedAuthor();
    const [created] = await db
      .insert(posts)
      .values({ authorId: TEST_AUTHOR.id, title: "Round-trip", content: "Body." })
      .returning({ id: posts.id, title: posts.title });

    expect(created?.id).toBeTruthy();

    // The lookup `deletePost` does before authorizing the delete.
    const found = await db.query.posts.findFirst({
      where: eq(posts.id, created?.id ?? ""),
      columns: { id: true, authorId: true },
    });
    expect(found?.authorId).toBe(TEST_AUTHOR.id);
  });

  it("updates a post's title/content by id and bumps updatedAt", async () => {
    await seedAuthor();
    // Seed an explicitly OLD updatedAt so the $onUpdate bump is unmistakably newer.
    const old = new Date("2025-01-01T00:00:00Z");
    const [created] = await db
      .insert(posts)
      .values({
        authorId: TEST_AUTHOR.id,
        title: "Before",
        content: "Original body.",
        createdAt: old,
        updatedAt: old,
      })
      .returning({ id: posts.id });
    const id = created?.id ?? "";

    // The exact write `updatePost` performs (the action layers auth/validation on top).
    await db.update(posts).set({ title: "After", content: "Edited body." }).where(eq(posts.id, id));

    const found = await db.query.posts.findFirst({ where: eq(posts.id, id) });
    expect(found?.title).toBe("After");
    expect(found?.content).toBe("Edited body.");
    // `updatedAt` is `$onUpdate(() => new Date())`, so it advances past the seeded value.
    expect(found?.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it("paginates newest-first by keyset cursor without overlap", async () => {
    await seedAuthor();
    // Five posts with strictly increasing createdAt → a deterministic newest-first order.
    await db.insert(posts).values(
      [1, 2, 3, 4, 5].map((n) => ({
        authorId: TEST_AUTHOR.id,
        title: `Post ${n}`,
        content: "x",
        createdAt: new Date(`2025-0${n}-01T00:00:00Z`),
      })),
    );

    const page1 = await listPageForTestAuthor(null, 2);
    expect(page1.items.map((p) => p.title)).toEqual(["Post 5", "Post 4"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listPageForTestAuthor(page1.nextCursor, 2);
    expect(page2.items.map((p) => p.title)).toEqual(["Post 3", "Post 2"]);

    const page3 = await listPageForTestAuthor(page2.nextCursor, 2);
    expect(page3.items.map((p) => p.title)).toEqual(["Post 1"]);
    // Last page: fewer than limit rows → no further cursor.
    expect(page3.nextCursor).toBeNull();
  });

  it("deletes a post by id", async () => {
    await seedAuthor();
    const [created] = await db
      .insert(posts)
      .values({ authorId: TEST_AUTHOR.id, title: "Doomed", content: "Delete me." })
      .returning({ id: posts.id });
    const id = created?.id ?? "";

    await db.delete(posts).where(eq(posts.id, id));

    const found = await db.query.posts.findFirst({ where: eq(posts.id, id) });
    expect(found).toBeUndefined();
  });

  it("cascades: deleting the author removes their posts", async () => {
    await seedAuthor();
    await db
      .insert(posts)
      .values({ authorId: TEST_AUTHOR.id, title: "Orphan-to-be", content: "Bye." });

    // FK onDelete: "cascade" — removing the user should remove their posts.
    await db.delete(user).where(eq(user.id, TEST_AUTHOR.id));

    const remaining = await listPostsForTestAuthor();
    expect(remaining).toHaveLength(0);
  });

  // A15 — the `db.transaction` the createPost/updatePost Server Actions rely on. These
  // run the real BEGIN/COMMIT/ROLLBACK against Postgres, so they prove atomicity that a
  // unit test with mocks cannot (a mock can't undo mock state).
  it("commits a post and its first revision together (db.transaction)", async () => {
    await seedAuthor();
    const created = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({ authorId: TEST_AUTHOR.id, title: "With history", content: "v1" })
        .returning({ id: posts.id, title: posts.title, content: posts.content });
      if (!post) throw new Error("post insert returned no row");
      await tx.insert(postRevisions).values({
        postId: post.id,
        authorId: TEST_AUTHOR.id,
        title: post.title,
        content: post.content,
      });
      return post;
    });

    const revisions = await db
      .select({ postId: postRevisions.postId, content: postRevisions.content })
      .from(postRevisions)
      .where(eq(postRevisions.postId, created.id));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.content).toBe("v1");
  });

  it("rolls back the post insert when the paired revision write fails (atomicity)", async () => {
    await seedAuthor();

    const attempt = db.transaction(async (tx) => {
      await tx
        .insert(posts)
        .values({ authorId: TEST_AUTHOR.id, title: "Doomed", content: "uncommitted" });
      // Force a mid-transaction failure AFTER the post insert: a revision pointing at a
      // non-existent post violates the post_id FK, which aborts the whole transaction.
      await tx.insert(postRevisions).values({
        postId: "00000000-0000-0000-0000-000000000000",
        authorId: TEST_AUTHOR.id,
        title: "orphan",
        content: "orphan",
      });
    });

    await expect(attempt).rejects.toThrow();

    // The transaction rolled back, so the "Doomed" post the same tx inserted is gone —
    // the post and its history are all-or-nothing.
    const remaining = await listPostsForTestAuthor();
    expect(remaining.some((p) => p.title === "Doomed")).toBe(false);
  });
});
