import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the RBAC gate, the DB read/write/delete, the audit logger, and the persisted-audit
// helper. ban/unban write the DB DIRECTLY (fresh-gated, not via the plugin's session-role-
// gated endpoint — see the action), so `db.update`/`db.delete` are what we assert. The
// shared validators and `@repo/db/schema`'s tables stay real (pure).
const {
  requireAdmin,
  dbUpdate,
  dbSelect,
  dbDelete,
  logInfo,
  recordAuditEvent,
  impersonateApi,
  stopImpersonatingApi,
  getSessionApi,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  dbUpdate: vi.fn(),
  dbSelect: vi.fn(),
  dbDelete: vi.fn(),
  logInfo: vi.fn(),
  recordAuditEvent: vi.fn(),
  // Impersonation goes through auth.api (a session-cookie swap), not a direct DB write.
  impersonateApi: vi.fn(),
  stopImpersonatingApi: vi.fn(),
  getSessionApi: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({ requireAdmin }));
vi.mock("@repo/db", () => ({
  db: { update: dbUpdate, select: dbSelect, delete: dbDelete },
  recordAuditEvent,
}));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      impersonateUser: impersonateApi,
      stopImpersonating: stopImpersonatingApi,
      getSession: getSessionApi,
    },
  },
}));
vi.mock("@logtail/next", () => ({ log: { info: logInfo, warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { banUser, impersonateUser, setUserRole, stopImpersonating, unbanUser } from "./admin";

beforeEach(() => {
  vi.resetAllMocks();
  dbUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
  dbDelete.mockReturnValue({ where: () => Promise.resolve() });
  // The pre-update role read finds the target with role "user" unless a test overrides it.
  dbSelect.mockReturnValue({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([{ role: "user" }]) }) }),
  });
  // The auth.api swaps resolve by default; individual tests override to reject.
  impersonateApi.mockResolvedValue({});
  stopImpersonatingApi.mockResolvedValue({});
});

// A realistic admin caller: requireAdmin resolves the session (identity) + the
// authoritative role. `session.user.id` is the caller's own id — the self-demotion
// guard compares the target `userId` against it.
const adminCaller = { session: { user: { id: "admin-1" } }, role: "admin" };

describe("setUserRole", () => {
  it("forbids a non-admin (or logged-out) caller", async () => {
    requireAdmin.mockResolvedValue(null);
    expect(await setUserRole({ userId: "u1", role: "admin" })).toEqual({ error: "Forbidden" });
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(logInfo).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns a validation error for an invalid role", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await setUserRole({ userId: "u1", role: "superuser" as never });
    expect((r as { error: string }).error).toMatch(/invalid role/i);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("returns a validation error for a missing userId", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await setUserRole({ userId: "", role: "admin" });
    expect((r as { error: string }).error).toMatch(/user id/i);
  });

  it("forbids an admin from changing their OWN role (anti-lockout)", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await setUserRole({ userId: "admin-1", role: "user" });
    expect((r as { error: string }).error).toMatch(/your own role/i);
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(logInfo).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 'User not found' for a nonexistent target — no update, no audit log", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    dbSelect.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    expect(await setUserRole({ userId: "ghost", role: "admin" })).toEqual({
      error: "User not found",
    });
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(logInfo).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("updates the role for an admin caller and emits BOTH the log line and the audit row (P1-7 / B2)", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    expect(await setUserRole({ userId: "u1", role: "admin" })).toEqual({
      data: { userId: "u1", role: "admin" },
    });
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(logInfo).toHaveBeenCalledTimes(1);
    expect(logInfo).toHaveBeenCalledWith("admin.setUserRole", {
      actorId: "admin-1",
      targetId: "u1",
      oldRole: "user",
      newRole: "admin",
    });
    // The persisted, queryable trail (B2): old→new role in metadata, actor + target ids.
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: "user.role_changed",
      actorId: "admin-1",
      targetId: "u1",
      metadata: { oldRole: "user", newRole: "admin" },
    });
  });
});

describe("banUser", () => {
  it("forbids a non-admin (or logged-out) caller", async () => {
    requireAdmin.mockResolvedValue(null);
    expect(await banUser({ userId: "u1" })).toEqual({ error: "Forbidden" });
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(dbDelete).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns a validation error for a missing userId", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await banUser({ userId: "" });
    expect((r as { error: string }).error).toMatch(/user id/i);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("forbids an admin from banning THEMSELVES (anti-lockout)", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await banUser({ userId: "admin-1" });
    expect((r as { error: string }).error).toMatch(/ban yourself/i);
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(dbDelete).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("bans a user (with reason + expiry): writes the ban columns, revokes sessions, audits", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    expect(await banUser({ userId: "u1", banReason: "spam", banExpiresIn: 3600 })).toEqual({
      data: { userId: "u1" },
    });
    // Direct writes: the ban columns (update) + a live-session revoke (delete).
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(dbDelete).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: "user.banned",
      actorId: "admin-1",
      targetId: "u1",
      metadata: { reason: "spam" },
    });
  });

  it("bans without a reason or expiry: audit metadata is omitted (permanent ban)", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    await banUser({ userId: "u1" });
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(dbDelete).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: "user.banned",
      actorId: "admin-1",
      targetId: "u1",
      metadata: undefined,
    });
  });
});

