import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @repo/db + drizzle-orm the uploads.test.ts / subscription.test.ts way:
// `verification` is a marker object (not real columns) and `lt` is a spy that
// echoes its args, so we can assert the delete's shape without a real DB.
const { dbDelete, ltMock } = vi.hoisted(() => ({ dbDelete: vi.fn(), ltMock: vi.fn() }));

vi.mock("@repo/db", () => ({
  db: { delete: dbDelete },
  verification: { id: "verification.id", expiresAt: "verification.expires_at" },
}));
vi.mock("drizzle-orm", () => ({
  lt: (...args: unknown[]) => ltMock(...args),
}));

const { handleCleanupExpiredVerifications } = await import("./cleanup-expired-verifications");

// db.delete(verification).where(lt(...)).returning({ id }) — build the chain so
// each hop returns the next, and `returning` resolves to the deleted rows.
function mockDeleteChain(deletedRows: Array<{ id: string }>) {
  const returning = vi.fn().mockResolvedValue(deletedRows);
  const where = vi.fn().mockReturnValue({ returning });
  dbDelete.mockReturnValue({ where });
  return { where, returning };
}

beforeEach(() => {
  vi.clearAllMocks();
  ltMock.mockImplementation((col, value) => ({ lt: [col, value] }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleCleanupExpiredVerifications", () => {
  it("deletes verification rows whose expiresAt is in the past", async () => {
    const { where, returning } = mockDeleteChain([{ id: "v1" }, { id: "v2" }]);
    const before = Date.now();

    await expect(handleCleanupExpiredVerifications({})).resolves.toBeUndefined();

    // Filters on the verification.expiresAt column with a cutoff of ~now.
    expect(ltMock).toHaveBeenCalledTimes(1);
    const [col, cutoff] = ltMock.mock.calls[0] as [string, Date];
    expect(col).toBe("verification.expires_at");
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now());

    expect(where).toHaveBeenCalledWith({ lt: ["verification.expires_at", cutoff] });
    expect(returning).toHaveBeenCalledWith({ id: "verification.id" });
  });

  it("logs the number of pruned rows", async () => {
    mockDeleteChain([{ id: "v1" }, { id: "v2" }, { id: "v3" }]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await handleCleanupExpiredVerifications({});

    expect(info).toHaveBeenCalledWith(expect.stringContaining("pruned 3 expired row(s)"));
  });

  it("completes as a no-op when nothing has expired", async () => {
    mockDeleteChain([]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(handleCleanupExpiredVerifications({})).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("pruned 0 expired row(s)"));
  });

  it("rejects a stray payload before touching the database", async () => {
    await expect(handleCleanupExpiredVerifications({ unexpected: true })).rejects.toThrow();
    expect(dbDelete).not.toHaveBeenCalled();
  });
});
