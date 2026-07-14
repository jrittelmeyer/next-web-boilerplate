import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Uploadthing SDK so the handler is tested in isolation — no network,
// no token. The mock class stands in for UTApi; `deleteFiles` is the only method
// the handler touches.
const deleteFiles = vi.fn();
vi.mock("uploadthing/server", () => ({
  UTApi: class {
    deleteFiles = (...args: unknown[]) => deleteFiles(...args);
  },
}));

const { handleDeleteUploads } = await import("./delete-uploads");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("handleDeleteUploads", () => {
  it("deletes the payload's keys when Uploadthing is configured", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "ut_token");
    deleteFiles.mockResolvedValue({ success: true, deletedCount: 2 });

    await expect(
      handleDeleteUploads({ userId: "u1", keys: ["k1", "k2"] }),
    ).resolves.toBeUndefined();
    expect(deleteFiles).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("completes without a remote call when Uploadthing is unconfigured", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "");

    await expect(handleDeleteUploads({ userId: "u1", keys: ["k1"] })).resolves.toBeUndefined();
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it("throws (→ pg-boss retry) when a configured delete reports failure", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "ut_token");
    deleteFiles.mockResolvedValue({ success: false, deletedCount: 0 });

    await expect(handleDeleteUploads({ userId: "u1", keys: ["k1"] })).rejects.toThrow(
      /delete-uploads failed/,
    );
  });

  it("rejects an invalid payload before attempting anything", async () => {
    await expect(handleDeleteUploads({ userId: "u1", keys: [] })).rejects.toThrow();
    expect(deleteFiles).not.toHaveBeenCalled();
  });
});
