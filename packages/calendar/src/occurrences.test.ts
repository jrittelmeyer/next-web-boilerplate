import { describe, expect, it } from "vitest";
import { type LocalDateTime, MS_PER_DAY, parseLocalDateTime, toDayNumber } from "./civil";
import {
  type ExpandSeriesResult,
  expandSeries,
  type SeriesInput,
  seriesEndInstantMs,
} from "./occurrences";
import { civilToInstant, instantToCivil } from "./timezone";

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

/**
 * `match: "overlaps"` — the mode `calendar.range` uses.
 *
 * Selecting by START instant was the only one of the range query's three layers that did
 * not use overlap semantics (branch A: `start_at <= to AND end_at >= from`; branch B's
 * master selection: `series_end_at >= from`), so a recurring occurrence that began before
 * the window and was still running when it opened vanished — while a byte-identical
 * one-off in the same slot rendered.
 */
describe("expandSeries — match: overlaps", () => {
  const NY = "America/New_York";
  const nyInstant = (wall: LocalDateTime) => civilToInstant(parseLocalDateTime(wall), NY);
  const recurrenceIds = (result: ExpandSeriesResult) =>
    result.occurrences.map((occurrence) => occurrence.recurrenceId);

  /** Weekly Monday 22:00 → Tuesday 02:00: four hours, crossing midnight. */
  const overnight = series({
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    startWall: "2027-01-04 22:00:00",
    endWall: "2027-01-05 02:00:00",
  });

  /** Weekly Monday 09:00 → Thursday 17:00: the multi-day shape the pad cannot mask. */
  const multiDay = series({
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    startWall: "2027-01-04 09:00:00",
    endWall: "2027-01-07 17:00:00",
  });

  it("returns an overnight occurrence that is still running when the window opens", () => {
    const window = {
      fromMs: nyInstant("2027-01-05 00:00:00"),
      toMs: nyInstant("2027-01-20 00:00:00"),
    };
    expect(recurrenceIds(expandSeries(overnight, { ...window, match: "overlaps" }, 50))).toContain(
      "2027-01-04 22:00:00",
    );
    // The defect, pinned: the same window under the default drops it.
    expect(recurrenceIds(expandSeries(overnight, window, 50))).not.toContain("2027-01-04 22:00:00");
  });

  it("returns a multi-day occurrence that straddles the window's opening", () => {
    const window = {
      fromMs: nyInstant("2027-01-06 00:00:00"),
      toMs: nyInstant("2027-01-20 00:00:00"),
      match: "overlaps" as const,
    };
    expect(recurrenceIds(expandSeries(multiDay, window, 50))).toEqual([
      "2027-01-04 09:00:00",
      "2027-01-11 09:00:00",
      "2027-01-18 09:00:00",
    ]);
  });

  it("still suppresses a straddling occurrence that already has an override row", () => {
    // The regression this mode could most easily have introduced. The override arrives
    // separately through the range query's concrete branch, painted at the time it was
    // MOVED to; emitting the base occurrence here as well would show the user the
    // occurrence they moved, still sitting in the slot they moved it out of. The
    // suppression list has to reach back as far as expansion now does — which is why
    // `suppressionBounds` in the range query carries the same span slack as the window.
    const window = {
      fromMs: nyInstant("2027-01-06 00:00:00"),
      toMs: nyInstant("2027-01-20 00:00:00"),
      match: "overlaps" as const,
    };
    const result = expandSeries(
      { ...multiDay, overriddenRecurrenceIds: ["2027-01-04 09:00:00"] },
      window,
      50,
    );
    expect(recurrenceIds(result)).not.toContain("2027-01-04 09:00:00");
    expect(recurrenceIds(result)).toEqual(["2027-01-11 09:00:00", "2027-01-18 09:00:00"]);
  });

  it("catches an occurrence whose real span exceeds its nominal one across a fall-back transition", () => {
    // `materialise` shifts the end by whole DAYS and re-resolves the offset, so this
    // "3-day" series is 73 hours over the November transition, not 72. An implementation
    // that widened the lower bound by the NOMINAL span would drop this occurrence; the
    // exact end-instant test does not. The transition must be the fall-back one — a
    // spring-forward fixture passes on the broken implementation.
    const firstStart = nyInstant("2027-11-05 09:00:00");
    const window = {
      fromMs: firstStart + 72.5 * 60 * 60 * 1000,
      toMs: nyInstant("2027-11-20 00:00:00"),
      match: "overlaps" as const,
    };
    // Guards the fixture itself: if this stops exceeding the nominal span, the test has
    // stopped exercising the thing it was written for.
    expect(window.fromMs - firstStart).toBeGreaterThan(3 * MS_PER_DAY);
    expect(
      recurrenceIds(
        expandSeries(
          series({
            rrule: "FREQ=WEEKLY;BYDAY=FR",
            startWall: "2027-11-05 09:00:00",
            endWall: "2027-11-08 09:00:00",
          }),
          window,
          50,
        ),
      ),
    ).toContain("2027-11-05 09:00:00");
  });

  it("catches an all-day series whose zone puts its start a day behind the viewer's", () => {
    // All-day rows are placed by wall date but fetched by instant, so a +14 zone starts
    // an "exactly one day" occurrence 14 hours before a UTC window that it still
    // overlaps. This is the case the month grid's ±1 day of padding does NOT mask.
    const allDay = series({
      rrule: "FREQ=DAILY",
      startWall: "2027-01-03 00:00:00",
      startTzid: "Pacific/Kiritimati",
      endWall: "2027-01-04 00:00:00",
      endTzid: "Pacific/Kiritimati",
    });
    const window = { fromMs: utcMs(2027, 1, 4), toMs: utcMs(2027, 1, 10) };
    // The 01-04 occurrence begins at 2027-01-03 10:00 UTC — 14 hours before a window a
    // UTC viewer opens on 01-04 — and runs until 01-04 10:00 UTC, so it overlaps.
    expect(recurrenceIds(expandSeries(allDay, { ...window, match: "overlaps" }, 50))).toContain(
      "2027-01-04 00:00:00",
    );
    expect(recurrenceIds(expandSeries(allDay, window, 50))).not.toContain("2027-01-04 00:00:00");
  });

  it("applies the same test to an RDATE, so the two can never disagree", () => {
    const window = {
      fromMs: nyInstant("2027-02-03 00:00:00"),
      toMs: nyInstant("2027-02-20 00:00:00"),
      match: "overlaps" as const,
    };
    // The RDATE starts before the window and ends inside it — an addition, not a rule
    // occurrence, and it has to be selected by the same predicate.
    expect(
      recurrenceIds(expandSeries({ ...multiDay, rdates: ["2027-02-01 09:00:00"] }, window, 50)),
    ).toContain("2027-02-01 09:00:00");
  });

  it("keeps a zero-length occurrence on the boundary and drops it one millisecond later", () => {
    const instant = series({ rrule: "FREQ=DAILY", endWall: "2027-01-04 09:00:00" });
    const at = nyInstant("2027-01-04 09:00:00");
    const to = nyInstant("2027-01-10 00:00:00");
    expect(
      recurrenceIds(expandSeries(instant, { fromMs: at, toMs: to, match: "overlaps" }, 50)),
    ).toContain("2027-01-04 09:00:00");
    expect(
      recurrenceIds(expandSeries(instant, { fromMs: at + 1, toMs: to, match: "overlaps" }, 50)),
    ).not.toContain("2027-01-04 09:00:00");
  });

  it("spends `limit` on occurrences that overlap, never on the ones it walked past", () => {
    // The eviction this mode could have caused. Expansion walks from DTSTART, so a window
    // late in a long series considers hundreds of occurrences before reaching it. `limit`
    // counts what is RETURNED — if it counted what was considered, the cap would be
    // exhausted by occurrences the caller can never see, and truncation is a bit rather
    // than an error, so nothing would say so.
    const daily = series({
      rrule: "FREQ=DAILY",
      startWall: "2027-01-04 09:00:00",
      endWall: "2027-01-06 09:00:00",
    });
    const window = {
      fromMs: nyInstant("2027-03-01 00:00:00"),
      toMs: nyInstant("2027-03-05 00:00:00"),
      match: "overlaps" as const,
    };
    const result = expandSeries(daily, window, 3);
    expect(result.occurrences).toHaveLength(3);
    for (const occurrence of result.occurrences) {
      expect(occurrence.startAtMs).toBeLessThanOrEqual(window.toMs);
      expect(occurrence.endAtMs).toBeGreaterThanOrEqual(window.fromMs);
    }
  });

  it("leaves the default mode byte-identical", () => {
    const window = {
      fromMs: nyInstant("2027-01-06 00:00:00"),
      toMs: nyInstant("2027-01-20 00:00:00"),
    };
    expect(expandSeries(multiDay, window, 50)).toEqual(
      expandSeries(multiDay, { ...window, match: "starts-within" }, 50),
    );
    expect(recurrenceIds(expandSeries(multiDay, window, 50))).not.toContain("2027-01-04 09:00:00");
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
