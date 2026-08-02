import { describe, expect, it } from "vitest";
import { type IcsEvent, type IcsOverride, type IcsSeries, serializeIcs } from "./ics";

/** 2026-08-10T12:00:00Z — a fixed clock, because this package may never read one. */
const DTSTAMP_MS = Date.UTC(2026, 7, 10, 12, 0, 0);
const PRODID = "-//next-web-boilerplate//calendar//EN";

const master: IcsEvent = {
  uid: "3f1c6a2e-0b4d-4f8a-9c11-7e2d5a8b1234",
  sequence: 0,
  title: "Standup",
  description: null,
  location: null,
  url: null,
  status: "confirmed",
  transparency: "opaque",
  allDay: false,
  startWall: "2026-08-10 09:00:00",
  startTzid: "America/New_York",
  endWall: "2026-08-10 09:30:00",
  endTzid: "America/New_York",
};

const series: IcsSeries = {
  master,
  rrule: null,
  exdates: [],
  rdates: [],
  overrides: [],
  organizerEmail: null,
  organizerName: null,
};

function render(overrides: Partial<IcsSeries> = {}): string {
  return serializeIcs({
    series: { ...series, ...overrides },
    dtstampMs: DTSTAMP_MS,
    productId: PRODID,
  });
}

/** Physical lines, with the trailing empty entry the final CRLF produces dropped. */
function lines(ics: string): string[] {
  const parts = ics.split("\r\n");
  expect(parts.at(-1)).toBe("");
  return parts.slice(0, -1);
}

const octets = (value: string) => new TextEncoder().encode(value).length;

