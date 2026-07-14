import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Better Auth's session read, the rate limiter, Next headers, and the DB query
// surface. `buildDataExport` (lib/data-export.ts) stays REAL — it's the 100%-tested pure
// core, so exercising it here also proves the action wires raw rows into it correctly.
const { getSession, rateLimitMock, query } = vi.hoisted(() => {
  const findMany = () => vi.fn().mockResolvedValue([]);
  return {
    getSession: vi.fn(),
    rateLimitMock: vi.fn(),
    query: {
      user: { findFirst: vi.fn() },
      account: { findMany: findMany() },
      session: { findMany: findMany() },
      posts: { findMany: findMany() },
      postRevisions: { findMany: findMany() },
      uploads: { findMany: findMany() },
      subscriptions: { findMany: findMany() },
      twoFactor: { findMany: findMany() },
      passkey: { findMany: findMany() },
      member: { findMany: findMany() },
      invitation: { findMany: findMany() },
      auditLog: { findMany: findMany() },
      organization: { findMany: findMany() },
    },
  };
});

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({ db: { query } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { exportMyData } from "./data-export";

const D = new Date("2026-01-01T00:00:00.000Z");
const USER_ROW = {
  id: "u1",
  name: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  image: null,
  role: "user",
  twoFactorEnabled: false,
  createdAt: D,
  updatedAt: D,
};

beforeEach(() => {
  vi.resetAllMocks();
  rateLimitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
  // Re-prime the array reads after resetAllMocks (which clears implementations).
  for (const table of [
    "account",
    "session",
    "posts",
    "postRevisions",
    "uploads",
    "subscriptions",
    "twoFactor",
    "passkey",
    "member",
    "invitation",
    "auditLog",
    "organization",
  ] as const) {
    query[table].findMany.mockResolvedValue([]);
  }
});

describe("exportMyData", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await exportMyData()).toEqual({ error: "Unauthorized" });
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMock.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 0 });
    expect(await exportMyData()).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    expect(query.user.findFirst).not.toHaveBeenCalled();
  });

  it("treats a session whose user row is gone as unauthorized", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    query.user.findFirst.mockResolvedValue(undefined);
    expect(await exportMyData()).toEqual({ error: "Unauthorized" });
  });

  it("returns a dated filename and a parseable, redaction-shaped JSON bundle", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    query.user.findFirst.mockResolvedValue(USER_ROW);

    const result = await exportMyData();
    expect("data" in result).toBe(true);
    if (!("data" in result)) return;

    expect(result.data.filename).toMatch(/^my-data-export-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = JSON.parse(result.data.json);
    expect(parsed.manifest.userId).toBe("u1");
    expect(parsed.manifest.schemaVersion).toBe(1);
    expect(parsed.profile.email).toBe("ada@example.com");
    // No org lookup when the user has no memberships.
    expect(query.organization.findMany).not.toHaveBeenCalled();
  });

  it("looks up organizations when the user has memberships", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    query.user.findFirst.mockResolvedValue(USER_ROW);
    query.member.findMany.mockResolvedValue([
      { id: "m1", organizationId: "org1", userId: "u1", role: "owner", createdAt: D, updatedAt: D },
    ]);
    query.organization.findMany.mockResolvedValue([
      {
        id: "org1",
        name: "Acme",
        slug: "acme",
        logo: null,
        metadata: null,
        createdAt: D,
        updatedAt: D,
      },
    ]);

    const result = await exportMyData();
    if (!("data" in result)) throw new Error("expected data");
    expect(query.organization.findMany).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.data.json);
    expect(parsed.organizations).toEqual([
      {
        organizationId: "org1",
        name: "Acme",
        slug: "acme",
        role: "owner",
        createdAt: D.toISOString(),
      },
    ]);
  });
});
