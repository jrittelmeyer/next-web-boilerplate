import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelect, enqueue } = vi.hoisted(() => ({ dbSelect: vi.fn(), enqueue: vi.fn() }));
vi.mock("@repo/db", () => ({ db: { select: dbSelect } }));
vi.mock("@repo/jobs", () => ({ enqueue, JOBS: { calendarInvitation: "calendar-invitation" } }));

import {
  enqueueCancellations,
  enqueueInvitations,
  enqueueSeriesUpdate,
  rsvpUrlFor,
} from "./invitations";

const MASTER = "11111111-2222-4333-8444-555555555555";
const A1 = "3f1c6a2e-0b4d-4f8a-9c11-7e2d5a8b1234";
const A2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const master = {
  uid: "uid-1",
  sequence: 3,
  title: "Standup",
  description: null,
  location: "Room 2",
  url: null,
  status: "confirmed" as const,
  transparency: "opaque" as const,
  allDay: false,
  startWall: "2026-08-10 09:00:00",
  startTzid: "America/New_York",
  endWall: "2026-08-10 09:30:00",
  endTzid: "America/New_York",
  rrule: "FREQ=WEEKLY",
  seriesEndAt: null as Date | null,
};

/**
 * `loadSeriesForEmail` issues three reads in order (event, overrides, recurrence dates) and
 * `loadRecipients` a fourth; the queue serves them in call order.
 */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  dbSelect.mockImplementation(() => {
    const rows = results[call] ?? [];
    call += 1;
    const settled = () =>
      Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
    const tail: { where: typeof settled; innerJoin: () => typeof tail } = {
      where: settled,
      innerJoin: () => tail,
    };
    return { from: () => tail };
  });
}

const eventRow = [{ event: master, organizerEmail: "ada@example.com" }];

beforeEach(() => {
  vi.clearAllMocks();
  enqueue.mockResolvedValue(undefined);
});

// `formatEventWhen` moved to `@repo/email` in Phase 5, with its tests
// (`packages/email/src/format.test.ts`) — the reminder sweeper in `@repo/jobs` became a
// second caller and cannot reach `apps/web`.

describe("rsvpUrlFor", () => {
  it("builds a dot-free link under /rsvp", () => {
    const url = rsvpUrlFor(A1, null);
    const path = url.slice(url.indexOf("/rsvp/"));
    expect(path.startsWith("/rsvp/")).toBe(true);
    // The token half must never contain a dot: proxy.ts excludes dotted paths, so a dotted
    // token 404s every invitation in production.
    expect(path.slice("/rsvp/".length)).not.toContain(".");
  });

  it("gives two attendees two different links", () => {
    expect(rsvpUrlFor(A1, null)).not.toBe(rsvpUrlFor(A2, null));
  });
});