describe("unbanUser", () => {
  it("forbids a non-admin (or logged-out) caller", async () => {
    requireAdmin.mockResolvedValue(null);
    expect(await unbanUser({ userId: "u1" })).toEqual({ error: "Forbidden" });
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns a validation error for a missing userId", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await unbanUser({ userId: "" });
    expect((r as { error: string }).error).toMatch(/user id/i);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("unbans a user: clears the ban columns + records the audit row", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    expect(await unbanUser({ userId: "u1" })).toEqual({ data: { userId: "u1" } });
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: "user.unbanned",
      actorId: "admin-1",
      targetId: "u1",
    });
  });
});

describe("impersonateUser", () => {
  it("forbids a non-admin (or logged-out) caller", async () => {
    requireAdmin.mockResolvedValue(null);
    expect(await impersonateUser({ userId: "u1" })).toEqual({ error: "Forbidden" });
    expect(impersonateApi).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns a validation error for a missing userId", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await impersonateUser({ userId: "" });
    expect((r as { error: string }).error).toMatch(/user id/i);
    expect(impersonateApi).not.toHaveBeenCalled();
  });

  it("forbids an admin from impersonating THEMSELVES", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    const r = await impersonateUser({ userId: "admin-1" });
    expect((r as { error: string }).error).toMatch(/impersonate yourself/i);
    expect(impersonateApi).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("impersonates via the plugin endpoint and audits", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    expect(await impersonateUser({ userId: "u1" })).toEqual({ data: { userId: "u1" } });
    // The session-cookie swap goes through auth.api (not a DB write); nextCookies() flushes it.
    expect(impersonateApi).toHaveBeenCalledTimes(1);
    expect(impersonateApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: "u1" } }),
    );
    expect(logInfo).toHaveBeenCalledWith("admin.impersonateUser", {
      actorId: "admin-1",
      targetId: "u1",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: "user.impersonated",
      actorId: "admin-1",
      targetId: "u1",
    });
  });

  it("surfaces a typed error (no audit) when the plugin endpoint rejects — e.g. a just-promoted admin whose session role is still stale, or an admin target", async () => {
    requireAdmin.mockResolvedValue(adminCaller);
    impersonateApi.mockRejectedValue(new Error("FORBIDDEN"));
    const r = await impersonateUser({ userId: "u1" });
    expect((r as { error: string }).error).toMatch(/could not impersonate/i);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("stopImpersonating", () => {
  it("returns an error when there is no active impersonation session", async () => {
    getSessionApi.mockResolvedValue(null);
    const r = await stopImpersonating();
    expect((r as { error: string }).error).toMatch(/not impersonating/i);
    expect(stopImpersonatingApi).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns an error when the session is not an impersonation (impersonatedBy unset)", async () => {
    getSessionApi.mockResolvedValue({ session: { impersonatedBy: null }, user: { id: "t1" } });
    const r = await stopImpersonating();
    expect((r as { error: string }).error).toMatch(/not impersonating/i);
    expect(stopImpersonatingApi).not.toHaveBeenCalled();
  });

  it("stops impersonating and audits actor=admin, target=impersonated user", async () => {
    getSessionApi.mockResolvedValue({
      session: { impersonatedBy: "admin-1" },
      user: { id: "t1" },
    });
    expect(await stopImpersonating()).toEqual({ data: { userId: "t1" } });
    expect(stopImpersonatingApi).toHaveBeenCalledTimes(1);
    expect(logInfo).toHaveBeenCalledWith("admin.stopImpersonating", {
      actorId: "admin-1",
      targetId: "t1",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: "user.impersonation_stopped",
      actorId: "admin-1",
      targetId: "t1",
    });
  });

  it("surfaces a typed error (no audit) when the swap-back rejects", async () => {
    getSessionApi.mockResolvedValue({
      session: { impersonatedBy: "admin-1" },
      user: { id: "t1" },
    });
    stopImpersonatingApi.mockRejectedValue(new Error("boom"));
    const r = await stopImpersonating();
    expect((r as { error: string }).error).toMatch(/unable to stop/i);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
