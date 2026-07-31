import { describe, expect, it } from "vitest";
import {
  addCivilDays,
  type CivilDateTime,
  civilEquals,
  formatLocalDateTime,
  MS_PER_DAY,
  MS_PER_MINUTE,
  parseLocalDateTime,
} from "./civil";
import {
  canonicalizeTimeZone,
  civilToInstant,
  instantToCivil,
  offsetMinutesAt,
  resolveCivil,
} from "./timezone";

/**
 * Every anchor in this file was read off the runtime's own IANA database before
 * being written down (see the Phase 0 probe), not recalled. The zone set is chosen
 * so that each entry breaks a different naive implementation:
 *
 *  - America/New_York, Europe/London  — northern DST, and the two hemispheres'
 *    transitions land on different local hours (02:00 vs 01:00).
 *  - Australia/Sydney                 — southern DST: the year runs the other way.
 *  - Australia/Lord_Howe              — a **30-minute** DST shift. Any code that
 *    assumes DST means "one hour" is wrong here, and only here.
 *  - Pacific/Chatham                  — +13:45. Breaks whole-hour offset maths.
 *  - Asia/Kolkata (+05:30), Asia/Tehran (+03:30, DST abolished 2022),
 *    Pacific/Kiritimati (+14:00) — non-hour and extreme constant offsets.
 */

const at = (iso: string): number => Date.parse(iso);
const local = (value: string): CivilDateTime => parseLocalDateTime(value);
const reads = (instantMs: number, timeZone: string): string =>
  formatLocalDateTime(instantToCivil(instantMs, timeZone));

const JAN = at("2026-01-15T12:00:00Z");
const JUL = at("2026-07-15T12:00:00Z");

describe("offsetMinutesAt", () => {
  it.each([
    ["Asia/Kolkata", 330, 330],
    ["Pacific/Kiritimati", 840, 840],
    ["Asia/Tehran", 210, 210],
    ["America/New_York", -300, -240],
    ["Europe/London", 0, 60],
    ["Australia/Sydney", 660, 600],
    ["Pacific/Chatham", 825, 765],
    ["Australia/Lord_Howe", 660, 630],
  ])("%s reads %i in January and %i in July", (zone, january, july) => {
    expect(offsetMinutesAt(JAN, zone)).toBe(january);
    expect(offsetMinutesAt(JUL, zone)).toBe(july);
  });

  it("keeps sub-hour offsets in minutes rather than rounding to hours", () => {
    // The three that a `getTimezoneOffset() / 60` implementation gets wrong.
    expect(offsetMinutesAt(JAN, "Pacific/Chatham") % 60).toBe(45);
    expect(offsetMinutesAt(JUL, "Australia/Lord_Howe") % 60).toBe(30);
    expect(offsetMinutesAt(JAN, "Asia/Kolkata") % 60).toBe(30);
  });

  it("changes by exactly 30 minutes across the Lord Howe transition", () => {
    const before = offsetMinutesAt(at("2026-10-03T15:00:00Z"), "Australia/Lord_Howe");
    const after = offsetMinutesAt(at("2026-10-03T16:00:00Z"), "Australia/Lord_Howe");
    expect(after - before).toBe(30);
  });
});

describe("instantToCivil", () => {
  it("reads midnight as hour 0, never hour 24", () => {
    expect(reads(at("2026-01-01T00:00:00Z"), "UTC")).toBe("2026-01-01 00:00:00");
  });

  it("crosses the date line correctly", () => {
    // +14:00 — the same instant is already tomorrow in Kiritimati.
    expect(reads(at("2026-07-15T12:00:00Z"), "Pacific/Kiritimati")).toBe("2026-07-16 02:00:00");
  });

  it("applies a 45-minute offset", () => {
    expect(reads(at("2026-01-15T12:00:00Z"), "Pacific/Chatham")).toBe("2026-01-16 01:45:00");
  });
});

describe("resolveCivil — unique readings", () => {
  it("resolves an ordinary reading in a DST-free zone", () => {
    const result = resolveCivil(local("2026-07-15 09:00:00"), "Asia/Kolkata");
    expect(result.kind).toBe("unique");
    expect(result.offsetMinutes).toBe(330);
    expect(result.instantMs).toBe(at("2026-07-15T03:30:00Z"));
  });

  it("resolves readings on a transition day that are not themselves ambiguous", () => {
    // Before the 02:00 spring-forward: still EST.
    const early = resolveCivil(local("2026-03-08 00:30:00"), "America/New_York");
    expect(early.kind).toBe("unique");
    expect(early.offsetMinutes).toBe(-300);
    // After it: EDT. Both sides matter — they exercise opposite branches.
    const late = resolveCivil(local("2026-03-08 12:00:00"), "America/New_York");
    expect(late.kind).toBe("unique");
    expect(late.offsetMinutes).toBe(-240);
  });
});