describe("enqueueInvitations", () => {
  it("sends one job per recipient, each with its own link and the same .ics", async () => {
    queueSelects(eventRow, [], []);
    await enqueueInvitations(MASTER, [
      { attendeeId: A1, email: "one@example.com" },
      { attendeeId: A2, email: "two@example.com" },
    ]);

    expect(enqueue).toHaveBeenCalledTimes(2);
    const payloads = enqueue.mock.calls.map(([, payload]) => payload);
    expect(payloads.map((p) => p.to)).toEqual(["one@example.com", "two@example.com"]);
    expect(new Set(payloads.map((p) => p.rsvpUrl)).size).toBe(2);
    expect(payloads[0].kind).toBe("invite");
    expect(payloads[0].ics).toContain("METHOD:PUBLISH");
    expect(payloads[0].ics).toContain("UID:uid-1");
    expect(payloads[0].ics).toContain("SEQUENCE:3");
    expect(payloads[0].ics).not.toContain("ATTENDEE");
    expect(payloads[0].when).toBe("Monday, 10 August 2026 at 09:00 (America/New_York)");
  });

  it("does nothing, and reads nothing, when nobody was added", async () => {
    await enqueueInvitations(MASTER, []);
    expect(enqueue).not.toHaveBeenCalled();
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("gives up quietly when the event has vanished", async () => {
    queueSelects([], [], []);
    await enqueueInvitations(MASTER, [{ attendeeId: A1, email: "one@example.com" }]);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("the .ics an update carries", () => {
  it("emits a live override as a RECURRENCE-ID sibling and a deleted one as an EXDATE", async () => {
    // Recipients are read FIRST by enqueueSeriesUpdate, then the series it will describe.
    queueSelects(
      [{ attendeeId: A1, email: "one@example.com" }],
      eventRow,
      [
        {
          ...master,
          id: "o1",
          recurrenceId: "2026-08-17 09:00:00",
          deletedAt: null,
          startWall: "2026-08-17 14:00:00",
          endWall: "2026-08-17 14:30:00",
        },
        { ...master, id: "o2", recurrenceId: "2026-08-24 09:00:00", deletedAt: new Date() },
      ],
      [{ kind: "exdate", dateWall: "2026-08-31 09:00:00" }],
    );

    await enqueueSeriesUpdate(MASTER, true);

    const ics = enqueue.mock.calls[0]?.[1].ics as string;
    // The moved occurrence: without this the guest's client expands the RRULE and shows
    // 09:00 forever.
    expect(ics).toContain("RECURRENCE-ID;TZID=America/New_York:20260817T090000");
    expect(ics).toContain("DTSTART;TZID=America/New_York:20260817T140000");
    // The deleted one is an absence, not a component — merged with the stored EXDATE rows.
    expect(ics).toContain("EXDATE;TZID=America/New_York:20260824T090000");
    expect(ics).toContain("EXDATE;TZID=America/New_York:20260831T090000");
    expect(enqueue.mock.calls[0]?.[1].reask).toBe(true);
  });
});

describe("enqueueSeriesUpdate", () => {
  it("skips a guest invited by the very same save", async () => {
    queueSelects(
      [
        { attendeeId: A1, email: "old@example.com" },
        { attendeeId: A2, email: "new@example.com" },
      ],
      eventRow,
      [],
      [],
    );
    // A2 is getting a full invitation; an update beside it would be a second message about
    // an event they have not been told about yet.
    await enqueueSeriesUpdate(MASTER, false, [A2]);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[1].to).toBe("old@example.com");
  });

  it("sends nothing — and does not even build the .ics — when every guest is excluded", async () => {
    queueSelects([{ attendeeId: A1, email: "one@example.com" }]);
    await enqueueSeriesUpdate(MASTER, false, [A1]);
    expect(enqueue).not.toHaveBeenCalled();
    expect(dbSelect).toHaveBeenCalledTimes(1);
  });
});

describe("enqueueCancellations — the attachment is the whole difference", () => {
  it("attaches a STATUS:CANCELLED calendar when the EVENT was deleted", async () => {
    queueSelects(eventRow, [], []);
    await enqueueCancellations(MASTER, ["one@example.com"], "cancelled");

    const payload = enqueue.mock.calls[0]?.[1];
    expect(payload.reason).toBe("cancelled");
    expect(payload.ics).toContain("STATUS:CANCELLED");
    expect(payload.ics).toContain("UID:uid-1");
  });

  it("attaches NOTHING when a guest was removed from a live event", async () => {
    queueSelects(eventRow, [], []);
    await enqueueCancellations(MASTER, ["one@example.com"], "removed");

    const payload = enqueue.mock.calls[0]?.[1];
    expect(payload.reason).toBe("removed");
    // The event is still going ahead for everyone else; a client applying STATUS:CANCELLED
    // would delete a live event out of their calendar.
    expect(payload.ics).toBeNull();
  });

  it("does nothing for an empty address list", async () => {
    await enqueueCancellations(MASTER, [], "cancelled");
    expect(enqueue).not.toHaveBeenCalled();
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("gives up quietly when the event has vanished", async () => {
    queueSelects([], [], []);
    await enqueueCancellations(MASTER, ["one@example.com"], "cancelled");
    expect(enqueue).not.toHaveBeenCalled();
  });
});
