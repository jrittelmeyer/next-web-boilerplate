import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock everything the action reaches for (the uploads.test.ts pattern): Better Auth
// session, the DB client, the rate limiter, the Uploadthing helper, the logger, and
// Next's cache/headers. `@/lib/avatar` stays REAL (pure) so key derivation is
// exercised end-to-end.
const { getSession, userFindFirst, dbUpdate, rateLimitMock, isUploadthingConfigured, getUTApi } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    userFindFirst: vi.fn(),
    dbUpdate: vi.fn(),
    rateLimitMock: vi.fn(),
    isUploadthingConfigured: vi.fn(),
    getUTApi: vi.fn(),
  }));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({
  db: {
    update: dbUpdate,
    query: { user: { findFirst: userFindFirst } },
  },
  user: {},
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/uploadthing-api", () => ({ isUploadthingConfigured, getUTApi }));
vi.mock("@logtail/next", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { removeUserAvatar } from "./avatar";

const IMAGE_URL = "https://abc123.ufs.sh/f/KEY123abc";

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  dbUpdate.mockReturnValue({ set });
  return { set, where };
}

beforeEach(() => {
  vi.resetAllMocks();
  rateLimitMock.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
  isUploadthingConfigured.mockReturnValue(false);
});

describe("removeUserAvatar", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await removeUserAvatar()).toEqual({ error: "Unauthorized" });
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMock.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    expect(await removeUserAvatar()).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op success when the user has no avatar", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    userFindFirst.mockResolvedValue({ image: null });
    expect(await removeUserAvatar()).toEqual({ data: { removed: false } });
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(getUTApi).not.toHaveBeenCalled();
  });

  it("clears the column only when Uploadthing is unconfigured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    userFindFirst.mockResolvedValue({ image: IMAGE_URL });
    const { set } = mockUpdateChain();
    expect(await removeUserAvatar()).toEqual({ data: { removed: true } });
    expect(set).toHaveBeenCalledWith({ image: null });
    expect(getUTApi).not.toHaveBeenCalled();
  });

  it("deletes the stored file by derived key when configured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    userFindFirst.mockResolvedValue({ image: IMAGE_URL });
    isUploadthingConfigured.mockReturnValue(true);
    const deleteFiles = vi.fn().mockResolvedValue({ success: true, deletedCount: 1 });
    getUTApi.mockReturnValue({ deleteFiles });
    mockUpdateChain();
    expect(await removeUserAvatar()).toEqual({ data: { removed: true } });
    expect(deleteFiles).toHaveBeenCalledWith("KEY123abc");
  });

  it("clears a non-Uploadthing image value without a remote delete", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    userFindFirst.mockResolvedValue({ image: "https://example.com/me.png" });
    isUploadthingConfigured.mockReturnValue(true);
    const { set } = mockUpdateChain();
    expect(await removeUserAvatar()).toEqual({ data: { removed: true } });
    expect(set).toHaveBeenCalledWith({ image: null });
    expect(getUTApi).not.toHaveBeenCalled();
  });

  it("still succeeds (fail-open) when the configured remote delete throws", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    userFindFirst.mockResolvedValue({ image: IMAGE_URL });
    isUploadthingConfigured.mockReturnValue(true);
    getUTApi.mockReturnValue({ deleteFiles: vi.fn().mockRejectedValue(new Error("boom")) });
    const { set } = mockUpdateChain();
    expect(await removeUserAvatar()).toEqual({ data: { removed: true } });
    expect(set).toHaveBeenCalledWith({ image: null }); // column cleared regardless
  });
});
