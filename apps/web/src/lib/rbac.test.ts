import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the authority sources: Better Auth's session API and the DB role read.
// `@repo/db/schema` (the `user` table + `Role` type) and `drizzle-orm`'s `eq` stay
// real — they're pure and pool-free. Hoisted so the vi.mock factories can use them.
const { getSession, findFirst } = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({ db: { query: { user: { findFirst } } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { getUserRole, requireAdmin } from "./rbac";

beforeEach(() => vi.clearAllMocks());

describe("getUserRole", () => {
  it("returns the role straight from the DB row", async () => {
    findFirst.mockResolvedValue({ role: "admin" });
    expect(await getUserRole("u1")).toBe("admin");
  });

  it("returns null when the user no longer exists", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await getUserRole("ghost")).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("returns null when there is no session", async () => {
    getSession.mockResolvedValue(null);
    expect(await requireAdmin()).toBeNull();
  });

  it("returns null when the user's fresh role is not admin", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    findFirst.mockResolvedValue({ role: "user" });
    expect(await requireAdmin()).toBeNull();
  });

  it("returns the session + role for an admin", async () => {
    const session = { user: { id: "u1" } };
    getSession.mockResolvedValue(session);
    findFirst.mockResolvedValue({ role: "admin" });
    expect(await requireAdmin()).toEqual({ session, role: "admin" });
  });
});
