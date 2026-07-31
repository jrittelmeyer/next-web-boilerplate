import { describe, expect, it } from "vitest";
import { partitionRecurrenceDates } from "./recurrence-dates";

describe("partitionRecurrenceDates", () => {
  it("splits the two kinds and preserves order within each", () => {
    const result = partitionRecurrenceDates([
      { kind: "exdate", dateWall: "2027-03-08 09:00:00" },
      { kind: "rdate", dateWall: "2027-03-19 09:00:00" },
      { kind: "exdate", dateWall: "2027-03-15 09:00:00" },
    ]);
    expect(result.exdates).toEqual(["2027-03-08 09:00:00", "2027-03-15 09:00:00"]);
    expect(result.rdates).toEqual(["2027-03-19 09:00:00"]);
    expect(result.unknown).toEqual([]);
  });

  it("returns an unrecognised kind instead of dropping it", () => {
    // The whole reason this function exists. `WHERE kind = 'exdate'` would make the
    // user's skip quietly do nothing, forever, while the unique constraint kept
    // accepting the row — the `notification-bus.ts` shape.
    const stray = { kind: "exrule", dateWall: "2027-04-01 09:00:00" };
    const result = partitionRecurrenceDates([
      { kind: "exdate", dateWall: "2027-03-08 09:00:00" },
      stray,
    ]);
    expect(result.exdates).toEqual(["2027-03-08 09:00:00"]);
    expect(result.rdates).toEqual([]);
    expect(result.unknown).toEqual([stray]);
  });

  it("is empty for no rows", () => {
    expect(partitionRecurrenceDates([])).toEqual({ exdates: [], rdates: [], unknown: [] });
  });
});
