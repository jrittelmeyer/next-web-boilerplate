import { db, notifications, user } from "@repo/db";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Per-user notification scoping, against a REAL Postgres (predicate-sensor long
 * tail). `markAllRead` (server/actions/notification.ts) and `unreadCount`
 * (server/trpc/routers/notification.ts) both live in apps/web, which this
 * package cannot depend on — restated here, as the calendar suites restate
 * their siblings' router/action predicates.
 */

const OWNER = {
  id: "integration-test-notifications-owner",
  name: "Integration Test Notifications Owner",
  email: "integration-test-notifications-owner@example.com",
  emailVerified: true,
} as const;

const OTHER_USER = {
  id: "integration-test-notifications-other",
  name: "Integration Test Notifications Other",
  email: "integration-test-notifications-other@example.com",
  emailVerified: true,
} as const;

async function cleanup() {
  // notifications.user_id cascades, so deleting the two users is the whole cleanup.
  for (const id of [OWNER.id, OTHER_USER.id]) {
    await db.delete(user).where(eq(user.id, id));
  }
}

async function seedUnread(userId: string, body: string) {
  await db.insert(notifications).values({ userId, type: "test", body, title: null });
}

beforeEach(async () => {
  await cleanup();
  await db.insert(user).values([OWNER, OTHER_USER]);
  await seedUnread(OWNER.id, "owner's first");
  await seedUnread(OWNER.id, "owner's second");
  await seedUnread(OTHER_USER.id, "other's notification");
});

afterAll(cleanup);

describe("markAllRead's owner arm (predicate-sensor long tail)", () => {
  /** `notification.ts:73-77`'s UPDATE, restated. */
  async function markAllRead(userId: string, scoped: boolean) {
    return await db
      .update(notifications)
      .set({ read: true })
      .where(
        scoped
          ? and(eq(notifications.userId, userId), eq(notifications.read, false))
          : eq(notifications.read, false),
      )
      .returning({ id: notifications.id });
  }

  it("flips only the caller's own unread rows", async () => {
    const updated = await markAllRead(OWNER.id, true);
    expect(updated).toHaveLength(2);
    const [otherRow] = await db
      .select({ read: notifications.read })
      .from(notifications)
      .where(eq(notifications.userId, OTHER_USER.id));
    expect(otherRow?.read).toBe(false);
  });

  it("flips every user's unread rows under the spelling without the userId conjunct — the defect", async () => {
    // Not asserted by count: an unscoped UPDATE touches whatever else the shared
    // integration database happens to hold unread at the moment. What discriminates
    // the defect is that a co-tenant's row — never named in this call — flips too.
    await markAllRead(OWNER.id, false);
    const [otherRow] = await db
      .select({ read: notifications.read })
      .from(notifications)
      .where(eq(notifications.userId, OTHER_USER.id));
    expect(otherRow?.read).toBe(true);
  });
});

describe("unreadCount's cross-user arm (predicate-sensor long tail)", () => {
  /** `notification.ts` (trpc router) `unreadCount`'s aggregate, restated. */
  async function unreadCount(userId: string, scoped: boolean) {
    const [row] = await db
      .select({ value: count() })
      .from(notifications)
      .where(
        scoped
          ? and(eq(notifications.userId, userId), eq(notifications.read, false))
          : eq(notifications.read, false),
      );
    return row?.value ?? 0;
  }

  it("counts only the caller's own unread rows", async () => {
    expect(await unreadCount(OWNER.id, true)).toBe(2);
  });

  it("counts every user's unread rows under the spelling without the userId conjunct — the defect", async () => {
    // Not asserted against a fixed total for the same reason as markAllRead's defect
    // test above; what discriminates is that dropping the conjunct can only ever
    // WIDEN the count relative to the correctly-scoped read.
    const scoped = await unreadCount(OWNER.id, true);
    const unscoped = await unreadCount(OWNER.id, false);
    expect(unscoped).toBeGreaterThan(scoped);
  });
});
