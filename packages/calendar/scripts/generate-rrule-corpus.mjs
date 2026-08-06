// Regenerates `src/__fixtures__/rrule-corpus.json` — the frozen differential oracle for
// the recurrence engine.
//
//   node scripts/generate-rrule-corpus.mjs
//
// WHY A FIXTURE RATHER THAN A LIVE DIFF. The parent program asked for a dev-only
// differential test against `rrule`. Running that in CI forever would make every
// generated project inherit a package last published 2023-11-10 in its test path, and
// `rrule` is a poor gate: it accepts a rule with no FREQ, accepts COUNT and UNTIL
// together (RFC 5545 forbids it), accepts INTERVAL=0, and turns COUNT=-1 into 416,011
// occurrences. Freezing its *expansion* output keeps the evidence, drops the dependency
// from the gate, and turns the corpus into a reviewable diff.
//
// THE COMPARISON CONTRACT. Every DTSTART here is a UTC instant and every expected value
// is a civil `YYYY-MM-DD HH:MM:SS` string read back in UTC. `rrule` returns
// floating-as-UTC Dates, and our engine expands in civil space, so the two meet with no
// timezone arithmetic on either side. That is deliberate: this corpus tests RULE
// semantics only. DST behaviour is a separate corpus in `expand.test.ts`, because mixing
// them would let a zone bug hide behind a rule bug.
//
// ANTI-TAMPER. A red differential has exactly one tempting one-line "fix" — rerun this
// script — which converts the oracle into a mirror of the engine. Two things stop that:
// this fixture was committed BEFORE `expand.ts` existed (see the branch history), and
// `rrule-corpus.test.ts` pins the fixture's SHA-256, so a regeneration is a two-file diff
// a reviewer has to approve.
//
// REGENERATION IS TWO STEPS, in this order:
//   1. node scripts/generate-rrule-corpus.mjs
//   2. pnpm exec biome check --write src/__fixtures__/rrule-corpus.json
// Biome owns the file's formatting (it reflows short arrays), so hashing here would pin
// bytes that never reach disk. The test hashes what is actually committed and prints the
// replacement constant when it disagrees.
//
// Named imports do NOT work here: `rrule@2.8.1` ships no `exports` field, so plain Node
// ESM sees CommonJS and `import { RRule } from "rrule"` throws. A bundler would resolve
// its `module` field and hide that, which is exactly why this runs under plain node.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "rrule";

const { rrulestr } = pkg;

const ORACLE = "rrule@2.8.1";
const MAX_OCCURRENCES = 20;

/**
 * Anchors chosen so each one breaks a different assumption: a Tuesday (so WKST and
 * BYDAY orderings are visible), the 31st (so short months are exercised), a leap day,
 * and a year boundary.
 */
const ANCHORS = [
  "20270105T090000Z", // Tuesday
  "20270131T233000Z", // 31st, late in the day
  "20280229T120000Z", // leap day
  "20261231T000000Z", // year boundary, midnight
];

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const INTERVALS = [1, 2, 3];
const BOUNDS = [";COUNT=5", ";COUNT=10", ";UNTIL=20290101T000000Z", ""];
const WEEKDAY_SETS = ["MO", "MO,WE,FR", "TU,SU", "SA,SU", "MO,TU,WE,TH,FR"];
const WKSTS = ["MO", "SU"];
const MONTH_DAYS = [1, 15, 28, 31, -1, -2];
const ORDINAL_DAYS = ["1MO", "2TU", "3WE", "-1FR", "-2SA"];
const SET_POSITIONS = [1, 2, -1];

