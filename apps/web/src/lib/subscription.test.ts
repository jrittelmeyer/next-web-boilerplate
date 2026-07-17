import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @repo/db + drizzle-orm the same way billing.test.ts does — the mocked
// `subscriptions` is a marker object, not real columns, so we just assert the
// query shape passed to `findFirst`.
const { subscriptionsFindFirst } = vi.hoisted(() => ({ subscriptionsFindFirst: vi.fn() }));

vi.mock("@repo/db", () => ({
  db: { query: { subscriptions: { findFirst: subscriptionsFindFirst } } },
  subscriptions: {
    userId: "subscriptions.user_id",
    organizationId: "subscriptions.organization_id",
    createdAt: "subscriptions.created_at",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  desc: vi.fn((col) => ({ desc: col })),
}));

import { hasActiveSubscription, hasOrgSubscription, isSubscriptionActive } from "./subscription";

const NOW = new Date("2026-07-08T12:00:00Z");
const FUTURE = new Date("2026-08-08T12:00:00Z");
const PAST = new Date("2026-06-08T12:00:00Z");

describe("isSubscriptionActive", () => {
  it("is false when there is no subscription row", () => {
    expect(isSubscriptionActive(null, NOW)).toBe(false);
    expect(isSubscriptionActive(undefined, NOW)).toBe(false);
  });

  it("is false for a non-entitling status regardless of period", () => {
    for (const status of ["canceled", "past_due", "unpaid", "incomplete", "paused"]) {
      expect(isSubscriptionActive({ status, currentPeriodEnd: FUTURE }, NOW)).toBe(false);
    }
  });

  it("is true for an active subscription whose period hasn't lapsed", () => {
    expect(isSubscriptionActive({ status: "active", currentPeriodEnd: FUTURE }, NOW)).toBe(true);
  });

  it("is true for a trialing subscription whose period hasn't lapsed", () => {
    expect(isSubscriptionActive({ status: "trialing", currentPeriodEnd: FUTURE }, NOW)).toBe(true);
  });

  it("treats a null currentPeriodEnd as no-expiry-known (status decides)", () => {
    expect(isSubscriptionActive({ status: "active", currentPeriodEnd: null }, NOW)).toBe(true);
  });

  it("is false once an entitling status's period has lapsed", () => {
    expect(isSubscriptionActive({ status: "active", currentPeriodEnd: PAST }, NOW)).toBe(false);
    expect(isSubscriptionActive({ status: "trialing", currentPeriodEnd: PAST }, NOW)).toBe(false);
  });

  it("defaults `now` to the current time when omitted", () => {
    // A far-future period is active under a real `new Date()`; a far-past one isn't.
    expect(isSubscriptionActive({ status: "active", currentPeriodEnd: new Date(8.64e15) })).toBe(
      true,
    );
    expect(isSubscriptionActive({ status: "active", currentPeriodEnd: new Date(0) })).toBe(false);
  });
});

describe("hasActiveSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries the user's newest row by the entitlement columns", async () => {
    subscriptionsFindFirst.mockResolvedValue({ status: "active", currentPeriodEnd: FUTURE });
    await hasActiveSubscription("u1");
    expect(subscriptionsFindFirst).toHaveBeenCalledWith({
      columns: { status: true, currentPeriodEnd: true },
      where: { eq: ["subscriptions.user_id", "u1"] },
      orderBy: [{ desc: "subscriptions.created_at" }],
    });
  });

  it("is true when the newest row is entitling", async () => {
    subscriptionsFindFirst.mockResolvedValue({ status: "active", currentPeriodEnd: FUTURE });
    expect(await hasActiveSubscription("u1")).toBe(true);
  });

  it("is false when the user has no recorded subscription", async () => {
    subscriptionsFindFirst.mockResolvedValue(undefined);
    expect(await hasActiveSubscription("u1")).toBe(false);
  });

  it("is false when the newest row is not entitling", async () => {
    subscriptionsFindFirst.mockResolvedValue({ status: "canceled", currentPeriodEnd: FUTURE });
    expect(await hasActiveSubscription("u1")).toBe(false);
  });
});

describe("hasOrgSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries the org's newest row by the entitlement columns (#11)", async () => {
    subscriptionsFindFirst.mockResolvedValue({ status: "active", currentPeriodEnd: FUTURE });
    await hasOrgSubscription("org1");
    expect(subscriptionsFindFirst).toHaveBeenCalledWith({
      columns: { status: true, currentPeriodEnd: true },
      where: { eq: ["subscriptions.organization_id", "org1"] },
      orderBy: [{ desc: "subscriptions.created_at" }],
    });
  });

  it("is true when the org's newest row is entitling", async () => {
    subscriptionsFindFirst.mockResolvedValue({ status: "trialing", currentPeriodEnd: FUTURE });
    expect(await hasOrgSubscription("org1")).toBe(true);
  });

  it("is false when the org has no recorded subscription", async () => {
    subscriptionsFindFirst.mockResolvedValue(undefined);
    expect(await hasOrgSubscription("org1")).toBe(false);
  });

  it("is false when the org's newest row is not entitling", async () => {
    subscriptionsFindFirst.mockResolvedValue({ status: "past_due", currentPeriodEnd: FUTURE });
    expect(await hasOrgSubscription("org1")).toBe(false);
  });
});
