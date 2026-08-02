import { describe, expect, it } from "vitest";
import {
  classifyEventChange,
  type EventChangeFields,
  RECURRENCE_DATES_CHANGED,
  SERIES_UNCHANGED,
} from "@/lib/calendar/significant-change";

const base: EventChangeFields = {
  title: "Standup",
  description: null,
  location: null,
  url: null,
  color: null,
  status: "confirmed",
  visibility: "default",
  transparency: "opaque",
  allDay: false,
  startWall: "2026-08-10 09:00:00",
  startTzid: "America/New_York",
  endWall: "2026-08-10 09:30:00",
  endTzid: "America/New_York",
  rrule: null,
  calendarId: "b1c2d3e4-0000-4000-8000-000000000001",
};

const classify = (patch: Partial<EventChangeFields>) =>
  classifyEventChange(base, { ...base, ...patch });

/** Every field, with a value that differs from `base`, so the table below is exhaustive. */
const CHANGES: Array<[keyof EventChangeFields, Partial<EventChangeFields>]> = [
  ["title", { title: "Standup (daily)" }],
  ["description", { description: "Bring notes" }],
  ["location", { location: "Room 2" }],
  ["url", { url: "https://example.com/e/1" }],
  ["color", { color: "chart-2" }],
  ["status", { status: "tentative" }],
  ["visibility", { visibility: "private" }],
  ["transparency", { transparency: "transparent" }],
  ["allDay", { allDay: true }],
  ["startWall", { startWall: "2026-08-10 14:00:00" }],
  ["startTzid", { startTzid: "Europe/London" }],
  ["endWall", { endWall: "2026-08-10 10:30:00" }],
  ["endTzid", { endTzid: "Europe/London" }],
  ["rrule", { rrule: "FREQ=WEEKLY" }],
  ["calendarId", { calendarId: "b1c2d3e4-0000-4000-8000-000000000002" }],
];

const REASK: (keyof EventChangeFields)[] = [
  "startWall",
  "endWall",
  "startTzid",
  "endTzid",
  "allDay",
  "rrule",
];
const RESEND: (keyof EventChangeFields)[] = ["title", "location", "status", "calendarId"];
const BUMP: (keyof EventChangeFields)[] = ["transparency"];

describe("classifyEventChange — every field is classified, and the table proves it", () => {
  it("exercises one change per field of EventChangeFields", () => {
    expect(CHANGES).toHaveLength(Object.keys(base).length);
    expect(new Set(CHANGES.map(([field]) => field)).size).toBe(CHANGES.length);
  });

  it.each(CHANGES)("%s lands at its documented level", (field, patch) => {
    const result = classify(patch);
    expect({ field, ...result }).toEqual({
      field,
      reasks: REASK.includes(field),
      resends: REASK.includes(field) || RESEND.includes(field),
      bumpsSequence: REASK.includes(field) || RESEND.includes(field) || BUMP.includes(field),
    });
  });

  it("does nothing at all when nothing changed", () => {
    expect(classifyEventChange(base, { ...base })).toEqual({
      bumpsSequence: false,
      resends: false,
      reasks: false,
    });
  });
});

describe("classifyEventChange — the three levels are independent, not one flag", () => {
  it("a title edit resends but must NOT re-ask", () => {
    // The assertion that fails if the three booleans ever collapse back into one
    // "significant" level: a typo fix would then mark every guest stale.
    expect(classify({ title: "Stand-up" })).toEqual({
      bumpsSequence: true,
      resends: true,
      reasks: false,
    });
  });

  it("a free/busy change bumps SEQUENCE but sends no email", () => {
    expect(classify({ transparency: "transparent" })).toEqual({
      bumpsSequence: true,
      resends: false,
      reasks: false,
    });
  });

  it("a description edit is silent — the case the whole classifier exists for", () => {
    expect(classify({ description: "typo fixed" })).toEqual({
      bumpsSequence: false,
      resends: false,
      reasks: false,
    });
  });

  it("a move in time re-asks", () => {
    expect(classify({ startWall: "2026-08-10 16:00:00" })).toEqual({
      bumpsSequence: true,
      resends: true,
      reasks: true,
    });
  });

  it("takes the strongest level when an edit touches several fields at once", () => {
    expect(
      classify({ description: "notes", title: "New", startWall: "2026-08-11 09:00:00" }),
    ).toEqual({ bumpsSequence: true, resends: true, reasks: true });
    expect(classify({ description: "notes", transparency: "transparent" })).toEqual({
      bumpsSequence: true,
      resends: false,
      reasks: false,
    });
    expect(classify({ color: "chart-3", location: "Room 9" })).toEqual({
      bumpsSequence: true,
      resends: true,
      reasks: false,
    });
  });

  it("treats a same-instant zone change as a re-ask, since the wall reading moved for someone", () => {
    expect(classify({ startTzid: "America/Toronto" }).reasks).toBe(true);
  });
});

describe("the two changes that bypass the field diff", () => {
  it("a new EXDATE/RDATE or a truncated series resends without re-asking", () => {
    // skipOccurrence, setRecurrenceDate and truncateSeries move dates a client renders
    // while touching no column above — classify by field alone and they ship an inert
    // SEQUENCE:0 attachment.
    expect(RECURRENCE_DATES_CHANGED).toEqual({
      bumpsSequence: true,
      resends: true,
      reasks: false,
    });
  });

  it("an untouched series does nothing", () => {
    expect(SERIES_UNCHANGED).toEqual({ bumpsSequence: false, resends: false, reasks: false });
  });
});
