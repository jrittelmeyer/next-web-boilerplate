import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatLocalDateTime, MS_PER_DAY, parseLocalDateTime, toDayNumber } from "./civil";
import { expandRRule } from "./expand";
import { expandSeries } from "./occurrences";
import { parseRRule } from "./rrule";

/**
 * The frozen differential oracle: 528 rules expanded by `rrule@2.8.1` at generation
 * time, diffed against this engine on every run.
 *
 * The dependency is not in this test's path — the fixture is. That is deliberate (see
 * `scripts/generate-rrule-corpus.mjs`): CI never executes a package last published in
 * 2023, and the corpus is a reviewable diff rather than a runtime.
 *
 * **The hash below is an anti-tamper gate, not a checksum.** A red differential has
 * exactly one tempting one-line "fix" — rerun the generator — which silently turns the
 * oracle into a mirror of the engine. Pinning the hash makes that a two-file diff a
 * reviewer has to approve. The other half of the gate is in the branch history: the
 * fixture was committed before `expand.ts` existed, so it cannot have been fitted to it.
 */
const CORPUS_SHA256 = "f12080c8f2ff135078ea025b17c649a72827ffad2d4ecdce5140ac474648d82f";

interface RuleCase {
  readonly rrule: string;
  readonly dtstart: string;
  readonly note?: string;
  readonly expected?: readonly string[];
  readonly oracleError?: string;
}

interface SetCase {
  readonly rrule: string;
  readonly dtstart: string;
  readonly exdates: readonly string[];
  readonly expected: readonly string[];
}

interface Corpus {
  readonly oracle: string;
  readonly maxOccurrences: number;
  readonly cases: readonly RuleCase[];
  readonly setCases: readonly SetCase[];
}

const fixturePath = fileURLToPath(new URL("./__fixtures__/rrule-corpus.json", import.meta.url));
const fixtureBytes = readFileSync(fixturePath);
const corpus: Corpus = JSON.parse(fixtureBytes.toString("utf8"));

/** `20270105T090000Z` → `2027-01-05 09:00:00`, the corpus's civil-vs-civil contract. */
function dtstartCivil(compact: string) {
  return parseLocalDateTime(
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)} ` +
      `${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}`,
  );
}

/**
 * The oracle expanded without a window, so this has to be wide enough that the window is
 * never what ends an expansion. `FREQ=YEARLY;INTERVAL=3` anchored on a leap day only
 * lands on 29 February every twelve years — and skips 2100, which is not a leap year —
 * so its twentieth occurrence is in 2268. A ceiling of 2100 silently turned that into a
 * short list and looked like an engine bug on the first run.
 */
const FAR_FUTURE_MS = toDayNumber(2400, 1, 1) * MS_PER_DAY;

function expandCase(entry: RuleCase, limit: number): string[] {
  const dtstart = dtstartCivil(entry.dtstart);
  // UTC on both sides: the corpus tests RULE semantics, and rrule emits floating-as-UTC
  // dates. Zone behaviour is `expand.test.ts`'s job — mixing them would let a zone bug
  // hide behind a rule bug.
  const from = toDayNumber(dtstart.year, dtstart.month, dtstart.day) * MS_PER_DAY;
  const result = expandRRule({
    rule: parseRRule(entry.rrule),
    dtstart,
    timeZone: "UTC",
    fromMs: from,
    toMs: FAR_FUTURE_MS,
    limit,
  });
  return result.occurrences.map(formatLocalDateTime);
}

describe("the frozen rrule corpus", () => {
  it("has not been regenerated without review", () => {
    const actual = createHash("sha256").update(fixtureBytes).digest("hex");
    expect(
      actual,
      `The corpus fixture changed. If that was deliberate, set CORPUS_SHA256 to ${actual} ` +
        "in the same commit as the fixture, so the regeneration is reviewable.",
    ).toBe(CORPUS_SHA256);
  });

  it("was generated from the oracle this test claims", () => {
    expect(corpus.oracle).toBe("rrule@2.8.1");
    expect(corpus.cases.length).toBeGreaterThanOrEqual(500);
  });

  it("records no case the oracle itself could not expand", () => {
    // A non-empty list here is a divergence to adjudicate against the RFC, not to delete.
    expect(corpus.cases.filter((entry) => entry.oracleError !== undefined)).toEqual([]);
  });

  // The whole reason the corpus carries set cases: RFC 5545 counts what the RULE
  // generates, so an EXDATE'd occurrence CONSUMES its COUNT. `COUNT=5` with one EXDATE
  // yields four. Getting this backwards is the single most common recurrence bug, and
  // asserting it against our own reasoning would prove nothing — the oracle is the point.
  it.each(
    corpus.setCases.map((entry, index) => [index, entry] as const),
  )("set case %i matches the oracle, EXDATE consuming COUNT", (_index, entry) => {
    const dtstart = dtstartCivil(entry.dtstart);
    const result = expandSeries(
      {
        rrule: entry.rrule,
        startWall: formatLocalDateTime(dtstart),
        startTzid: "UTC",
        endWall: formatLocalDateTime(dtstart),
        endTzid: "UTC",
        exdates: entry.exdates.map((value) => formatLocalDateTime(dtstartCivil(value))),
        rdates: [],
        overriddenRecurrenceIds: [],
      },
      {
        fromMs: toDayNumber(dtstart.year, dtstart.month, dtstart.day) * MS_PER_DAY,
        toMs: FAR_FUTURE_MS,
      },
      corpus.maxOccurrences,
    );
    expect(result.occurrences.map((occurrence) => occurrence.startWall)).toEqual(entry.expected);
  });

  it.each(
    corpus.cases.map((entry, index) => [index, entry] as const),
  )("case %i matches the oracle", (_index, entry) => {
    expect(entry.expected).toBeDefined();
    expect({
      rrule: entry.rrule,
      dtstart: entry.dtstart,
      occurrences: expandCase(entry, corpus.maxOccurrences),
    }).toEqual({
      rrule: entry.rrule,
      dtstart: entry.dtstart,
      occurrences: entry.expected,
    });
  });
});
