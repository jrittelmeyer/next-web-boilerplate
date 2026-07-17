import { db, organization, subscriptions, user } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * DB-backed integration test for the `subscriptions` entity (Phase 3 · C4). It runs
 * the actual SQL behind the Stripe webhook handler
 * (apps/web/src/app/api/stripe/webhook/route.ts) against a REAL Postgres — no mocks —
 * so it proves the schema, the upsert (`checkout.session.completed`), the
 * update-by-id sync (`customer.subscription.updated`/`deleted`), and the FK cascade.
 * The handler imports `@/env` + `server-only` + `stripe`, so we exercise the data
 * layer here in `@repo/db` rather than importing the route (see TESTING.md).
 *
 * Scoped to a dedicated test user so it cleans up after itself (the FK cascade does
 * the work) WITHOUT touching db:seed rows.
 */
const TEST_USER = {
  id: "integration-test-subscriber",
  name: "Integration Test Subscriber",
  email: "integration-test-subscriber@example.com",
  emailVerified: true,
} as const;

const SUB_ID = "sub_integration_test";
const CUSTOMER_ID = "cus_integration_test";

// Mirrors the handler's `checkout.session.completed` write: upsert keyed by the
// Stripe subscription id (insert, or update the synced fields on a redelivery).
async function upsertSubscription(fields: {
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
}) {
  await db
    .insert(subscriptions)
    .values({ id: SUB_ID, userId: TEST_USER.id, stripeCustomerId: CUSTOMER_ID, ...fields })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: { stripeCustomerId: CUSTOMER_ID, ...fields },
    });
}

// Deleting the user cascades to its subscriptions (onDelete: cascade), so this is
// the only cleanup needed.
async function cleanup() {
  await db.delete(user).where(eq(user.id, TEST_USER.id));
}

async function seedUser() {
  await db.insert(user).values(TEST_USER);
}

describe("subscriptions (integration)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("upserts a subscription from checkout and reads it back by id", async () => {
    await seedUser();
    const periodEnd = new Date("2026-07-01T00:00:00Z");
    await upsertSubscription({
      status: "active",
      priceId: "price_123",
      currentPeriodEnd: periodEnd,
    });

    const found = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, SUB_ID) });
    expect(found?.userId).toBe(TEST_USER.id);
    expect(found?.stripeCustomerId).toBe(CUSTOMER_ID);
    expect(found?.status).toBe("active");
    expect(found?.priceId).toBe("price_123");
    expect(found?.currentPeriodEnd?.toISOString()).toBe(periodEnd.toISOString());
  });

  it("upsert is idempotent on redelivery — one row, fields synced", async () => {
    await seedUser();
    await upsertSubscription({ status: "trialing", priceId: "price_123", currentPeriodEnd: null });
    // A redelivered/updated checkout event for the same subscription id.
    await upsertSubscription({
      status: "active",
      priceId: "price_456",
      currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
    });

    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, TEST_USER.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.priceId).toBe("price_456");
  });

  it("syncs status via update-by-id (customer.subscription.updated/deleted)", async () => {
    await seedUser();
    await upsertSubscription({ status: "active", priceId: "price_123", currentPeriodEnd: null });

    // Mirrors the handler's customer.subscription.* branch: update by id only.
    await db
      .update(subscriptions)
      .set({ status: "canceled", priceId: "price_123", currentPeriodEnd: null })
      .where(eq(subscriptions.id, SUB_ID));

    const found = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, SUB_ID) });
    expect(found?.status).toBe("canceled");
  });

  it("update-by-id is a no-op when no row exists (subscription outside checkout)", async () => {
    await seedUser();
    // No upsert first — an updated/deleted event we never saw a checkout for.
    await db
      .update(subscriptions)
      .set({ status: "canceled", priceId: null, currentPeriodEnd: null })
      .where(eq(subscriptions.id, SUB_ID));

    const found = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, SUB_ID) });
    expect(found).toBeUndefined();
  });

  it("cascades: deleting the user removes their subscriptions", async () => {
    await seedUser();
    await upsertSubscription({ status: "active", priceId: "price_123", currentPeriodEnd: null });

    await db.delete(user).where(eq(user.id, TEST_USER.id));

    const remaining = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, TEST_USER.id));
    expect(remaining).toHaveLength(0);
  });
});

/**
 * Org-owned subscriptions (path-to-100 #11): prove the XOR ownership on real
 * Postgres — the `subscriptions_owner_check` constraint (migration 0017) and the
 * organization-delete cascade, i.e. the schema behaviors the org-billing flow
 * (org-context checkout → webhook org mapping) relies on.
 */
const TEST_ORG = {
  id: "integration-test-org",
  name: "Integration Test Org",
  slug: "integration-test-org",
} as const;

const ORG_SUB_ID = "sub_integration_test_org";

// Drizzle wraps the Postgres error ("Failed query: …"), keeping the driver error —
// whose message names the violated constraint — on `cause`.
function violatesOwnerCheck(err: unknown): boolean {
  return err instanceof Error && String(err.cause).includes("subscriptions_owner_check");
}

describe("subscriptions — org ownership (integration, #11)", () => {
  async function orgCleanup() {
    await db.delete(organization).where(eq(organization.id, TEST_ORG.id));
  }
  beforeEach(orgCleanup);
  afterAll(orgCleanup);

  it("inserts an org-owned row (no userId) — the webhook's org mapping", async () => {
    await db.insert(organization).values(TEST_ORG);
    await db.insert(subscriptions).values({
      id: ORG_SUB_ID,
      userId: null,
      organizationId: TEST_ORG.id,
      stripeCustomerId: "cus_integration_org",
      status: "active",
    });

    const found = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, ORG_SUB_ID),
    });
    expect(found?.organizationId).toBe(TEST_ORG.id);
    expect(found?.userId).toBeNull();
  });

  it("rejects an ownerless row (XOR check: neither user nor org)", async () => {
    await expect(
      db.insert(subscriptions).values({
        id: ORG_SUB_ID,
        userId: null,
        organizationId: null,
        stripeCustomerId: "cus_integration_org",
        status: "active",
      }),
    ).rejects.toSatisfy(violatesOwnerCheck);
  });

  it("rejects a doubly-owned row (XOR check: both user and org)", async () => {
    await db.insert(user).values(TEST_USER);
    await db.insert(organization).values(TEST_ORG);
    try {
      await expect(
        db.insert(subscriptions).values({
          id: ORG_SUB_ID,
          userId: TEST_USER.id,
          organizationId: TEST_ORG.id,
          stripeCustomerId: "cus_integration_org",
          status: "active",
        }),
      ).rejects.toSatisfy(violatesOwnerCheck);
    } finally {
      await db.delete(user).where(eq(user.id, TEST_USER.id));
    }
  });

  it("cascades: deleting the organization removes its subscriptions", async () => {
    await db.insert(organization).values(TEST_ORG);
    await db.insert(subscriptions).values({
      id: ORG_SUB_ID,
      organizationId: TEST_ORG.id,
      stripeCustomerId: "cus_integration_org",
      status: "active",
    });

    await db.delete(organization).where(eq(organization.id, TEST_ORG.id));

    const remaining = await db.select().from(subscriptions).where(eq(subscriptions.id, ORG_SUB_ID));
    expect(remaining).toHaveLength(0);
  });
});
