import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the @repo/db LISTEN transport so the bus can be exercised without a real
// Postgres connection: createPgListener captures the handlers the bus wires up, so a
// test can drive `onNotification(payload)` and assert the in-process fan-out. The
// per-user filtering is security-critical (a payload for one user must NEVER reach
// another user's subscribers), so it gets its own focused test.
const { createPgListener, closeMock } = vi.hoisted(() => ({
  createPgListener: vi.fn(),
  closeMock: vi.fn(async () => {}),
}));

vi.mock("@repo/db", () => ({ createPgListener, NOTIFICATIONS_CHANNEL: "notifications" }));

import { NotificationBus } from "./notification-bus";

type Handlers = {
  onNotification: (payload: string | undefined) => void;
  onError: (error: Error) => void;
};

let capturedHandlers: Handlers | undefined;

function payload(userId: string, over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "n1",
    userId,
    type: "test",
    body: "hi",
    read: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });
}

/** The handlers the bus wired into its (mocked) listener — available after the first
 * subscribe boots it. */
function handlers(): Handlers {
  if (!capturedHandlers) throw new Error("listener not booted");
  return capturedHandlers;
}

/** Subscribe then wait for the lazily-booted listener to be captured. */
async function subscribeAndBoot(bus: NotificationBus, userId: string, handler: () => void) {
  const unsubscribe = bus.subscribe(userId, handler);
  await vi.waitFor(() => expect(createPgListener).toHaveBeenCalled());
  return unsubscribe;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedHandlers = undefined;
  createPgListener.mockImplementation(async (_channel: string, h: Handlers) => {
    capturedHandlers = h;
    return { close: closeMock };
  });
});

describe("NotificationBus", () => {
  it("delivers a notification only to the matching user's subscribers", async () => {
    const bus = new NotificationBus();
    const alice = vi.fn();
    const bob = vi.fn();
    await subscribeAndBoot(bus, "alice", alice);
    bus.subscribe("bob", bob);

    handlers().onNotification(payload("alice", { id: "a1" }));

    expect(alice).toHaveBeenCalledTimes(1);
    expect(alice.mock.calls[0]?.[0]).toMatchObject({ id: "a1", userId: "alice" });
    expect(bob).not.toHaveBeenCalled();
  });

  it("opens exactly one shared listener across many subscribers", async () => {
    const bus = new NotificationBus();
    await subscribeAndBoot(bus, "u1", vi.fn());
    bus.subscribe("u2", vi.fn());
    bus.subscribe("u1", vi.fn());
    // A brief flush window to catch any accidental second boot.
    await vi.waitFor(() => expect(createPgListener).toHaveBeenCalledTimes(1));
  });

  it("fans out to every subscriber of the same user", async () => {
    const bus = new NotificationBus();
    const one = vi.fn();
    const two = vi.fn();
    await subscribeAndBoot(bus, "u1", one);
    bus.subscribe("u1", two);

    handlers().onNotification(payload("u1"));

    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", async () => {
    const bus = new NotificationBus();
    const handler = vi.fn();
    const unsubscribe = await subscribeAndBoot(bus, "u1", handler);

    unsubscribe();
    handlers().onNotification(payload("u1"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a malformed (non-JSON) payload without throwing", async () => {
    const bus = new NotificationBus();
    const handler = vi.fn();
    await subscribeAndBoot(bus, "u1", handler);

    expect(() => handlers().onNotification("}{not json")).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a payload that fails schema validation", async () => {
    const bus = new NotificationBus();
    const handler = vi.fn();
    await subscribeAndBoot(bus, "u1", handler);

    // Missing required fields (userId etc.) → safeParse fails → dropped.
    handlers().onNotification(JSON.stringify({ id: "x" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps delivering to healthy handlers when one throws", async () => {
    const bus = new NotificationBus();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    await subscribeAndBoot(bus, "u1", bad);
    bus.subscribe("u1", good);

    expect(() => handlers().onNotification(payload("u1"))).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