describe("serializeIcs — the shape every client parses", () => {
  it("wraps a VEVENT in a PUBLISH calendar and terminates every line with CRLF", () => {
    const ics = render();
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
    expect(lines(ics)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:${PRODID}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:3f1c6a2e-0b4d-4f8a-9c11-7e2d5a8b1234",
      "DTSTAMP:20260810T120000Z",
      "SEQUENCE:0",
      "DTSTART;TZID=America/New_York:20260810T090000",
      "DTEND;TZID=America/New_York:20260810T093000",
      "SUMMARY:Standup",
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });

  it("emits DTSTAMP in UTC from the caller's clock, not from a Date it constructed", () => {
    const ics = render();
    expect(ics).toContain("DTSTAMP:20260810T120000Z");
    // A different clock must move it, or the parameter is decorative.
    const later = serializeIcs({
      series,
      dtstampMs: Date.UTC(2027, 0, 2, 3, 4, 5),
      productId: PRODID,
    });
    expect(later).toContain("DTSTAMP:20270102T030405Z");
  });

  it("zero-pads a year below 1000 rather than emitting a short DATE-TIME", () => {
    const ics = render({
      master: { ...master, startWall: "0999-01-02 03:04:05", endWall: "0999-01-02 04:00:00" },
    });
    expect(ics).toContain("DTSTART;TZID=America/New_York:09990102T030405");
  });
});

describe("serializeIcs — the ATTENDEE line that must never come back", () => {
  // The buttons that line produces in Gmail send METHOD:REPLY to an address nothing here
  // reads, so the guest believes they answered and the database never hears. This is a
  // test rather than a comment because a helpful commit is all it would take.
  it("emits no ATTENDEE property, even for a series with overrides and an organizer", () => {
    const ics = render({
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      organizerEmail: "ada@example.com",
      organizerName: "Ada",
      overrides: [
        {
          ...master,
          recurrenceId: "2026-08-17 09:00:00",
          recurrenceTzid: "America/New_York",
          startWall: "2026-08-17 14:00:00",
          endWall: "2026-08-17 14:30:00",
        },
      ],
    });
    expect(lines(ics).some((line) => line.startsWith("ATTENDEE"))).toBe(false);
    expect(ics).not.toContain("ATTENDEE");
    expect(ics).not.toContain("METHOD:REQUEST");
  });

  it("emits no VTIMEZONE — Phase 4 ships a bare TZID, documented as such", () => {
    expect(render({ rrule: "FREQ=DAILY" })).not.toContain("VTIMEZONE");
  });
});

describe("serializeIcs — recurrence", () => {
  it("emits the stored RRULE verbatim and omits the property when there is none", () => {
    expect(render({ rrule: "FREQ=WEEKLY;BYDAY=MO,WE" })).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE");
    expect(render()).not.toContain("RRULE:");
  });

  it("emits one EXDATE and one RDATE property per value, each carrying the TZID", () => {
    const ics = render({
      rrule: "FREQ=WEEKLY",
      exdates: ["2026-08-17 09:00:00", "2026-08-24 09:00:00"],
      rdates: ["2026-09-01 09:00:00"],
    });
    expect(lines(ics).filter((line) => line.startsWith("EXDATE"))).toEqual([
      "EXDATE;TZID=America/New_York:20260817T090000",
      "EXDATE;TZID=America/New_York:20260824T090000",
    ]);
    expect(ics).toContain("RDATE;TZID=America/New_York:20260901T090000");
  });

  it("emits a live override as a sibling VEVENT sharing the master's UID", () => {
    const override: IcsOverride = {
      ...master,
      sequence: 2,
      title: "Standup (moved)",
      recurrenceId: "2026-08-17 09:00:00",
      recurrenceTzid: "America/New_York",
      startWall: "2026-08-17 14:00:00",
      endWall: "2026-08-17 14:30:00",
    };
    const ics = render({ rrule: "FREQ=WEEKLY", overrides: [override] });

    expect(lines(ics).filter((line) => line === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines(ics).filter((line) => line.startsWith("UID:"))).toEqual([
      `UID:${master.uid}`,
      `UID:${master.uid}`,
    ]);
    expect(ics).toContain("RECURRENCE-ID;TZID=America/New_York:20260817T090000");
    expect(ics).toContain("DTSTART;TZID=America/New_York:20260817T140000");
    expect(ics).toContain("SUMMARY:Standup (moved)");
    expect(ics).toContain("SEQUENCE:2");
  });

  it("repeats the ORGANIZER on each sibling VEVENT, since PUBLISH requires it per component", () => {
    const ics = render({
      organizerEmail: "ada@example.com",
      organizerName: null,
      overrides: [
        { ...master, recurrenceId: "2026-08-17 09:00:00", recurrenceTzid: "America/New_York" },
      ],
    });
    expect(lines(ics).filter((line) => line.startsWith("ORGANIZER"))).toEqual([
      "ORGANIZER:mailto:ada@example.com",
      "ORGANIZER:mailto:ada@example.com",
    ]);
  });
});

describe("serializeIcs — all-day events float", () => {
  it("emits VALUE=DATE with no TZID, so the day does not shift for a guest in another zone", () => {
    const ics = render({
      master: {
        ...master,
        allDay: true,
        startWall: "2026-08-10 00:00:00",
        endWall: "2026-08-11 00:00:00",
      },
      exdates: ["2026-08-17 00:00:00"],
      rdates: ["2026-08-24 00:00:00"],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260810");
    expect(ics).toContain("DTEND;VALUE=DATE:20260811");
    expect(ics).toContain("EXDATE;VALUE=DATE:20260817");
    expect(ics).toContain("RDATE;VALUE=DATE:20260824");
    expect(ics).not.toContain("TZID");
  });

  it("emits RECURRENCE-ID as a DATE for an all-day override", () => {
    const ics = render({
      master: { ...master, allDay: true },
      overrides: [
        {
          ...master,
          allDay: true,
          recurrenceId: "2026-08-17 00:00:00",
          recurrenceTzid: "America/New_York",
        },
      ],
    });
    expect(ics).toContain("RECURRENCE-ID;VALUE=DATE:20260817");
  });
});

describe("serializeIcs — optional properties", () => {
  it("emits DESCRIPTION, LOCATION and URL when present", () => {
    const ics = render({
      master: {
        ...master,
        description: "Bring notes",
        location: "Room 2",
        url: "https://example.com/e/1",
      },
    });
    expect(ics).toContain("DESCRIPTION:Bring notes");
    expect(ics).toContain("LOCATION:Room 2");
    expect(ics).toContain("URL:https://example.com/e/1");
  });

  it("omits them when null, and equally when an empty string reaches the serializer", () => {
    const nulled = render();
    expect(nulled).not.toContain("DESCRIPTION");
    expect(nulled).not.toContain("LOCATION");
    expect(nulled).not.toContain("URL");

    const blank = render({ master: { ...master, description: "", location: "", url: "" } });
    expect(blank).not.toContain("DESCRIPTION");
    expect(blank).not.toContain("LOCATION");
    expect(blank).not.toContain("URL");
  });

  it("upper-cases STATUS and TRANSP, including the cancelled status the delete path derives", () => {
    const ics = render({
      master: { ...master, status: "cancelled", transparency: "transparent" },
    });
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("TRANSP:TRANSPARENT");
  });

  it("omits ORGANIZER entirely when there is no address, and quotes a CN when there is a name", () => {
    expect(render()).not.toContain("ORGANIZER");
    expect(render({ organizerEmail: "" })).not.toContain("ORGANIZER");
    expect(render({ organizerEmail: "ada@example.com", organizerName: "" })).toContain(
      "ORGANIZER:mailto:ada@example.com",
    );
    expect(render({ organizerEmail: "ada@example.com", organizerName: "Ada L" })).toContain(
      "ORGANIZER;CN=Ada L:mailto:ada@example.com",
    );
  });
});

describe("escaping — RFC 5545 §3.3.11", () => {
  it("escapes backslash first, then the separators, so escapes are not re-escaped", () => {
    const ics = render({ master: { ...master, title: String.raw`a\b;c,d` } });
    expect(ics).toContain(String.raw`SUMMARY:a\\b\;c\,d`);
  });

  it("collapses a CRLF to one \\n rather than two, and escapes a bare LF and CR alike", () => {
    expect(render({ master: { ...master, description: "one\r\ntwo" } })).toContain(
      String.raw`DESCRIPTION:one\ntwo`,
    );
    expect(render({ master: { ...master, description: "one\ntwo" } })).toContain(
      String.raw`DESCRIPTION:one\ntwo`,
    );
    expect(render({ master: { ...master, description: "one\rtwo" } })).toContain(
      String.raw`DESCRIPTION:one\ntwo`,
    );
  });

  it("strips the control characters a TEXT value may not carry, but keeps a tab", () => {
    const ics = render({
      master: { ...master, description: "a\u0001b\u0000c\u007fd\u001fe\tf" },
    });
    expect(ics).toContain("DESCRIPTION:abcde\tf");
  });

  it("escapes a CN in the ORGANIZER, which is a TEXT value too", () => {
    expect(render({ organizerEmail: "a@b.c", organizerName: "Doe, Jane" })).toContain(
      String.raw`ORGANIZER;CN=Doe\, Jane:mailto:a@b.c`,
    );
  });
});

describe("folding — 75 octets, never mid-character", () => {
  it("leaves a line at or under 75 octets untouched", () => {
    const ics = render();
    for (const line of lines(ics)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("SUMMARY:Standup\r\n");
  });

  it("folds a long ASCII line onto continuations that each begin with one space", () => {
    const ics = render({ master: { ...master, title: "x".repeat(300) } });
    const physical = lines(ics);
    const start = physical.findIndex((line) => line.startsWith("SUMMARY:"));
    expect(physical[start]).toHaveLength(75);

    let continuations = 0;
    for (let i = start + 1; i < physical.length && physical[i]?.startsWith(" "); i += 1) {
      expect(octets(physical[i] as string)).toBeLessThanOrEqual(75);
      continuations += 1;
    }
    expect(continuations).toBeGreaterThan(0);

    // Unfolding is the inverse: drop each CRLF followed by a space.
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${"x".repeat(300)}`);
  });

  it("never splits a multi-byte sequence, even when the boundary lands inside one", () => {
    // "SUMMARY:" is 8 octets; 64 ASCII characters take the line to 72, so the next
    // character — a 4-octet emoji, which is also a surrogate pair in JS — cannot fit in
    // the remaining 3 and must move whole to the continuation.
    const title = `${"a".repeat(64)}${"\u{1F600}".repeat(6)}`;
    const ics = render({ master: { ...master, title } });

    for (const line of lines(ics)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(ics).not.toContain("�");
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);

    const first = lines(ics).find((line) => line.startsWith("SUMMARY:"));
    expect(first).toBe(`SUMMARY:${"a".repeat(64)}`);
    expect(octets(first as string)).toBe(72);
  });

  it("folds a line made entirely of multi-byte characters without loss", () => {
    const title = "\u{1F600}".repeat(40);
    const ics = render({ master: { ...master, title } });
    for (const line of lines(ics)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);
  });
});
