import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelect, rateLimit } = vi.hoisted(() => ({ dbSelect: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@repo/db", () => ({ db: { select: dbSelect } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));

import { mintRsvpToken } from "@/lib/calendar-tokens";
import { isStaleResponse, loadRsvpView } from "./rsvp";

const ATTENDEE = "3f1c6a2e-0b4d-4f8a-9c11-7e2d5a8b1234";
const NOW = Date.UTC(2026, 7, 2, 12, 0, 0);

const row = {
  attendeeId: ATTENDEE,
  email: "guest@example.com",
  status: "needs-action" as const,
  respondedAt: null,
  eventTitle: "Standup",
  location: "Room 2",
  startWall: "2026-08-10 09:00:00",
  startTzid: "America/New_York",
  allDay: false,
  reaskAt: null,
  organizerEmail: "ada@example.com",
};

function selectResolving(rows: unknown[]) {
  const tail: { innerJoin: () => typeof tail; where: () => { limit: () => Promise<unknown[]> } } = {
    innerJoin: () => tail,
    where: () => ({ limit: () => Promise.resolve(rows) }),
  };
  dbSelect.mockReturnValue({ from: () => tail });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ success: true });
  selectResolving([row]);
});

describe("loadRsvpView", () => {
  it("resolves a valid token into the invitation", async () => {
    const view = await loadRsvpView(mintRsvpToken(ATTENDEE, null), NOW);
    expect(view).toEqual({
      attendeeId: ATTENDEE,
      email: "guest@example.com",
      eventTitle: "Standup",
      when: "Monday, 10 August 2026 at 09:00 (America/New_York)",
      location: "Room 2",
      organizerEmail: "ada@example.com",
      status: "needs-action",
      stale: false,
    });
  });

  it("names the zone, because an external guest has no stored one of their own", async () => {
    const view = await loadRsvpView(mintRsvpToken(ATTENDEE, null), NOW);
    expect(view?.when).toContain("(America/New_York)");
  });

  it("says 'all day' rather than inventing a time", async () => {
    selectResolving([{ ...row, allDay: true }]);
    const view = await loadRsvpView(mintRsvpToken(ATTENDEE, null), NOW);
    expect(view?.when).toBe("Monday, 10 August 2026 (all day)");
  });

  it("marks an answer given before the event moved as stale", async () => {
    selectResolving([
      {
        ...row,
        status: "accepted",
        respondedAt: new Date(Date.UTC(2026, 6, 1)),
        reaskAt: new Date(Date.UTC(2026, 6, 20)),
      },
    ]);
    const view = await loadRsvpView(mintRsvpToken(ATTENDEE, null), NOW);
    // The answer itself SURVIVES — that is the whole point of deriving staleness rather
    // than resetting the row.
    expect(view?.status).toBe("accepted");
    expect(view?.stale).toBe(true);
  });

  it("returns null — never throws, never a 404 — for every failure alike", async () => {
    // Forged, malformed and too-short all take the same path...
    expect(await loadRsvpView("A".repeat(80), NOW)).toBeNull();
    expect(await loadRsvpView("", NOW)).toBeNull();
    // ...as does an expired one...
    const expired = mintRsvpToken(ATTENDEE, Date.UTC(2020, 0, 1));
    expect(await loadRsvpView(expired, NOW)).toBeNull();
    // ...and a token whose row no longer exists, or whose event was soft-deleted (the
    // query filters `deleted_at`, so both arrive here as no row).
    selectResolving([]);
    expect(await loadRsvpView(mintRsvpToken(ATTENDEE, null), NOW)).toBeNull();
  });

  it("does not query at all when the token cannot be verified", async () => {
    await loadRsvpView("nope", NOW);
    expect(dbSelect).not.toHaveBeenCalled();
    // ...and it never even consumes the read limiter: verify precedes the limit, so a forged
    // token cannot burn a real invitation's bucket.
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("caps the read at 60/min per invitation, keyed by attendee id", async () => {
    await loadRsvpView(mintRsvpToken(ATTENDEE, null), NOW);
    expect(rateLimit).toHaveBeenCalledWith(`calendar:rsvp:read:${ATTENDEE}`, {
      limit: 60,
      windowSec: 60,
    });
  });

  it("returns null without querying when the read limit is exceeded", async () => {
    rateLimit.mockResolvedValue({ success: false });
    expect(await loadRsvpView(mintRsvpToken(ATTENDEE, null), NOW)).toBeNull();
    expect(dbSelect).not.toHaveBeenCalled();
  });
});

describe("isStaleResponse", () => {
  const earlier = new Date(Date.UTC(2026, 6, 1));
  const later = new Date(Date.UTC(2026, 6, 20));

  it("is false when the guest has not answered", () => {
    expect(isStaleResponse(null, later)).toBe(false);
  });

  it("is false when the event has never been moved", () => {
    expect(isStaleResponse(earlier, null)).toBe(false);
  });

  it("is true only when the answer predates the move", () => {
    expect(isStaleResponse(earlier, later)).toBe(true);
    expect(isStaleResponse(later, earlier)).toBe(false);
  });

  it("treats an answer given in the same instant as the move as fresh", () => {
    // Strictly `<`: the guest who answers the reschedule email the moment it lands has
    // answered the new time, not the old one.
    expect(isStaleResponse(new Date(later), later)).toBe(false);
  });
});
