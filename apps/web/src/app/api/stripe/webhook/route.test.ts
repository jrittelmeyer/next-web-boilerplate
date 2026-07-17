import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit test for the webhook handler's PERSISTENCE branches (C4). The signature /
// rate-limit / config gates are exercised by the integration + gate runs; here we
// mock the seams (the verified Stripe event, the DB writer) and assert the
// `checkout.session.completed` upsert and `customer.subscription.*` update fire with
// the right mapped fields. The real DB round-trip lives in @repo/db's integration
// test (packages/db/__tests__/integration/subscriptions.test.ts); see TESTING.md.
const {
  rateLimitMock,
  clientIpMock,
  isStripeConfigured,
  constructEvent,
  subscriptionsRetrieve,
  dbInsert,
  dbUpdate,
  valuesMock,
  onConflictDoUpdateMock,
  setMock,
  whereMock,
} = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const whereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn(() => ({ where: whereMock }));
  return {
    rateLimitMock: vi.fn(),
    clientIpMock: vi.fn(),
    isStripeConfigured: vi.fn(),
    constructEvent: vi.fn(),
    subscriptionsRetrieve: vi.fn(),
    dbInsert: vi.fn(() => ({ values: valuesMock })),
    dbUpdate: vi.fn(() => ({ set: setMock })),
    valuesMock,
    onConflictDoUpdateMock,
    setMock,
    whereMock,
  };
});

vi.mock("@repo/db", () => ({
  db: { insert: dbInsert, update: dbUpdate },
  // The route uses `subscriptions.id` as the upsert target / eq column; a marker
  // object is enough since drizzle's `eq` is mocked below.
  subscriptions: { id: "subscriptions.id" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn((col, val) => ({ col, val })) }));
// Mock only the two seams the route calls through (the limiter + IP resolver); keep
// the REAL `rateLimitHeaders` (a pure fn) so the 429 branch emits genuine headers.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit: rateLimitMock, clientIpFromHeaders: clientIpMock };
});
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured,
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: subscriptionsRetrieve },
  }),
}));

import { POST } from "./route";

const PERIOD_END_SECONDS = 1790000000; // arbitrary Unix seconds
const SUBSCRIPTION = {
  id: "sub_1",
  status: "active",
  items: { data: [{ price: { id: "price_1" }, current_period_end: PERIOD_END_SECONDS }] },
};

function webhookRequest() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  rateLimitMock.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  clientIpMock.mockReturnValue("test-ip");
  isStripeConfigured.mockReturnValue(true);
  subscriptionsRetrieve.mockResolvedValue(SUBSCRIPTION);
});

describe("checkout.session.completed", () => {
  it("upserts the subscription mapped to the user from session metadata", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { metadata: { userId: "u1" }, subscription: "sub_1", customer: "cus_1" } },
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(subscriptionsRetrieve).toHaveBeenCalledWith("sub_1");
    expect(dbInsert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith({
      id: "sub_1",
      userId: "u1",
      organizationId: null,
      stripeCustomerId: "cus_1",
      status: "active",
      priceId: "price_1",
      currentPeriodEnd: new Date(PERIOD_END_SECONDS * 1000),
    });
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("maps the row to the ORG when metadata carries organizationId (#11)", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "u1", organizationId: "org1" },
          subscription: "sub_1",
          customer: "cus_org",
        },
      },
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(dbInsert).toHaveBeenCalledTimes(1);
    // XOR ownership: the org owns the row; the purchaser's userId stays
    // metadata-only provenance and must NOT land on the row.
    expect(valuesMock).toHaveBeenCalledWith({
      id: "sub_1",
      userId: null,
      organizationId: "org1",
      stripeCustomerId: "cus_org",
      status: "active",
      priceId: "price_1",
      currentPeriodEnd: new Date(PERIOD_END_SECONDS * 1000),
    });
  });

  it("does not write when session metadata lacks an owner (no userId)", async () => {
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { metadata: {}, subscription: "sub_1", customer: "cus_1" } },
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.updated / deleted", () => {
  it("updates status/period by subscription id without inserting", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { ...SUBSCRIPTION, status: "canceled" } },
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({
      status: "canceled",
      priceId: "price_1",
      currentPeriodEnd: new Date(PERIOD_END_SECONDS * 1000),
    });
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(dbInsert).not.toHaveBeenCalled();
  });
});

describe("invoice.payment_failed (P2-4)", () => {
  // The pinned API version carries the invoice→subscription ref at
  // `invoice.parent.subscription_details.subscription` (NOT a top-level
  // `invoice.subscription`); the handler retrieves the subscription for its
  // authoritative post-failure status and updates by id.
  it("retrieves the subscription from the parent ref and syncs its status", async () => {
    subscriptionsRetrieve.mockResolvedValue({ ...SUBSCRIPTION, status: "past_due" });
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: "sub_1" },
          },
        },
      },
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledWith("sub_1");
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({
      status: "past_due",
      priceId: "price_1",
      currentPeriodEnd: new Date(PERIOD_END_SECONDS * 1000),
    });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("normalizes an expanded (object-form) subscription ref", async () => {
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: { id: "sub_1" } },
          },
        },
      },
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledWith("sub_1");
    expect(dbUpdate).toHaveBeenCalledTimes(1);
  });

  it("ignores a non-subscription invoice (no parent subscription ref)", async () => {
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: { parent: null } },
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });
});

describe("gates", () => {
  it("returns 503 when Stripe is unconfigured (no DB write)", async () => {
    isStripeConfigured.mockReturnValue(false);
    const res = await POST(webhookRequest());
    expect(res.status).toBe(503);
    expect(dbInsert).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });
});

describe("rate-limit keying (D10)", () => {
  // Short-circuit after the limiter so these only assert the keying decision: an
  // unconfigured Stripe returns 503 before any signature/DB work.
  beforeEach(() => isStripeConfigured.mockReturnValue(false));

  it("keys a request with a client IP into the per-IP bucket at 100/min", async () => {
    clientIpMock.mockReturnValue("1.2.3.4");
    await POST(webhookRequest());
    expect(rateLimitMock).toHaveBeenCalledWith("webhook:1.2.3.4", { limit: 100, windowSec: 60 });
  });

  it("keys an IP-less request into a tighter shared `noip` bucket at 20/min", async () => {
    clientIpMock.mockReturnValue(null);
    await POST(webhookRequest());
    expect(rateLimitMock).toHaveBeenCalledWith("webhook:noip", { limit: 20, windowSec: 60 });
  });

  it("returns 429 with the standard rate-limit headers when the limiter rejects", async () => {
    rateLimitMock.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: Date.now() });
    const res = await POST(webhookRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(res.headers.get("RateLimit-Limit")).toBe("20");
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");
  });
});
