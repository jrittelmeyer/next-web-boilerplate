import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the authority sources: Better Auth's session API (for the authoritative
// active-org read) and the DB member-role read. `@repo/db/schema` (the `member`
// table) and `drizzle-orm`'s `and`/`eq` stay real — pure and pool-free. Hoisted so
// the vi.mock factories can reference them.
const { getSession, findFirst } = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({ db: { query: { member: { findFirst } } } }));

import { getActiveOrganizationId, getOrgRole, isOrgAdminRole } from "./organization";

beforeEach(() => vi.clearAllMocks());

describe("getActiveOrganizationId", () => {
  it("bypasses the cookie cache when reading the session", async () => {
    getSession.mockResolvedValue({ session: { activeOrganizationId: "org1" } });
    const headers = new Headers();
    expect(await getActiveOrganizationId(headers)).toBe("org1");
    // Authoritative read: the cookie cache must be disabled so a just-created /
    // just-switched org is reflected immediately.
    expect(getSession).toHaveBeenCalledWith({ headers, query: { disableCookieCache: true } });
  });

  it("returns null when there is no session", async () => {
    getSession.mockResolvedValue(null);
    expect(await getActiveOrganizationId(new Headers())).toBeNull();
  });

  it("returns null when signed in with no active org (personal workspace)", async () => {
    getSession.mockResolvedValue({ session: { activeOrganizationId: null } });
    expect(await getActiveOrganizationId(new Headers())).toBeNull();
  });

  it("returns null when the session carries no session object", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    expect(await getActiveOrganizationId(new Headers())).toBeNull();
  });
});

describe("getOrgRole", () => {
  it("returns the membership role straight from the DB row", async () => {
    findFirst.mockResolvedValue({ role: "admin" });
    expect(await getOrgRole("org1", "u1")).toBe("admin");
  });

  it("returns null when the user is not a member", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await getOrgRole("org1", "ghost")).toBeNull();
  });
});

describe("isOrgAdminRole", () => {
  it("recognizes owner and admin as admin authority", () => {
    expect(isOrgAdminRole("owner")).toBe(true);
    expect(isOrgAdminRole("admin")).toBe(true);
  });

  it("rejects a plain member and a null (non-member)", () => {
    expect(isOrgAdminRole("member")).toBe(false);
    expect(isOrgAdminRole(null)).toBe(false);
  });

  it("recognizes admin authority inside a comma-joined multi-role", () => {
    expect(isOrgAdminRole("admin,member")).toBe(true);
    expect(isOrgAdminRole("member, owner")).toBe(true);
    expect(isOrgAdminRole("member,editor")).toBe(false);
  });
});
