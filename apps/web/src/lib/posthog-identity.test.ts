import { beforeEach, describe, expect, it, vi } from "vitest";
import { type PostHogLike, syncPostHogIdentity } from "./posthog-identity";

const USER = { id: "u1", email: "u1@example.com", name: "User One" };

function mockPostHog(distinctId: string) {
  return {
    get_distinct_id: vi.fn<PostHogLike["get_distinct_id"]>(() => distinctId),
    identify: vi.fn<PostHogLike["identify"]>(),
    reset: vi.fn<PostHogLike["reset"]>(),
  };
}

let ph: ReturnType<typeof mockPostHog>;

beforeEach(() => {
  ph = mockPostHog("anon-123");
});

describe("syncPostHogIdentity", () => {
  it("identifies a signed-in user still carrying an anonymous id", () => {
    expect(syncPostHogIdentity(ph, USER, false)).toBe(true);
    expect(ph.identify).toHaveBeenCalledWith("u1", { email: "u1@example.com", name: "User One" });
    expect(ph.reset).not.toHaveBeenCalled();
  });

  it("omits an empty name from the person properties", () => {
    expect(syncPostHogIdentity(ph, { ...USER, name: "" }, false)).toBe(true);
    expect(ph.identify).toHaveBeenCalledWith("u1", { email: "u1@example.com" });
  });

  it("is a no-op when PostHog already carries the user id (e.g. a reload)", () => {
    ph = mockPostHog("u1");
    expect(syncPostHogIdentity(ph, USER, false)).toBe(true);
    expect(ph.identify).not.toHaveBeenCalled();
    expect(ph.reset).not.toHaveBeenCalled();
  });

  it("stays active without calls while the session persists", () => {
    ph = mockPostHog("u1");
    expect(syncPostHogIdentity(ph, USER, true)).toBe(true);
    expect(ph.identify).not.toHaveBeenCalled();
    expect(ph.reset).not.toHaveBeenCalled();
  });

  it("resets on a sign-out transition", () => {
    expect(syncPostHogIdentity(ph, null, true)).toBe(false);
    expect(ph.reset).toHaveBeenCalledTimes(1);
    expect(ph.identify).not.toHaveBeenCalled();
  });

  it("does not reset a signed-out visitor who was never signed in this pageload", () => {
    expect(syncPostHogIdentity(ph, null, false)).toBe(false);
    expect(ph.reset).not.toHaveBeenCalled();
  });

  it("resets before identifying on a direct user-A→user-B switch", () => {
    ph = mockPostHog("uA");
    const userB = { id: "uB", email: "b@example.com", name: "B" };
    expect(syncPostHogIdentity(ph, userB, true)).toBe(true);
    expect(ph.reset).toHaveBeenCalledTimes(1);
    expect(ph.identify).toHaveBeenCalledWith("uB", { email: "b@example.com", name: "B" });
    // reset must precede identify so A's events never merge into B.
    expect(ph.reset.mock.invocationCallOrder[0]).toBeLessThan(
      ph.identify.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
