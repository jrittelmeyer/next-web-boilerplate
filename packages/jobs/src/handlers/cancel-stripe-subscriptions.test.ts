import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Stripe SDK so the handler is tested in isolation — no network, no key.
// `subscriptions.cancel` is the only method the handler calls; the mock class also
// exposes the static `errors.StripeInvalidRequestError` the handler uses to detect
// an already-canceled/missing subscription. Hoisted so the vi.mock factory (which is
// itself hoisted above the imports) can close over them.
const { cancel, StripeInvalidRequestError } = vi.hoisted(() => {
  class StripeInvalidRequestError extends Error {}
  return { cancel: vi.fn(), StripeInvalidRequestError };
});
vi.mock("stripe", () => {
  class MockStripe {
    subscriptions = { cancel: (...args: unknown[]) => cancel(...args) };
    static errors = { StripeInvalidRequestError };
  }
  return { default: MockStripe };
});

const { handleCancelStripeSubscriptions } = await import("./cancel-stripe-subscriptions");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("handleCancelStripeSubscriptions", () => {
  it("cancels each subscription id when Stripe is configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    cancel.mockResolvedValue({});

    await expect(
      handleCancelStripeSubscriptions({ userId: "u1", subscriptionIds: ["sub_a", "sub_b"] }),
    ).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledWith("sub_a");
    expect(cancel).toHaveBeenCalledWith("sub_b");
  });

  it("completes without a remote call when Stripe is unconfigured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    await expect(
      handleCancelStripeSubscriptions({ userId: "u1", subscriptionIds: ["sub_a"] }),
    ).resolves.toBeUndefined();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("tolerates an already-canceled / missing subscription and continues", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    cancel
      .mockRejectedValueOnce(new StripeInvalidRequestError("No such subscription"))
      .mockResolvedValueOnce({});

    await expect(
      handleCancelStripeSubscriptions({ userId: "u1", subscriptionIds: ["sub_gone", "sub_b"] }),
    ).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("throws (→ pg-boss retry) on an unexpected Stripe error", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    cancel.mockRejectedValue(new Error("network down"));

    await expect(
      handleCancelStripeSubscriptions({ userId: "u1", subscriptionIds: ["sub_a"] }),
    ).rejects.toThrow(/network down/);
  });

  it("rejects an invalid payload before attempting anything", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");

    await expect(
      handleCancelStripeSubscriptions({ userId: "u1", subscriptionIds: [] }),
    ).rejects.toThrow();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("accepts an org-deletion payload (#11) and cancels the same way", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    cancel.mockResolvedValue({});

    await expect(
      handleCancelStripeSubscriptions({
        userId: "u1",
        organizationId: "org1",
        subscriptionIds: ["sub_org"],
      }),
    ).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledWith("sub_org");
  });
});