/** Deterministic: a plain cross-product, no sampling and no randomness. */
function buildRules() {
  const rules = [];
  const add = (rrule, anchor, note) => rules.push({ rrule, dtstart: anchor, note });

  for (const freq of FREQUENCIES) {
    for (const interval of INTERVALS) {
      for (const bound of BOUNDS) {
        for (const anchor of ANCHORS) {
          add(`FREQ=${freq};INTERVAL=${interval}${bound}`, anchor);
        }
      }
    }
  }

  // WEEKLY x BYDAY x WKST — WKST changes the answer for INTERVAL > 1 and nothing else,
  // which is precisely the interaction the RFC's own examples under-cover.
  for (const days of WEEKDAY_SETS) {
    for (const wkst of WKSTS) {
      for (const interval of [1, 2, 3]) {
        for (const anchor of ANCHORS) {
          add(`FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days};WKST=${wkst};COUNT=12`, anchor);
        }
      }
    }
  }

  // MONTHLY by day-of-month, including negatives and the 31st.
  for (const day of MONTH_DAYS) {
    for (const interval of [1, 2]) {
      for (const anchor of ANCHORS) {
        add(`FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${day};COUNT=8`, anchor);
      }
    }
  }

  // MONTHLY by ordinal weekday.
  for (const ordinal of ORDINAL_DAYS) {
    for (const interval of [1, 2]) {
      for (const anchor of ANCHORS) {
        add(`FREQ=MONTHLY;INTERVAL=${interval};BYDAY=${ordinal};COUNT=8`, anchor);
      }
    }
  }

  // BYSETPOS x ordinal BYDAY x INTERVAL>1 x WKST, all at once — the case the plan calls
  // out by name as systematically missing from the RFC's examples.
  for (const setPos of SET_POSITIONS) {
    for (const days of ["MO,TU,WE,TH,FR", "SA,SU", "MO,WE,FR"]) {
      for (const wkst of WKSTS) {
        for (const anchor of ANCHORS) {
          add(
            `FREQ=MONTHLY;INTERVAL=2;BYDAY=${days};BYSETPOS=${setPos};WKST=${wkst};COUNT=8`,
            anchor,
            "BYSETPOS x BYDAY x INTERVAL>1 x WKST",
          );
        }
      }
    }
  }

  // YEARLY, including the leap-day rule that skips three years out of four.
  for (const month of [1, 2, 6, 11, 12]) {
    for (const anchor of ANCHORS) {
      add(`FREQ=YEARLY;BYMONTH=${month};BYMONTHDAY=15;COUNT=5`, anchor);
      add(`FREQ=YEARLY;BYMONTH=${month};BYDAY=1MO;COUNT=5`, anchor);
    }
  }
  for (const anchor of ANCHORS) {
    add(`FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=4`, anchor, "leap day only");
    add(`FREQ=YEARLY;BYMONTH=11;BYDAY=TU;BYSETPOS=1;COUNT=4`, anchor, "first Tuesday in November");
    add(`FREQ=MONTHLY;BYMONTHDAY=31;COUNT=6`, anchor, "skips short months entirely");
    add(`FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=6`, anchor, "last day of every month");
  }

  // YEARLY;BYMONTHDAY *without* BYMONTH — audit F8's family, appended 2026-08-06. At
  // YEARLY frequency BYMONTHDAY is an EXPANSION: "the 13th" means the 13th of every
  // month. The original corpus only ever emitted the pair, which is exactly how a
  // DTSTART's-month-only fallback shipped unnoticed behind 528 green cases. BYSETPOS
  // and UNTIL ride along deliberately: BYSETPOS selects over the candidate set this
  // family grows from 1 to 12 (the largest behavior change of the fix), and UNTIL is
  // the bound shape whose series-end path never expands — the same axis-interaction
  // principle as the BYSETPOS block above. Appended AFTER every existing block so the
  // fixture diff is a pure insertion: any churn in the 528 existing entries is a flag.
  for (const day of [13, 15, 31, -1, -31]) {
    for (const anchor of ANCHORS) {
      add(`FREQ=YEARLY;BYMONTHDAY=${day};COUNT=10`, anchor, "YEARLY BYMONTHDAY, no BYMONTH");
    }
  }
  for (const anchor of ANCHORS) {
    add(`FREQ=YEARLY;BYDAY=FR;BYMONTHDAY=13;COUNT=6`, anchor, "Friday the 13th, BYDAY limits");
    add(`FREQ=YEARLY;INTERVAL=2;BYMONTHDAY=1;COUNT=10`, anchor, "alternate years, every month");
    add(`FREQ=YEARLY;BYMONTHDAY=13;BYSETPOS=2;COUNT=5`, anchor, "setpos over twelve candidates");
    add(
      `FREQ=YEARLY;BYMONTHDAY=13;BYSETPOS=-1;COUNT=5`,
      anchor,
      "negative setpos, twelve candidates",
    );
    add(`FREQ=YEARLY;BYMONTHDAY=15;UNTIL=20290101T000000Z`, anchor, "UNTIL-bounded, no BYMONTH");
  }

  return rules;
}

