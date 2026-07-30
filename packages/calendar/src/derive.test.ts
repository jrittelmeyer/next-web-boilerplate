import { describe, expect, it } from "vitest";
import { deriveEventInstants } from "./derive";

/**
 * The corpus is the one that was probed against PostgreSQL 18 before migration 0020
 * was written, so these expectations and the database's
 * `calendar_events_start_at_derived` CHECK are the same set of facts stated twice.
 * Every row here inserted successfully there; the `packages/db` integration suite
 * re-asserts them against a real Postgres.
 *
 * Anchors are read off the runtime's own database, never recalled from memory.
 */

/** `start_at = (start_wall - offset) AT TIME ZONE 'UTC'` — the constraint, in TS. */
function instantFromOffset(wall: string, offsetMinutes: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(wall);
  if (!m) throw new Error(`bad fixture: ${wall}`);
  return (
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    ) -
    offsetMinutes * 60_000
  );
}

function derive(wall: string, tzid: string) {
  return deriveEventInstants({
    startWall: wall,
    startTzid: tzid,
    endWall: wall,
    endTzid: tzid,
  });
}

describe("deriveEventInstants", () => {
  it("resolves both ends independently, so an event may cross zones", () => {
    // A flight departing 09:00 New York and landing 11:30 Los Angeles is 5h30m.
    const result = deriveEventInstants({
      startWall: "2027-06-01 09:00:00",
      startTzid: "America/New_York",
      endWall: "2027-06-01 11:30:00",
      endTzid: "America/Los_Angeles",
    });
    expect(result.startOffsetMinutes).toBe(-240);
    expect(result.endOffsetMinutes).toBe(-420);
    expect((result.endAtMs - result.startAtMs) / 60_000).toBe(330);
  });

  it.each([
    ["A01 New York, summer", "2027-06-01 09:30:00", "America/New_York", -240, "unique"],
    ["A02 Chatham +13:45", "2027-06-01 09:30:00", "Pacific/Chatham", 765, "unique"],
    ["A03 Kiritimati +14", "2027-06-01 09:30:00", "Pacific/Kiritimati", 840, "unique"],
    ["A04 Kolkata +05:30", "2027-06-01 09:30:00", "Asia/Kolkata", 330, "unique"],
    // The overlap set. Each takes the EARLIER instant (`compatible`), and each has a
    // different transition size — 30 / 60 / 120 minutes — which is exactly why a
    // guard with a fixed ±1h tolerance could not have covered all three.
    ["A05 New York overlap (60m)", "2027-11-07 01:30:00", "America/New_York", -240, "overlap"],
    ["A06 Lord Howe overlap (30m)", "2027-04-04 01:45:00", "Australia/Lord_Howe", 660, "overlap"],
    ["A07 Troll overlap (120m)", "2027-10-31 01:30:00", "Antarctica/Troll", 120, "overlap"],
    // Dublin models its winter as negative DST, which breaks any code that assumes
    // the pre-transition offset is the larger one.
    ["A14 Dublin, negative DST", "2027-01-15 09:30:00", "Europe/Dublin", 0, "unique"],
    ["A15 UTC", "2027-06-01 09:30:00", "UTC", 0, "unique"],
    // Pre-1900 local mean time: Kolkata's true offset here is +05:21:10, and
    // `offsetMinutesAt` rounds the 10-second residue away by design. Postgres keeps
    // the seconds, which is why the constraint must not re-derive from the zone id.
    ["A11 Kolkata LMT, 1885", "1885-06-01 09:30:00", "Asia/Kolkata", 321, "unique"],
  ])("%s", (_label, wall, tzid, expectedOffset, expectedKind) => {
    const result = derive(wall, tzid);
    expect(result.startOffsetMinutes).toBe(expectedOffset);
    expect(result.startKind).toBe(expectedKind);
    // The invariant the database enforces, asserted here in arithmetic.
    expect(result.startAtMs).toBe(instantFromOffset(wall, expectedOffset));
  });

  it.each([
    // A gap reading does not exist; `compatible` shifts forward past it. The stored
    // offset is the PRE-transition one, which is what lands the instant after the gap.
    ["A08 New York gap (60m)", "2027-03-14 02:30:00", "America/New_York", -300],
    ["A09 Troll gap (120m)", "2027-03-28 01:30:00", "Antarctica/Troll", 0],
    // Samoa skipped 2011-12-30 entirely — a 24-hour gap, not an hour. The
    // pre-transition offset is -10:00, not -11:00: Apia was observing DST that
    // December (southern summer), which is precisely the sort of detail that has to
    // be read off the runtime rather than recalled.
    ["A10 Apia gap (24h)", "2011-12-30 12:00:00", "Pacific/Apia", -600],
  ])("%s reports kind=gap and shifts forward", (_label, wall, tzid, expectedOffset) => {
    const result = derive(wall, tzid);
    expect(result.startKind).toBe("gap");
    expect(result.startOffsetMinutes).toBe(expectedOffset);
    expect(result.startAtMs).toBe(instantFromOffset(wall, expectedOffset));
  });

  it.each([
    // Zones whose transition lands ON midnight, so an all-day event's own start is
    // the ambiguous reading. America/New_York transitions at 02:00 and can never
    // exercise this, which is why it is the wrong zone for an all-day DST test.
    ["A12 Santiago", "2027-09-05 00:00:00", "America/Santiago"],
    ["A13 Beirut", "2027-03-28 00:00:00", "Asia/Beirut"],
  ])("%s: midnight is itself a transition and still resolves", (_label, wall, tzid) => {
    const result = derive(wall, tzid);
    expect(result.startKind).toBe("gap");
    expect(result.startAtMs).toBe(instantFromOffset(wall, result.startOffsetMinutes));
  });

  it("keeps a weekly 09:30 meeting at 09:30 across a DST transition", () => {
    const before = derive("2027-11-05 09:30:00", "America/New_York");
    const after = derive("2027-11-12 09:30:00", "America/New_York");
    // Seven civil days, but the offset changed, so the instants are 7d + 1h apart.
    expect(before.startOffsetMinutes).toBe(-240);
    expect(after.startOffsetMinutes).toBe(-300);
    expect(after.startAtMs - before.startAtMs).toBe(7 * 86_400_000 + 3_600_000);
  });

  it("rejects an unknown time zone rather than silently floating", () => {
    expect(() => derive("2027-06-01 09:30:00", "Mars/Olympus_Mons")).toThrow(RangeError);
  });

  it("rejects an unknown zone on the END of an event too", () => {
    expect(() =>
      deriveEventInstants({
        startWall: "2027-06-01 09:30:00",
        startTzid: "UTC",
        endWall: "2027-06-01 10:30:00",
        endTzid: "Nowhere/Real",
      }),
    ).toThrow(RangeError);
  });

  it("accepts the legacy aliases real ICS files carry", () => {
    // `Intl.supportedValuesOf` omits these; `canonicalizeTimeZone` is what must gate.
    expect(derive("2027-06-01 09:30:00", "US/Eastern").startOffsetMinutes).toBe(-240);
    expect(derive("2027-06-01 09:30:00", "GMT").startOffsetMinutes).toBe(0);
  });

  it("rejects a malformed civil reading", () => {
    expect(() => derive("2027-02-30 09:30:00", "UTC")).toThrow(RangeError);
    expect(() => derive("not a date", "UTC")).toThrow(RangeError);
  });
});
