import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session read, the DB write chain, and Next's cache/headers; the shared
// `updateNameSchema` validator and `@repo/db/schema`'s `user` table stay real (pure).
const {
  getSession,
  dbUpdate,
  dbSet,
  dbWhere,
  dbInsert,
  dbValues,
  dbOnConflictDoUpdate,
  rateLimit,
  revalidatePath,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbUpdate: vi.fn(),
  dbSet: vi.fn(),
  dbWhere: vi.fn(),
  dbInsert: vi.fn(),
  dbValues: vi.fn(),
  dbOnConflictDoUpdate: vi.fn(),
  rateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@repo/db", () => ({ db: { update: dbUpdate, insert: dbInsert } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { user } from "@repo/db/schema";
import { updateUserName, updateUserPreferences } from "./user";

beforeEach(() => {
  vi.resetAllMocks();
  // Re-prime the update chain after the reset: db.update(user).set({...}).where(...)
  dbWhere.mockResolvedValue(undefined);
  dbSet.mockReturnValue({ where: dbWhere });
  dbUpdate.mockReturnValue({ set: dbSet });
  // …and the upsert chain: db.insert(t).values({...}).onConflictDoUpdate({...})
  dbOnConflictDoUpdate.mockResolvedValue(undefined);
  dbValues.mockReturnValue({ onConflictDoUpdate: dbOnConflictDoUpdate });
  dbInsert.mockReturnValue({ values: dbValues });
  rateLimit.mockResolvedValue({ success: true });
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

function preferencesForm(fields: Partial<Record<string, string>>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(key, value);
  }
  return formData;
}

describe("updateUserPreferences", () => {
  it("returns Unauthorized without a session — no write", async () => {
    getSession.mockResolvedValue(null);
    expect(await updateUserPreferences(preferencesForm({}))).toEqual({ error: "Unauthorized" });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("refuses when rate-limited, before touching the database", async () => {
    getSession.mockResolvedValue(signedIn);
    rateLimit.mockResolvedValue({ success: false });
    const result = await updateUserPreferences(preferencesForm({ timeZone: "UTC" }));
    expect(result).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("upserts a full set of preferences and revalidates both timestamp surfaces", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserPreferences(
      preferencesForm({ timeZone: "America/New_York", weekStart: "1", timeFormat: "24h" }),
    );
    expect(result).toEqual({
      data: { timeZone: "America/New_York", weekStart: 1, timeFormat: "24h" },
    });
    expect(dbValues).toHaveBeenCalledWith({
      userId: "user-1",
      timeZone: "America/New_York",
      weekStart: 1,
      timeFormat: "24h",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/account");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/audit");
  });

  it("stores NULL for every empty field — 'inherit the default'", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserPreferences(
      preferencesForm({ timeZone: "", weekStart: "", timeFormat: "" }),
    );
    expect(result).toEqual({ data: { timeZone: null, weekStart: null, timeFormat: null } });
    expect(dbValues).toHaveBeenCalledWith({
      userId: "user-1",
      timeZone: null,
      weekStart: null,
      timeFormat: null,
    });
  });

  it("treats entirely missing fields as NULL too", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserPreferences(preferencesForm({}));
    expect(result).toEqual({ data: { timeZone: null, weekStart: null, timeFormat: null } });
  });

  it("rejects a zone the runtime does not know, as a field error", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserPreferences(preferencesForm({ timeZone: "Mars/Olympus" }));
    expect(result).toEqual({
      error: "Please fix the fields below.",
      fieldErrors: { timeZone: "Unknown time zone" },
    });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("accepts a legacy alias that Intl.supportedValuesOf omits, and stores it verbatim", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserPreferences(preferencesForm({ timeZone: "US/Eastern" }));
    expect(result).toEqual({
      data: { timeZone: "US/Eastern", weekStart: null, timeFormat: null },
    });
    // Stored as supplied, NOT canonicalised: the runtime's preferred spelling is
    // not stable across Node versions, so normalising would make rows disagree.
    expect(dbValues).toHaveBeenCalledWith({
      userId: "user-1",
      timeZone: "US/Eastern",
      weekStart: null,
      timeFormat: null,
    });
  });

  it("rejects an out-of-range week start as a field error", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserPreferences(preferencesForm({ weekStart: "3" }));
    expect(result).toEqual({
      error: "Please fix the fields below.",
      fieldErrors: { weekStart: "Choose a first day of the week" },
    });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown clock format as a field error", async () => {
    getSession.mockResolvedValue(signedIn);
    const result = await updateUserPreferences(preferencesForm({ timeFormat: "military" }));
    expect(result).toEqual({
      error: "Please fix the fields below.",
      fieldErrors: { timeFormat: "Choose a clock format" },
    });
  });
});
