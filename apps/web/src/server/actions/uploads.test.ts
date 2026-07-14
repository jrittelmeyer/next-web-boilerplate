import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock everything the action reaches for (the post.test.ts pattern): Better Auth
// session, the DB client, the rate limiter, the Uploadthing helper, the logger,
// and Next's cache/headers. `@repo/db/schema` stays real (pure).
const { getSession, dbDelete, uploadsFindFirst, rateLimitMock, isUploadthingConfigured, getUTApi } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    dbDelete: vi.fn(),
    uploadsFindFirst: vi.fn(),
    rateLimitMock: vi.fn(),
    isUploadthingConfigured: vi.fn(),
    getUTApi: vi.fn(),
  }));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({
  db: {
    delete: dbDelete,
    query: { uploads: { findFirst: uploadsFindFirst } },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/lib/uploadthing-api", () => ({ isUploadthingConfigured, getUTApi }));
vi.mock("@logtail/next", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { deleteUpload } from "./uploads";

const ROW = { id: "up1", userId: "u1", key: "key-abc" };

function mockDeleteChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  dbDelete.mockReturnValue({ where });
  return { where };
}

beforeEach(() => {
  vi.resetAllMocks();
  rateLimitMock.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
  isUploadthingConfigured.mockReturnValue(false);
});

describe("deleteUpload", () => {
  it("rejects an unauthenticated caller", async () => {
    getSession.mockResolvedValue(null);
    expect(await deleteUpload("up1")).toEqual({ error: "Unauthorized" });
  });

  it("blocks when the per-user rate limit is exceeded", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMock.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });
    expect(await deleteUpload("up1")).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
  });

  it("returns an error for a nonexistent upload", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    uploadsFindFirst.mockResolvedValue(undefined);
    expect(await deleteUpload("nope")).toEqual({ error: "Upload not found" });
  });

  it("refuses to delete another user's upload", async () => {
    getSession.mockResolvedValue({ user: { id: "intruder" } });
    uploadsFindFirst.mockResolvedValue(ROW);
    expect(await deleteUpload("up1")).toEqual({ error: "Forbidden" });
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("deletes the row alone when Uploadthing is unconfigured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    uploadsFindFirst.mockResolvedValue(ROW);
    mockDeleteChain();
    expect(await deleteUpload("up1")).toEqual({ data: { id: "up1" } });
    expect(getUTApi).not.toHaveBeenCalled();
    expect(dbDelete).toHaveBeenCalled();
  });

  it("deletes the file from storage before the row when configured", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    uploadsFindFirst.mockResolvedValue(ROW);
    isUploadthingConfigured.mockReturnValue(true);
    const deleteFiles = vi.fn().mockResolvedValue({ success: true, deletedCount: 1 });
    getUTApi.mockReturnValue({ deleteFiles });
    mockDeleteChain();
    expect(await deleteUpload("up1")).toEqual({ data: { id: "up1" } });
    expect(deleteFiles).toHaveBeenCalledWith("key-abc");
    expect(dbDelete).toHaveBeenCalled();
  });

  it("keeps the row when the configured remote delete reports failure", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    uploadsFindFirst.mockResolvedValue(ROW);
    isUploadthingConfigured.mockReturnValue(true);
    getUTApi.mockReturnValue({
      deleteFiles: vi.fn().mockResolvedValue({ success: false, deletedCount: 0 }),
    });
    expect(await deleteUpload("up1")).toEqual({
      error: "Could not delete the file from storage. Please try again.",
    });
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("keeps the row when the configured remote delete throws", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    uploadsFindFirst.mockResolvedValue(ROW);
    isUploadthingConfigured.mockReturnValue(true);
    getUTApi.mockReturnValue({ deleteFiles: vi.fn().mockRejectedValue(new Error("boom")) });
    expect(await deleteUpload("up1")).toEqual({
      error: "Could not delete the file from storage. Please try again.",
    });
    expect(dbDelete).not.toHaveBeenCalled();
  });
});
