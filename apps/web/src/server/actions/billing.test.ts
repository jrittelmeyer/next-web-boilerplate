import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock everything the actions reach for (the uploads.test.ts pattern): Better
// Auth session, the DB client, the rate limiter, the Stripe helper, the logger,
// env, and Next's headers. drizzle-orm is mocked like the webhook route test —
// the mocked `@repo/db` exports a marker `subscriptions`, not real columns.
const {
  getSession,
  subscriptionsFindFirst,
  rateLimitMock,
  isStripeConfigured,
  checkoutCreate,
  portalCreate,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  subscriptionsFindFirst: vi.fn(),
  rateLimitMock: vi.fn(),
  isStripeConfigured: vi.fn(),
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({
  db: { query: { subscriptions: { findFirst: subscriptionsFindFirst } } },
  subscriptions: { userId: "subscriptions.user_id", createdAt: "subscriptions.created_at" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  desc: vi.fn((col) => ({ col, dir: "desc" })),
}));
// `@/env` needs no mock — vitest.config.ts aliases it to test/env.stub.ts, whose
// BETTER_AUTH_URL ("http://localhost:3000") the URL assertions below rely on.
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured,
  getStripe: () => ({
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
  }),
}));
vi.mock("@logtail/next", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { createBillingPortalSession, createCheckoutSession } from "./billing";

const SESSION = { user: { id: "u1", email: "u1@example.com" } };
const SUBSCRIPTION_ROW = { id: "sub_1", stripeCustomerId: "cus_1" };

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue(SESSION);
  rateLimitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
  isStripeConfigured.mockReturnValue(true);
  subscriptionsFindFirst.mockResolvedValue(undefined);
});

describe("createCheckoutSession", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await createCheckoutSession()).toEqual({ error: "Unauthorized" });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 0 });
    expect(await createCheckoutSession()).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    expect(rateLimitMock).toHaveBeenCalledWith("checkout:u1", { limit: 5, windowSec: 60 });
  });

  it("degrades gracefully when Stripe is unconfigured (before any DB read)", async () => {
    isStripeConfigured.mockReturnValue(false);
    expect(await createCheckoutSession()).toEqual({
      error: "Stripe is not configured (set STRIPE_SECRET_KEY).",
    });
    expect(subscriptionsFindFirst).not.toHaveBeenCalled();
  });

  it("prefills customer_email on a first checkout (no recorded subscription)", async () => {
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/cs_1" });
    expect(await createCheckoutSession()).toEqual({
      data: { url: "https://checkout.stripe.test/cs_1" },
    });
    const params = checkoutCreate.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      mode: "subscription",
      customer_email: "u1@example.com",
      metadata: { userId: "u1" },
    });
    expect(params).not.toHaveProperty("customer");
  });

  it("reuses the recorded Stripe customer on a repeat checkout", async () => {
    subscriptionsFindFirst.mockResolvedValue(SUBSCRIPTION_ROW);
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/cs_2" });
    expect(await createCheckoutSession()).toEqual({
      data: { url: "https://checkout.stripe.test/cs_2" },
    });
    const params = checkoutCreate.mock.calls[0]?.[0];
    expect(params).toMatchObject({ customer: "cus_1" });
    expect(params).not.toHaveProperty("customer_email");
  });

  it("returns a typed error when the Stripe call throws (e.g. stale customer id)", async () => {
    subscriptionsFindFirst.mockResolvedValue(SUBSCRIPTION_ROW);
    checkoutCreate.mockRejectedValue(new Error("No such customer: cus_1"));
    expect(await createCheckoutSession()).toEqual({
      error: "Could not start checkout. Please try again.",
    });
  });

  it("returns a typed error when Stripe omits the checkout URL", async () => {
    checkoutCreate.mockResolvedValue({ url: null });
    expect(await createCheckoutSession()).toEqual({
      error: "Stripe did not return a checkout URL.",
    });
  });
});

describe("createBillingPortalSession", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await createBillingPortalSession()).toEqual({ error: "Unauthorized" });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 0 });
    expect(await createBillingPortalSession()).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    expect(rateLimitMock).toHaveBeenCalledWith("billing-portal:u1", { limit: 5, windowSec: 60 });
  });

  it("degrades gracefully when Stripe is unconfigured", async () => {
    isStripeConfigured.mockReturnValue(false);
    expect(await createBillingPortalSession()).toEqual({
      error: "Stripe is not configured (set STRIPE_SECRET_KEY).",
    });
    expect(subscriptionsFindFirst).not.toHaveBeenCalled();
  });

  it("returns a typed error when the caller has no recorded subscription", async () => {
    expect(await createBillingPortalSession()).toEqual({
      error: "No billing history for this account.",
    });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("opens the portal for the recorded customer with a /billing return URL", async () => {
    subscriptionsFindFirst.mockResolvedValue(SUBSCRIPTION_ROW);
    portalCreate.mockResolvedValue({ url: "https://portal.stripe.test/bps_1" });
    expect(await createBillingPortalSession()).toEqual({
      data: { url: "https://portal.stripe.test/bps_1" },
    });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "http://localhost:3000/billing",
    });
  });

  it("returns a typed error when the Stripe call throws", async () => {
    subscriptionsFindFirst.mockResolvedValue(SUBSCRIPTION_ROW);
    portalCreate.mockRejectedValue(new Error("boom"));
    expect(await createBillingPortalSession()).toEqual({
      error: "Could not open the billing portal. Please try again.",
    });
  });
});
