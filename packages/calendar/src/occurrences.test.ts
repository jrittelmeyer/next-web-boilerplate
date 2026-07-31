import { describe, expect, it } from "vitest";
import { MS_PER_DAY, toDayNumber } from "./civil";
import { expandSeries, type SeriesInput, seriesEndInstantMs } from "./occurrences";
import { instantToCivil } from "./timezone";

const utcMs = (year: number, month: number, day: number) =>
  toDayNumber(year, month, day) * MS_PER_DAY;

function series(overrides: Partial<SeriesInput> = {}): SeriesInput {
  return {
    rrule: "FREQ=WEEKLY",
    startWall: "2027-01-04 09:00:00",
    startTzid: "America/New_York",
    endWall: "2027-01-04 10:00:00",
    endTzid: "America/New_York",
    exdates: [],
    rdates: [],
    overriddenRecurrenceIds: [],
    ...overrides,
  };
}

const MONTH = { fromMs: utcMs(2027, 1, 1), toMs: utcMs(2027, 2, 1) };

describe("expandSeries", () => {
  it("materialises both ends, both offsets and both instants", () => {
    const [first] = expandSeries(series(), MONTH, 50).occurrences;
    expect(first).toMatchObject({
      recurrenceId: "2027-01-04 09:00:00",
      startWall: "2027-01-04 09:00:00",
      endWall: "2027-01-04 10:00:00",
      startOffsetMinutes: -300,
      endOffsetMinutes: -300,
    });
    // The shape `calendar_events_start_at_derived` accepts: instant equals wall minus
    // the stored offset, read as UTC.
    expect(first?.startAtMs).toBe(Date.UTC(2027, 0, 4, 14, 0, 0));
  });

  it("shifts the end by whole DAYS, so independent zones survive", () => {
    // A flight departing 09:00 New York and arriving 11:30 Los Angeles. There is no
    // meaningful "duration in wall minutes" here — the correct invariant is that each
    // end keeps its own wall time in its own zone, every week.
    const flight = series({
      startWall: "2027-01-04 09:00:00",
      startTzid: "America/New_York",
      endWall: "2027-01-04 11:30:00",
      endTzid: "America/Los_Angeles",
    });
    for (const occurrence of expandSeries(flight, MONTH, 50).occurrences) {
      expect(occurrence.startWall.endsWith(" 09:00:00")).toBe(true);
      expect(occurrence.endWall.endsWith(" 11:30:00")).toBe(true);
      // 09:00 EST to 11:30 PST really is five and a half hours.
      expect(occurrence.endAtMs - occurrence.startAtMs).toBe(5.5 * 3600 * 1000);
    }
  });

  it("carries a span that crosses midnight onto the right day", () => {
    const overnight = series({ startWall: "2027-01-04 23:00:00", endWall: "2027-01-05 01:00:00" });
    const [first] = expandSeries(overnight, MONTH, 50).occurrences;
    expect(first?.endWall).toBe("2027-01-05 01:00:00");
    const second = expandSeries(overnight, MONTH, 50).occurrences[1];
    expect(second?.startWall).toBe("2027-01-11 23:00:00");
    expect(second?.endWall).toBe("2027-01-12 01:00:00");
  });

  it("subtracts EXDATEs", () => {
    const result = expandSeries(series({ exdates: ["2027-01-11 09:00:00"] }), MONTH, 50);
    expect(result.occurrences.map((occurrence) => occurrence.recurrenceId)).toEqual([
      "2027-01-04 09:00:00",
      "2027-01-18 09:00:00",
      "2027-01-25 09:00:00",
    ]);
  });

  it("subtracts occurrences that already have an override row", () => {
    // The override arrives through the range query's concrete branch. Emitting it here
    // too would paint it twice — once where it moved to, once where it used to be.
    const result = expandSeries(
      series({ overriddenRecurrenceIds: ["2027-01-18 09:00:00"] }),
      MONTH,
      50,
    );
    expect(result.occurrences.map((occurrence) => occurrence.recurrenceId)).not.toContain(
      "2027-01-18 09:00:00",
    );
  });

  it("adds RDATEs inside the window, and ignores ones outside it", () => {
    const result = expandSeries(
      series({ rdates: ["2027-01-06 09:00:00", "2027-09-09 09:00:00"] }),
      MONTH,
      50,
    );
    const ids = result.occurrences.map((occurrence) => occurrence.recurrenceId);
    expect(ids).toContain("2027-01-06 09:00:00");
    expect(ids).not.toContain("2027-09-09 09:00:00");
    // Sorted by instant, so an added date lands in sequence rather than at the end.
    expect(ids[1]).toBe("2027-01-06 09:00:00");
  });

  it("collapses an RDATE that duplicates a generated occurrence", () => {
    const result = expandSeries(series({ rdates: ["2027-01-11 09:00:00"] }), MONTH, 50);
    const ids = result.occurrences.map((occurrence) => occurrence.recurrenceId);
    expect(ids.filter((id) => id === "2027-01-11 09:00:00")).toHaveLength(1);
  });

  it("applies EXDATE after RDATE, so a skip beats an addition", () => {
    const result = expandSeries(
      series({ rdates: ["2027-01-06 09:00:00"], exdates: ["2027-01-06 09:00:00"] }),
      MONTH,
      50,
    );
    expect(result.occurrences.map((occurrence) => occurrence.recurrenceId)).not.toContain(
      "2027-01-06 09:00:00",
    );
  });

  it("caps and reports truncation", () => {
    const result = expandSeries(series(), MONTH, 2);
    expect(result.occurrences).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("does not claim truncation when the window simply ended", () => {
    expect(expandSeries(series(), MONTH, 50).truncated).toBe(false);
  });

  it("caps again after RDATEs, which are added past the rule's own limit", () => {
    // The rule expansion respects `limit`, so only an RDATE can push the merged list
    // over it. Without the second cap a caller asking for two occurrences gets three.
    const result = expandSeries(series({ rdates: ["2027-01-06 09:00:00"] }), MONTH, 2);
    expect(result.occurrences.map((occurrence) => occurrence.recurrenceId)).toEqual([
      "2027-01-04 09:00:00",
      "2027-01-06 09:00:00",
    ]);
    expect(result.truncated).toBe(true);
  });
});

describe("seriesEndInstantMs", () => {
  it("is null for an unbounded series", () => {
    expect(seriesEndInstantMs(series())).toBeNull();
  });

  it("bounds an UNTIL series without expanding it", () => {
    const end = seriesEndInstantMs(series({ rrule: "FREQ=WEEKLY;UNTIL=20270201T140000Z" }));
    // UNTIL plus the nominal span. A deliberate over-estimate: the range query uses this
    // to EXCLUDE masters, so being late costs a wasted expansion and being early makes a
    // whole series vanish.
    expect(end).toBe(Date.UTC(2027, 1, 1, 15, 0, 0));
  });

  it("walks a COUNT series to its last occurrence", () => {
    const end = seriesEndInstantMs(series({ rrule: "FREQ=WEEKLY;COUNT=3" }));
    expect(end).not.toBeNull();
    // Third occurrence is 2027-01-18, ending 10:00 New York.
    expect(instantToCivil(end ?? 0, "America/New_York")).toMatchObject({
      year: 2027,
      month: 1,
      day: 18,
      hour: 10,
    });
  });

  it("is deliberately blind to EXDATEs, so it can only over-estimate", () => {
    const withSkip = seriesEndInstantMs(
      series({ rrule: "FREQ=WEEKLY;COUNT=3", exdates: ["2027-01-18 09:00:00"] }),
    );
    const without = seriesEndInstantMs(series({ rrule: "FREQ=WEEKLY;COUNT=3" }));
    expect(withSkip).toBe(without);
  });

  it("extends past the rule when an RDATE lands beyond it", () => {
    const end = seriesEndInstantMs(
      series({ rrule: "FREQ=WEEKLY;COUNT=3", rdates: ["2027-09-09 09:00:00"] }),
    );
    expect(instantToCivil(end ?? 0, "America/New_York")).toMatchObject({ year: 2027, month: 9 });
  });

  it("takes the LATEST RDATE, not the last one listed", () => {
    const end = seriesEndInstantMs(
      series({
        rrule: "FREQ=WEEKLY;COUNT=3",
        rdates: ["2027-11-11 09:00:00", "2027-09-09 09:00:00"],
      }),
    );
    expect(instantToCivil(end ?? 0, "America/New_York")).toMatchObject({ year: 2027, month: 11 });
  });

  it("keeps an RDATE that falls inside the rule's own range from shortening it", () => {
    const end = seriesEndInstantMs(
      series({ rrule: "FREQ=WEEKLY;COUNT=3", rdates: ["2027-01-05 09:00:00"] }),
    );
    expect(instantToCivil(end ?? 0, "America/New_York")).toMatchObject({ day: 18 });
  });

  it("is null for a rule that can never occur", () => {
    // Legal to write, impossible to hit. A series that can never occur has no end.
    expect(
      seriesEndInstantMs(series({ rrule: "FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=30;COUNT=3" })),
    ).toBeNull();
  });
});
