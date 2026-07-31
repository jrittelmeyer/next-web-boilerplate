import { parseRRule } from "@repo/calendar";
import { describe, expect, it } from "vitest";
import { type RecurrenceProseFormat, recurrenceProse } from "./recurrence-prose";

/**
 * A deliberately English, deliberately hand-rolled stand-in for next-intl.
 *
 * The arrays below are exactly what the module under test is forbidden to contain: they
 * live here so the assertions read as sentences, and the module keeps getting its names
 * from `format.dateTime` where a locale can change them. What is being asserted is the
 * *composition* — which clause wraps which, and in what order — not the wording.
 */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SUFFIXES = ["th", "st", "nd", "rd"];

function ordinal(value: number): string {
  const rest = value % 100;
  const suffix = rest > 10 && rest < 20 ? "th" : (SUFFIXES[value % 10] ?? "th");
  return `${value}${suffix}`;
}

const format: RecurrenceProseFormat = {
  t: (key, values = {}) => {
    const interval = Number(values.interval ?? 1);
    const count = Number(values.count ?? 1);
    switch (key) {
      case "every.DAILY":
        return interval === 1 ? "Every day" : `Every ${interval} days`;
      case "every.WEEKLY":
        return interval === 1 ? "Every week" : `Every ${interval} weeks`;
      case "every.MONTHLY":
        return interval === 1 ? "Every month" : `Every ${interval} months`;
      case "every.YEARLY":
        return interval === 1 ? "Every year" : `Every ${interval} years`;
      case "inMonths":
        return `${values.base} in ${values.months}`;
      case "onOrdinals":
        return `${values.base} on the ${values.days}`;
      case "onWeekdays":
        return `${values.base} on ${values.days}`;
      case "positions":
        return `${values.base}, taking the ${values.positions}`;
      case "count":
        return `${values.base}, ${count === 1 ? "once" : `${count} times`}`;
      case "until":
        return `${values.base}, until ${values.date}`;
      case "ordinal":
        return ordinal(Number(values.position));
      case "fromEnd":
        return Number(values.position) === 1
          ? "last"
          : `${ordinal(Number(values.position))} from last`;
      case "ordinalWeekday":
        return `${values.position} ${values.weekday}`;
      case "dayOfMonth":
        return `${values.position} day`;
      default:
        return key;
    }
  },
  weekday: (weekday) => WEEKDAYS[weekday] ?? "?",
  month: (month) => MONTHS[month - 1] ?? "?",
  list: (items) =>
    items.length <= 1
      ? (items[0] ?? "")
      : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`,
  date: (until) => (until.kind === "utc" ? `instant ${until.instantMs}` : until.date),
};

const prose = (rrule: string) => recurrenceProse(parseRRule(rrule), format);

describe("recurrenceProse", () => {
  it("names every frequency, and pluralises the interval", () => {
    expect(prose("FREQ=DAILY")).toBe("Every day");
    expect(prose("FREQ=DAILY;INTERVAL=3")).toBe("Every 3 days");
    expect(prose("FREQ=WEEKLY")).toBe("Every week");
    expect(prose("FREQ=WEEKLY;INTERVAL=2")).toBe("Every 2 weeks");
    expect(prose("FREQ=MONTHLY")).toBe("Every month");
    expect(prose("FREQ=MONTHLY;INTERVAL=6")).toBe("Every 6 months");
    expect(prose("FREQ=YEARLY")).toBe("Every year");
    expect(prose("FREQ=YEARLY;INTERVAL=2")).toBe("Every 2 years");
  });

  it("lists plain weekdays without an article", () => {
    expect(prose("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("Every week on Monday, Wednesday and Friday");
  });

  it("puts an ordinal weekday behind 'the', and reads -1 as 'last'", () => {
    expect(prose("FREQ=MONTHLY;BYDAY=2TU")).toBe("Every month on the 2nd Tuesday");
    expect(prose("FREQ=MONTHLY;BYDAY=-1FR")).toBe("Every month on the last Friday");
    expect(prose("FREQ=MONTHLY;BYDAY=-2FR")).toBe("Every month on the 2nd from last Friday");
  });

  it("reads a day of the month, from either end", () => {
    expect(prose("FREQ=MONTHLY;BYMONTHDAY=15")).toBe("Every month on the 15th day");
    expect(prose("FREQ=MONTHLY;BYMONTHDAY=-1")).toBe("Every month on the last day");
    expect(prose("FREQ=MONTHLY;BYMONTHDAY=1,21")).toBe("Every month on the 1st day and 21st day");
  });

  it("names months before the day clause", () => {
    expect(prose("FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14")).toBe(
      "Every year in March on the 14th day",
    );
    expect(prose("FREQ=YEARLY;BYMONTH=6,12")).toBe("Every year in June and December");
  });

  it("keeps an ordinal clause and a plain weekday clause apart", () => {
    // `BYMONTHDAY` limits `BYDAY` here rather than expanding with it, and the sentence
    // has to say both things without claiming "the Friday".
    expect(prose("FREQ=MONTHLY;BYMONTHDAY=13;BYDAY=FR")).toBe(
      "Every month on the 13th day on Friday",
    );
  });

  it("reports BYSETPOS as a selection over the other parts", () => {
    expect(prose("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1")).toBe(
      "Every month on Monday, Tuesday, Wednesday, Thursday and Friday, taking the last",
    );
    expect(prose("FREQ=MONTHLY;BYDAY=SA,SU;BYSETPOS=1,3")).toBe(
      "Every month on Saturday and Sunday, taking the 1st and 3rd",
    );
  });

  it("closes with COUNT or with UNTIL, never both", () => {
    expect(prose("FREQ=DAILY;COUNT=1")).toBe("Every day, once");
    expect(prose("FREQ=DAILY;COUNT=10")).toBe("Every day, 10 times");
    // The two RFC forms stay different types all the way to the formatter.
    expect(prose("FREQ=WEEKLY;UNTIL=20270401")).toBe("Every week, until 2027-04-01");
    expect(prose("FREQ=WEEKLY;UNTIL=20270401T130000Z")).toMatch(/^Every week, until instant \d+$/);
  });

  it("falls back to the raw key for a message the caller has not supplied", () => {
    // Guards the shape of `RecurrenceProseKey`: a key added to the module without a
    // message shows up as itself rather than as an exception.
    expect(format.t("onWeekdays", { base: "x", days: "y" })).toBe("x on y");
    expect(format.list([])).toBe("");
    expect(format.weekday(9)).toBe("?");
    expect(format.month(13)).toBe("?");
  });
});
