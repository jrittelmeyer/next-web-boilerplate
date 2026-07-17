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
  getActiveOrganizationId,
  getOrgRole,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  subscriptionsFindFirst: vi.fn(),
  rateLimitMock: vi.fn(),
  isStripeConfigured: vi.fn(),
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  getOrgRole: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({
  db: { query: { subscriptions: { findFirst: subscriptionsFindFirst } } },
  subscriptions: {
    userId: "subscriptions.user_id",
    organizationId: "subscriptions.organization_id",
    createdAt: "subscriptions.created_at",
  },
}));
// The context helpers are mocked (their own behavior is pinned by
// organization.test.ts); isOrgAdminRole keeps its real semantics inline so the
// action's gate reads naturally in the org-context tests below.
vi.mock("@/lib/organization", () => ({
  getActiveOrganizationId,
  getOrgRole,
  isOrgAdminRole: (role: string | null) => role === "owner" || role === "admin",
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
  // Default context: personal workspace (no active org).
  getActiveOrganizationId.mockResolvedValue(null);
  getOrgRole.mockResolvedValue(null);
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

describe("org billing context (#11)", () => {
  const asOrgContext = (role: string | null) => {
    getActiveOrganizationId.mockResolvedValue("org1");
    getOrgRole.mockResolvedValue(role);
  };

  it("blocks a plain member from checkout — before the Stripe config gate", async () => {
    asOrgContext("member");
    // Unconfigured on purpose: the role gate must fire first, so the member
    // error is exercisable keyless (same ordering posture as the rate limit).
    isStripeConfigured.mockReturnValue(false);
    expect(await createCheckoutSession()).toEqual({
      error: "Only organization owners and admins can manage billing.",
    });
    expect(getOrgRole).toHaveBeenCalledWith("org1", "u1");
    expect(subscriptionsFindFirst).not.toHaveBeenCalled();
  });

  it("blocks a non-member (no role) from checkout", async () => {
    asOrgContext(null);
    expect(await createCheckoutSession()).toEqual({
      error: "Only organization owners and admins can manage billing.",
    });
  });

  it("lets an org owner check out — org-keyed reuse lookup + org metadata", async () => {
    asOrgContext("owner");
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/cs_org" });
    expect(await createCheckoutSession()).toEqual({
      data: { url: "https://checkout.stripe.test/cs_org" },
    });
    // The reuse lookup is keyed by the ORG, not the purchaser.
    expect(subscriptionsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { col: "subscriptions.organization_id", val: "org1" } }),
    );
    const params = checkoutCreate.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      customer_email: "u1@example.com",
      metadata: { userId: "u1", organizationId: "org1" },
    });
  });

  it("reuses the org's recorded Stripe customer on a repeat org checkout", async () => {
    asOrgContext("admin");
    subscriptionsFindFirst.mockResolvedValue({ id: "sub_org", stripeCustomerId: "cus_org" });
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/cs_org2" });
    await createCheckoutSession();
    const params = checkoutCreate.mock.calls[0]?.[0];
    expect(params).toMatchObject({ customer: "cus_org" });
    expect(params).not.toHaveProperty("customer_email");
  });

  it("omits organizationId from metadata in the personal workspace", async () => {
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/cs_p" });
    await createCheckoutSession();
    expect(checkoutCreate.mock.calls[0]?.[0]?.metadata).toEqual({ userId: "u1" });
  });

  it("blocks a plain member from the billing portal", async () => {
    asOrgContext("member");
    expect(await createBillingPortalSession()).toEqual({
      error: "Only organization owners and admins can manage billing.",
    });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("types the no-history portal error to the org context", async () => {
    asOrgContext("owner");
    expect(await createBillingPortalSession()).toEqual({
      error: "No billing history for this organization.",
    });
  });

  it("opens the portal for the ORG's recorded customer", async () => {
    asOrgContext("owner");
    subscriptionsFindFirst.mockResolvedValue({ id: "sub_org", stripeCustomerId: "cus_org" });
    portalCreate.mockResolvedValue({ url: "https://portal.stripe.test/bps_org" });
    expect(await createBillingPortalSession()).toEqual({
      data: { url: "https://portal.stripe.test/bps_org" },
    });
    expect(subscriptionsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { col: "subscriptions.organization_id", val: "org1" } }),
    );
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_org",
      return_url: "http://localhost:3000/billing",
    });
  });
});
