import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session read, the DB write chain, and Next's cache/headers; the shared
// `updateNameSchema` validator and `@repo/db/schema`'s `user` table stay real (pure).
const { getSession, dbUpdate, dbSet, dbWhere, revalidatePath } = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbUpdate: vi.fn(),
  dbSet: vi.fn(),
  dbWhere: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({ db: { update: dbUpdate } }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { user } from "@repo/db/schema";
import { updateUserName } from "./user";

beforeEach(() => {
  vi.resetAllMocks();
  // Re-prime the update chain after the reset: db.update(user).set({...}).where(...)
  dbWhere.mockResolvedValue(undefined);
  dbSet.mockReturnValue({ where: dbWhere });
  dbUpdate.mockReturnValue({ set: dbSet });
});

const signedIn = { user: { id: "user-1" } };

function formDataWith(name: string | null): FormData {
  const formData = new FormData();
  if (name !== null) formData.set("name", name);
  return formData;
}

describe("updateUserName", () => {
  it("returns Unauthorized without a session — no write, no revalidate", async () => {
    getSession.mockResolvedValue(null);
    expect(await updateUserName(formDataWith("Ada"))).toEqual({ error: "Unauthorized" });
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an empty name with the validator's message", async () => {
    getSession.mockResolvedValue(signedIn);
    expect(await updateUserName(formDataWith(""))).toEqual({ error: "Name is required" });
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a missing name field", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserName(formDataWith(null));
    expect("error" in result).toBe(true);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("rejects a name over 100 characters", async () => {
    getSession.mockResolvedValue(signedIn);
    expect(await updateUserName(formDataWith("a".repeat(101)))).toEqual({
      error: "Name must be 100 characters or fewer",
    });
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("updates the trimmed name for the signed-in user and revalidates both surfaces", async () => {
    getSession.mockResolvedValue(signedIn);
    expect(await updateUserName(formDataWith("  Ada Lovelace  "))).toEqual({
      data: { name: "Ada Lovelace" },
    });
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(dbUpdate).toHaveBeenCalledWith(user);
    expect(dbSet).toHaveBeenCalledWith({ name: "Ada Lovelace" });
    expect(dbWhere).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/account");
  });
});
