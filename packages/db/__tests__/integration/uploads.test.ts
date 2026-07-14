import { db, uploads, user } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * DB-backed integration test for the `uploads` entity (Phase 3 · D9). It runs the
 * actual SQL behind the Uploadthing file router's `onUploadComplete` callback
 * (apps/web/src/lib/uploadthing.ts) against a REAL Postgres — no mocks — so it
 * proves the schema, the idempotent upsert keyed by Uploadthing's storage `key`,
 * and the FK cascade. The router imports `@/env` + `server-only` + `uploadthing`,
 * so we exercise the data layer here in `@repo/db` rather than importing it (the
 * same posture as the C4 subscriptions test; see TESTING.md).
 *
 * Scoped to a dedicated test user so it cleans up after itself (the FK cascade does
 * the work) WITHOUT touching db:seed rows.
 */
const TEST_USER = {
  id: "integration-test-uploader",
  name: "Integration Test Uploader",
  email: "integration-test-uploader@example.com",
  emailVerified: true,
} as const;

const FILE_KEY = "integration-test-file-key";

// Mirrors the callback's write: upsert keyed by the Uploadthing storage `key`
// (insert, or sync the mutable fields on a redelivered callback).
async function upsertUpload(fields: {
  name: string;
  url: string;
  size: number;
  type: string | null;
}) {
  await db
    .insert(uploads)
    .values({ userId: TEST_USER.id, key: FILE_KEY, ...fields })
    .onConflictDoUpdate({
      target: uploads.key,
      set: { url: fields.url, name: fields.name, size: fields.size, type: fields.type },
    });
}

// Deleting the user cascades to its uploads (onDelete: cascade), so this is the
// only cleanup needed.
async function cleanup() {
  await db.delete(user).where(eq(user.id, TEST_USER.id));
}

async function seedUser() {
  await db.insert(user).values(TEST_USER);
}

describe("uploads (integration)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("persists an upload from the callback and reads it back by key", async () => {
    await seedUser();
    await upsertUpload({
      name: "cat.png",
      url: "https://example.ufs.sh/f/cat.png",
      size: 2048,
      type: "image/png",
    });

    const found = await db.query.uploads.findFirst({ where: eq(uploads.key, FILE_KEY) });
    expect(found?.userId).toBe(TEST_USER.id);
    expect(found?.name).toBe("cat.png");
    expect(found?.url).toBe("https://example.ufs.sh/f/cat.png");
    expect(found?.size).toBe(2048);
    expect(found?.type).toBe("image/png");
  });

  it("upsert is idempotent on a redelivered callback — one row, fields synced", async () => {
    await seedUser();
    await upsertUpload({
      name: "v1.png",
      url: "https://example.ufs.sh/f/v1",
      size: 10,
      type: null,
    });
    // A redelivered callback for the same storage key.
    await upsertUpload({
      name: "v2.png",
      url: "https://example.ufs.sh/f/v2",
      size: 20,
      type: "image/png",
    });

    const rows = await db.select().from(uploads).where(eq(uploads.userId, TEST_USER.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("v2.png");
    expect(rows[0]?.url).toBe("https://example.ufs.sh/f/v2");
    expect(rows[0]?.size).toBe(20);
  });

  it("accepts a null MIME type (Uploadthing occasionally reports it empty)", async () => {
    await seedUser();
    await upsertUpload({ name: "blob", url: "https://example.ufs.sh/f/blob", size: 1, type: null });

    const found = await db.query.uploads.findFirst({ where: eq(uploads.key, FILE_KEY) });
    expect(found?.type).toBeNull();
  });

  it("cascades: deleting the user removes their uploads", async () => {
    await seedUser();
    await upsertUpload({ name: "x", url: "https://example.ufs.sh/f/x", size: 1, type: null });

    await db.delete(user).where(eq(user.id, TEST_USER.id));

    const remaining = await db.select().from(uploads).where(eq(uploads.userId, TEST_USER.id));
    expect(remaining).toHaveLength(0);
  });
});
