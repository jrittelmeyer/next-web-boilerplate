import { describe, expect, it } from "vitest";
import { mintRsvpToken, rsvpCookieName, rsvpHandle, verifyRsvpToken } from "@/lib/calendar-tokens";

const ATTENDEE_ID = "3f1c6a2e-0b4d-4f8a-9c11-7e2d5a8b1234";
const OTHER_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const NOW = Date.UTC(2026, 7, 2, 12, 0, 0);
const SERIES_END = Date.UTC(2026, 11, 25, 9, 0, 0);

describe("mintRsvpToken / verifyRsvpToken", () => {
  it("round-trips the attendee id", () => {
    expect(verifyRsvpToken(mintRsvpToken(ATTENDEE_ID, SERIES_END), NOW)).toBe(ATTENDEE_ID);
  });

  it("round-trips an unbounded series, whose token never expires", () => {
    const token = mintRsvpToken(ATTENDEE_ID, null);
    expect(verifyRsvpToken(token, NOW)).toBe(ATTENDEE_ID);
    // A century later. The documented residual: an open-ended series mints a permanent
    // link, because any invented expiry would silently kill a legitimate invitation.
    expect(verifyRsvpToken(token, Date.UTC(2126, 0, 1))).toBe(ATTENDEE_ID);
  });

  it("is deterministic, so a re-send reaches the same link", () => {
    expect(mintRsvpToken(ATTENDEE_ID, SERIES_END)).toBe(mintRsvpToken(ATTENDEE_ID, SERIES_END));
  });

  it("gives different rows different tokens", () => {
    expect(mintRsvpToken(ATTENDEE_ID, SERIES_END)).not.toBe(mintRsvpToken(OTHER_ID, SERIES_END));
  });

  it("rejects an id that is not a uuid rather than signing whatever it was given", () => {
    expect(() => mintRsvpToken("not-a-uuid", null)).toThrow(/uuid/);
    expect(() => mintRsvpToken("", null)).toThrow(/uuid/);
  });
});

describe("the token alphabet — the defect that would have 404'd every invitation", () => {
  // proxy.ts's matcher is /((?!api|_next|_vercel|.*\..*).*)/ — a path containing a dot
  // never enters the proxy, and with localePrefix "as-needed" the default-locale
  // /rsvp/<token> exists ONLY via next-intl's rewrite. A dotted token therefore 404s in
  // production while any hand-written fixture without one passes. base64url has no dot.
  it("never emits a dot, for any of a spread of ids and bounds", () => {
    const ids = [ATTENDEE_ID, OTHER_ID, "00000000-0000-4000-8000-000000000000"];
    const bounds = [null, 0, SERIES_END, Date.UTC(2200, 0, 1)];
    for (const id of ids) {
      for (const bound of bounds) {
        const token = mintRsvpToken(id, bound);
        expect(token).not.toContain(".");
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    }
  });

  it("is URL-safe end to end — encoding it changes nothing", () => {
    const token = mintRsvpToken(ATTENDEE_ID, SERIES_END);
    expect(encodeURIComponent(token)).toBe(token);
  });
});

describe("verifyRsvpToken — every failure looks the same", () => {
  it("rejects a token past its expiry, with a thirty-day grace past the series end", () => {
    const token = mintRsvpToken(ATTENDEE_ID, SERIES_END);
    const day = 24 * 60 * 60 * 1000;
    expect(verifyRsvpToken(token, SERIES_END + 29 * day)).toBe(ATTENDEE_ID);
    expect(verifyRsvpToken(token, SERIES_END + 31 * day)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = mintRsvpToken(ATTENDEE_ID, SERIES_END);
    const macStart = 30;
    const flipped = token[macStart] === "A" ? "B" : "A";
    const tampered = `${token.slice(0, macStart)}${flipped}${token.slice(macStart + 1)}`;
    expect(tampered).not.toBe(token);
    expect(verifyRsvpToken(tampered, NOW)).toBeNull();
  });

  it("rejects a payload swapped onto another row's signature", () => {
    const mine = mintRsvpToken(ATTENDEE_ID, SERIES_END);
    const theirs = mintRsvpToken(OTHER_ID, SERIES_END);
    expect(verifyRsvpToken(`${mine.slice(0, 30)}${theirs.slice(30)}`, NOW)).toBeNull();
  });

  it("rejects a truncated signature without throwing inside the constant-time compare", () => {
    const token = mintRsvpToken(ATTENDEE_ID, SERIES_END);
    expect(verifyRsvpToken(token.slice(0, 34), NOW)).toBeNull();
  });

  it("rejects input too short to hold a payload", () => {
    expect(verifyRsvpToken("", NOW)).toBeNull();
    expect(verifyRsvpToken("abc", NOW)).toBeNull();
    expect(verifyRsvpToken("A".repeat(30), NOW)).toBeNull();
  });

  it("rejects garbage that is not base64url at all", () => {
    expect(verifyRsvpToken("!".repeat(80), NOW)).toBeNull();
  });
});

describe("rsvpHandle", () => {
  it("is stable per row and distinct between rows", () => {
    expect(rsvpHandle(ATTENDEE_ID)).toBe(rsvpHandle(ATTENDEE_ID));
    expect(rsvpHandle(ATTENDEE_ID)).not.toBe(rsvpHandle(OTHER_ID));
  });

  it("is short, URL-safe, and not the token", () => {
    const handle = rsvpHandle(ATTENDEE_ID);
    expect(handle).toHaveLength(12);
    expect(handle).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mintRsvpToken(ATTENDEE_ID, null)).not.toContain(handle);
  });

  it("names a cookie scoped to that one invitation, so two open tabs do not clobber", () => {
    expect(rsvpCookieName(rsvpHandle(ATTENDEE_ID))).not.toBe(rsvpCookieName(rsvpHandle(OTHER_ID)));
    expect(rsvpCookieName("abc")).toBe("rsvp_abc");
  });
});
