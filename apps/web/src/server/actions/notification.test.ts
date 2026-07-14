import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock everything the action reaches: Better Auth session, the DB write builders, the
// rate limiter, `notify` (the NOTIFY publish), and Next headers. The real `@repo/db/schema`
// tables stay unmocked (pure). The DB chains are `insert().values().returning()` and
// `update().set().where().returning()`, so each mock returns the next link.
const { getSession, dbInsert, dbUpdate, notifyMock, rateLimitMock } = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  notifyMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({
  db: { insert: dbInsert, update: dbUpdate },
  notify: notifyMock,
  NOTIFICATIONS_CHANNEL: "notifications",
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { markAllRead, sendTestNotification } from "./notification";

const ROW = {
  id: "n1",
  userId: "u1",
  type: "test" as const,
  body: "Test notification · 12:00:00 AM",
  read: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** Wire `db.insert().values().returning()` to resolve to `rows`. */
function primeInsert(rows: unknown[]) {
  dbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }),
  });
}
/** Wire `db.update().set().where().returning()` to resolve to `rows`. */
function primeUpdate(rows: unknown[]) {
  dbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }),
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  rateLimitMock.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
});

describe("sendTestNotification", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await sendTestNotification()).toEqual({ error: "Unauthorized" });
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMock.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    expect(await sendTestNotification()).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    expect(dbInsert).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("returns an error when the insert returns no row", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    primeInsert([]);
    expect(await sendTestNotification()).toEqual({ error: "Failed to create notification." });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("persists the row and broadcasts it over NOTIFY on success", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    primeInsert([ROW]);

    expect(await sendTestNotification()).toEqual({ data: { id: "n1" } });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [channel, payload] = notifyMock.mock.calls[0] ?? [];
    expect(channel).toBe("notifications");
    // createdAt is sent as an ISO STRING (round-trips through JSON.stringify + SSE).
    expect(payload).toEqual({
      id: "n1",
      userId: "u1",
      type: "test",
      body: ROW.body,
      read: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("markAllRead", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await markAllRead()).toEqual({ error: "Unauthorized" });
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("returns the count of notifications it flipped to read", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    primeUpdate([{ id: "n1" }, { id: "n2" }]);
    expect(await markAllRead()).toEqual({ data: { updated: 2 } });
  });
});