describe("resolveCivil — spring-forward gaps", () => {
  it("shifts a nonexistent New York reading forward past the gap", () => {
    // 2026-03-08 02:00 -> 03:00 local. 02:30 never happens.
    const result = resolveCivil(local("2026-03-08 02:30:00"), "America/New_York");
    expect(result.kind).toBe("gap");
    expect(result.instantMs).toBe(at("2026-03-08T07:30:00Z"));
    expect(reads(result.instantMs, "America/New_York")).toBe("2026-03-08 03:30:00");
  });

  it("shifts a nonexistent London reading forward past the gap", () => {
    // 2026-03-29 01:00 -> 02:00 local.
    const result = resolveCivil(local("2026-03-29 01:30:00"), "Europe/London");
    expect(result.kind).toBe("gap");
    expect(reads(result.instantMs, "Europe/London")).toBe("2026-03-29 02:30:00");
  });

  it("shifts a nonexistent southern-hemisphere reading forward", () => {
    // Sydney springs forward 2026-10-04 02:00 -> 03:00 local.
    const result = resolveCivil(local("2026-10-04 02:30:00"), "Australia/Sydney");
    expect(result.kind).toBe("gap");
    expect(reads(result.instantMs, "Australia/Sydney")).toBe("2026-10-04 03:30:00");
  });

  it("shifts by 30 minutes, not 60, in a 30-minute-DST zone", () => {
    // Lord Howe springs forward 2026-10-04 02:00 -> 02:30 local: a 30-minute gap.
    const result = resolveCivil(local("2026-10-04 02:15:00"), "Australia/Lord_Howe");
    expect(result.kind).toBe("gap");
    expect(reads(result.instantMs, "Australia/Lord_Howe")).toBe("2026-10-04 02:45:00");
  });

  it("honours an explicit 'earlier' preference by landing before the gap", () => {
    const result = resolveCivil(local("2026-03-08 02:30:00"), "America/New_York", "earlier");
    expect(result.kind).toBe("gap");
    expect(reads(result.instantMs, "America/New_York")).toBe("2026-03-08 01:30:00");
  });

  it("treats 'later' the same as the compatible default", () => {
    const compatible = resolveCivil(local("2026-03-08 02:30:00"), "America/New_York");
    const later = resolveCivil(local("2026-03-08 02:30:00"), "America/New_York", "later");
    expect(later.instantMs).toBe(compatible.instantMs);
  });
});

describe("resolveCivil — fall-back overlaps", () => {
  it("takes the earlier of two New York instants by default", () => {
    // 2026-11-01 01:30 happens twice: 05:30Z (EDT) and 06:30Z (EST).
    const result = resolveCivil(local("2026-11-01 01:30:00"), "America/New_York");
    expect(result.kind).toBe("overlap");
    expect(result.offsetMinutes).toBe(-240);
    expect(result.instantMs).toBe(at("2026-11-01T05:30:00Z"));
  });

  it("takes the later instant on request", () => {
    const result = resolveCivil(local("2026-11-01 01:30:00"), "America/New_York", "later");
    expect(result.kind).toBe("overlap");
    expect(result.offsetMinutes).toBe(-300);
    expect(result.instantMs).toBe(at("2026-11-01T06:30:00Z"));
  });

  it("treats 'earlier' the same as the compatible default", () => {
    const compatible = resolveCivil(local("2026-11-01 01:30:00"), "America/New_York");
    const earlier = resolveCivil(local("2026-11-01 01:30:00"), "America/New_York", "earlier");
    expect(earlier.instantMs).toBe(compatible.instantMs);
  });

  it("handles the London overlap", () => {
    const result = resolveCivil(local("2026-10-25 01:30:00"), "Europe/London");
    expect(result.kind).toBe("overlap");
    expect(result.instantMs).toBe(at("2026-10-25T00:30:00Z"));
  });

  it("handles the southern-hemisphere overlap", () => {
    const result = resolveCivil(local("2026-04-05 02:30:00"), "Australia/Sydney");
    expect(result.kind).toBe("overlap");
    expect(result.instantMs).toBe(at("2026-04-04T15:30:00Z"));
  });

  it("handles a 30-minute overlap window", () => {
    // Lord Howe falls back 2026-04-05 02:00 -> 01:30: only 01:30-02:00 repeats.
    const result = resolveCivil(local("2026-04-05 01:45:00"), "Australia/Lord_Howe");
    expect(result.kind).toBe("overlap");
    expect(result.offsetMinutes).toBe(660);
  });
});