/**
 * EXDATE cases live in their own list because they exercise `expandSeries`, not
 * `expandRRule`. The one that matters: RFC 5545 counts occurrences the RULE generates,
 * so an EXDATE'd occurrence CONSUMES its COUNT. Most implementations get this wrong, and
 * having the oracle pin it is the point.
 */
function buildSetCases() {
  return [
    { rrule: "FREQ=DAILY;COUNT=5", dtstart: "20270101T090000Z", exdates: ["20270103T090000Z"] },
    { rrule: "FREQ=DAILY;COUNT=5", dtstart: "20270101T090000Z", exdates: ["20270101T090000Z"] },
    {
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=8",
      dtstart: "20270104T090000Z",
      exdates: ["20270106T090000Z", "20270118T090000Z"],
    },
    {
      rrule: "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=6",
      dtstart: "20270115T120000Z",
      exdates: ["20270315T120000Z", "20270515T120000Z"],
    },
  ];
}

const pad2 = (value) => String(value).padStart(2, "0");

/** A UTC Date read back as a civil string — the comparison contract, in one place. */
function toCivil(date) {
  return (
    `${String(date.getUTCFullYear()).padStart(4, "0")}-` +
    `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`
  );
}

function expand(text) {
  const rule = rrulestr(text);
  return rule.all((_date, index) => index < MAX_OCCURRENCES).map(toCivil);
}

const cases = [];
for (const entry of buildRules()) {
  const text = `DTSTART:${entry.dtstart}\nRRULE:${entry.rrule}`;
  let expected;
  try {
    expected = expand(text);
  } catch (error) {
    // Recorded rather than dropped: a rule this generator considers supported that the
    // oracle cannot expand is a divergence someone has to adjudicate, and a silently
    // shorter corpus is how that goes unnoticed.
    cases.push({ ...entry, oracleError: String(error?.message ?? error) });
    continue;
  }
  cases.push({ ...entry, expected });
}

const setCases = buildSetCases().map((entry) => {
  const set = rrulestr(`DTSTART:${entry.dtstart}\nRRULE:${entry.rrule}`, { forceset: true });
  for (const exdate of entry.exdates) {
    set.exdate(
      new Date(
        `${exdate.slice(0, 4)}-${exdate.slice(4, 6)}-${exdate.slice(6, 11)}:${exdate.slice(11, 13)}:${exdate.slice(13, 15)}Z`,
      ),
    );
  }
  return { ...entry, expected: set.all((_date, index) => index < MAX_OCCURRENCES).map(toCivil) };
});

const corpus = {
  oracle: ORACLE,
  contract:
    "DTSTART is a UTC instant; every expected value is that occurrence's civil reading in UTC. Rule semantics only — DST lives in expand.test.ts.",
  maxOccurrences: MAX_OCCURRENCES,
  cases,
  setCases,
};

const json = `${JSON.stringify(corpus, null, 2)}\n`;
const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/__fixtures__/rrule-corpus.json",
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json, "utf8");

const failures = cases.filter((entry) => entry.oracleError).length;
process.stdout.write(
  `${cases.length} rule cases (${failures} oracle errors) + ${setCases.length} set cases\n` +
    `Now run: pnpm exec biome check --write src/__fixtures__/rrule-corpus.json\n` +
    `Then run the suite — rrule-corpus.test.ts prints the CORPUS_SHA256 to paste.\n`,
);
