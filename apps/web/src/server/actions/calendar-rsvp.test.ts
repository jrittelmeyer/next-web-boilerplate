import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, dbTransaction, dbNotify, revalidatePath, cookieGet } = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  dbTransaction: vi.fn(),
  dbNotify: vi.fn(),
  revalidatePath: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  // `clientKeyFromHeaders` stays REAL — the shared "unknown" bucket for an IP-less request
  // is part of the behaviour this file documents, not something to stub away.
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit };
});
vi.mock("@repo/db", () => ({
  NOTIFICATIONS_CHANNEL: "notifications",
  notify: dbNotify,
  db: { transaction: dbTransaction },
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: cookieGet })),
}));

import { mintRsvpToken, rsvpHandle } from "@/lib/calendar-tokens";
import { respondByToken } from "./calendar-rsvp";

const ATTENDEE = "3f1c6a2e-0b4d-4f8a-9c11-7e2d5a8b1234";
const EVENT = "11111111-2222-4333-8444-555555555555";
const HANDLE = rsvpHandle(ATTENDEE);
const GENERIC = "This invitation link is no longer valid.";

/** A tx whose UPDATE returns `attendeeRows` and whose SELECT returns `eventRows`. */
function transaction(attendeeRows: unknown[], eventRows: unknown[]) {
  dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      update: () => ({
        set: () => ({ where: () => ({ returning: () => Promise.resolve(attendeeRows) }) }),
      }),
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(eventRows) }) }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () =>
            Promise.resolve([
              {
                id: "n1",
                userId: "u1",
                type: "calendar_response_declined",
                body: "guest@example.com",
                title: "Standup",
                link: `/calendar/event/${EVENT}`,
                read: false,
                createdAt: new Date(),
              },
            ]),
        }),
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ success: true });
  cookieGet.mockReturnValue({ value: mintRsvpToken(ATTENDEE, null) });
  transaction(
    [{ email: "guest@example.com", eventId: EVENT }],
    [{ title: "Standup", ownerId: "u1" }],
  );
});

describe("respondByToken — the one action with no session gate", () => {
  it("records the answer and notifies the organizer", async () => {
    const result = await respondByToken({ handle: HANDLE, status: "declined", comment: null });
    expect(result).toEqual({ data: { status: "declined" } });
    expect(dbNotify).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/calendar/invites");
  });

  it("reads the token from the cookie the handle names, never from the caller", async () => {
    await respondByToken({ handle: HANDLE, status: "accepted", comment: null });
    expect(cookieGet).toHaveBeenCalledWith(`rsvp_${HANDLE}`);
  });
});

describe("respondByToken — every refusal is the same sentence", () => {
  it("refuses when no cookie was ever set for that handle", async () => {
    cookieGet.mockReturnValue(undefined);
    expect(await respondByToken({ handle: HANDLE, status: "accepted", comment: null })).toEqual({
      error: GENERIC,
    });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("refuses a forged token without touching the database", async () => {
    cookieGet.mockReturnValue({ value: "A".repeat(80) });
    expect(await respondByToken({ handle: HANDLE, status: "accepted", comment: null })).toEqual({
      error: GENERIC,
    });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("refuses an expired token", async () => {
    const lastYear = Date.now() - 400 * 24 * 60 * 60 * 1000;
    cookieGet.mockReturnValue({ value: mintRsvpToken(ATTENDEE, lastYear) });
    expect(await respondByToken({ handle: HANDLE, status: "accepted", comment: null })).toEqual({
      error: GENERIC,
    });
  });

  it("refuses when the attendee row is gone — the guest was removed", async () => {
    transaction([], []);
    expect(await respondByToken({ handle: HANDLE, status: "accepted", comment: null })).toEqual({
      error: GENERIC,
    });
    expect(dbNotify).not.toHaveBeenCalled();
  });

  it("refuses when the event was soft-deleted between the read and the write", async () => {
    transaction([{ email: "guest@example.com", eventId: EVENT }], []);
    expect(await respondByToken({ handle: HANDLE, status: "accepted", comment: null })).toEqual({
      error: GENERIC,
    });
  });

  it("refuses a write failure with the same sentence, leaking nothing", async () => {
    dbTransaction.mockRejectedValue(new Error("boom"));
    expect(await respondByToken({ handle: HANDLE, status: "accepted", comment: null })).toEqual({
      error: GENERIC,
    });
  });

  it("refuses `needs-action`, which no control offers and the CHECK would reject", async () => {
    const result = await respondByToken({
      handle: HANDLE,
      // biome-ignore lint/suspicious/noExplicitAny: asserting the schema refuses it.
      status: "needs-action" as any,
      comment: null,
    });
    expect(result).toHaveProperty("error", GENERIC);
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("refuses an over-long comment", async () => {
    const result = await respondByToken({
      handle: HANDLE,
      status: "accepted",
      comment: "x".repeat(501),
    });
    expect(result).toHaveProperty("error", GENERIC);
  });
});

describe("respondByToken — rate limiting", () => {
  it("is limited by client key before anything else happens", async () => {
    rateLimit.mockResolvedValue({ success: false });
    expect(await respondByToken({ handle: HANDLE, status: "accepted", comment: null })).toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
    expect(cookieGet).not.toHaveBeenCalled();
    // An IP-less request shares one bucket rather than bypassing the limit entirely.
    expect(rateLimit).toHaveBeenCalledWith("calendar:rsvp:respond:unknown", {
      limit: 20,
      windowSec: 60,
    });
  });
});