describe("the invariant the whole design exists for", () => {
  it("keeps a weekly 09:00 meeting at 09:00 across a DST transition", () => {
    const zone = "America/New_York";
    let reading = local("2026-03-01 09:00:00");
    const instants: number[] = [];
    for (let week = 0; week < 3; week++) {
      instants.push(civilToInstant(reading, zone));
      reading = addCivilDays(reading, 7);
    }
    // Every occurrence still reads 09:00 on the wall.
    for (const instant of instants) {
      expect(reads(instant, zone).slice(11)).toBe("09:00:00");
    }
    const [first, second, third] = instants;
    expect(first).toBe(at("2026-03-01T14:00:00Z")); // EST
    expect(second).toBe(at("2026-03-08T13:00:00Z")); // EDT — one hour "shorter" week
    expect(third).toBe(at("2026-03-15T13:00:00Z"));
    // The elapsed real time across the transition is 7 days minus an hour; after
    // it, exactly 7 days. A UTC-based expander would report 7 days for both and
    // drift the meeting to 08:00.
    expect((second ?? 0) - (first ?? 0)).toBe(7 * MS_PER_DAY - 60 * MS_PER_MINUTE);
    expect((third ?? 0) - (second ?? 0)).toBe(7 * MS_PER_DAY);
  });

  // 9 zones × 1,460 readings ≈ 39k Intl round-trips — deliberately exhaustive, and the
  // slowest test in the package by two orders of magnitude. It needs ~0.6 s on a dev
  // machine, but on CI it shares a 2-core runner with six other test files (including
  // the 535-case rrule corpus) and has measured 5,032 ms against vitest's 5,000 ms
  // default — a red that says nothing about correctness. The timeout is explicit and
  // generous here rather than a package-wide `testTimeout`, which would relax the limit
  // for the 38 fast tests too and let a genuine hang sit for half a minute.
  it("round-trips every reading that is not in a gap, in every corpus zone", () => {
    const zones = [
      "America/New_York",
      "Europe/London",
      "Australia/Sydney",
      "Australia/Lord_Howe",
      "Pacific/Chatham",
      "Asia/Kolkata",
      "Asia/Tehran",
      "Pacific/Kiritimati",
      "UTC",
    ];
    for (const zone of zones) {
      // Every 6 hours through 2026 — dense enough to land inside both transitions.
      for (let t = at("2026-01-01T00:00:00Z"); t < at("2027-01-01T00:00:00Z"); t += 6 * 3600_000) {
        const civil = instantToCivil(t, zone);
        const resolved = resolveCivil(civil, zone);
        // A reading produced *from* an instant always exists, so it is never a gap.
        expect(resolved.kind).not.toBe("gap");
        // It maps back to a reading identical to the one we started from — for an
        // overlap that may be the other of the two instants, which is correct.
        expect(civilEquals(instantToCivil(resolved.instantMs, zone), civil)).toBe(true);
      }
    }
  }, 30_000);
});

describe("canonicalizeTimeZone", () => {
  it("accepts a primary identifier", () => {
    expect(canonicalizeTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("accepts legacy aliases that Intl.supportedValuesOf omits", () => {
    // This is the whole reason the function exists rather than a list membership
    // test: all three are absent from supportedValuesOf on this runtime.
    for (const alias of ["US/Eastern", "Asia/Kolkata", "GMT"]) {
      expect(Intl.supportedValuesOf("timeZone")).not.toContain(alias);
      expect(canonicalizeTimeZone(alias)).not.toBeNull();
    }
  });

  it("resolves an alias and its primary to the same behaviour, whatever the spelling", () => {
    // Deliberately NOT asserting which spelling wins: this ICU build resolves
    // Asia/Kolkata *to* Asia/Calcutta, the reverse of the modern IANA primary, and
    // that can change with the runtime. Behaviour is the contract; spelling is not.
    const a = canonicalizeTimeZone("Asia/Kolkata");
    const b = canonicalizeTimeZone("Asia/Calcutta");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(offsetMinutesAt(JUL, a ?? "UTC")).toBe(offsetMinutesAt(JUL, b ?? "UTC"));
    expect(offsetMinutesAt(JUL, "Asia/Kolkata")).toBe(offsetMinutesAt(JUL, "Asia/Calcutta"));
  });

  it.each(["Not/AZone", "", "Mars/Olympus", "America/New_York "])("rejects %s", (value) => {
    expect(canonicalizeTimeZone(value)).toBeNull();
  });
});

describe("civilToInstant", () => {
  it("is resolveCivil without the resolution detail", () => {
    const reading = local("2026-07-15 09:00:00");
    expect(civilToInstant(reading, "Asia/Kolkata")).toBe(
      resolveCivil(reading, "Asia/Kolkata").instantMs,
    );
  });

  it("forwards the disambiguation argument", () => {
    const ambiguous = local("2026-11-01 01:30:00");
    expect(civilToInstant(ambiguous, "America/New_York", "later")).toBe(at("2026-11-01T06:30:00Z"));
  });

  it("reuses a cached formatter across calls for the same zone", () => {
    const first = civilToInstant(local("2026-05-01 08:00:00"), "Europe/Paris");
    const second = civilToInstant(local("2026-05-01 08:00:00"), "Europe/Paris");
    expect(second).toBe(first);
  });
});
