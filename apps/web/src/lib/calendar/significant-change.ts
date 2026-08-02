import type { EventStatus, EventTransparency, EventVisibility } from "@repo/validators/calendar";

/**
 * What an edit obliges the invitation machinery to do — as **three independent booleans**,
 * because they do not co-vary.
 *
 * The tempting shape is one "significant / not significant" flag, and it is wrong in both
 * directions. `transparency` changes the emitted `.ics` body (so a Phase-6 feed subscriber
 * needs the `SEQUENCE` bump) but is not worth an email. A venue change is worth an email but
 * not worth re-asking a guest who already said yes — Google re-asks on neither location nor
 * status, and re-asking on every edit is how people learn to ignore the question.
 *
 * Pure, and deliberately so: the rule that decides whether fifty people get an email is
 * provable without a database.
 *
 * See docs/context/calendar/invitations.md.
 */

/** The columns an edit can touch that this decision reads. */
export interface EventChangeFields {
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly url: string | null;
  readonly color: string | null;
  readonly status: EventStatus;
  readonly visibility: EventVisibility;
  readonly transparency: EventTransparency;
  readonly allDay: boolean;
  readonly startWall: string;
  readonly startTzid: string;
  readonly endWall: string;
  readonly endTzid: string;
  readonly rrule: string | null;
  /** A move to another calendar changes the `ORGANIZER` the `.ics` carries. */
  readonly calendarId: string;
}

export interface EventChange {
  /** Write `sequence + 1`. A client ignores a re-import whose `SEQUENCE` has not risen. */
  readonly bumpsSequence: boolean;
  /** Email every guest an update, with a fresh attachment. */
  readonly resends: boolean;
  /** Stamp `reask_at`, so answers given before this edit render as stale. */
  readonly reasks: boolean;
}

/** Ordered weakest-first; `RANK` depends on that order. */
const CHANGE_LEVELS = ["none", "bump", "resend", "reask"] as const;
type ChangeLevel = (typeof CHANGE_LEVELS)[number];

const RANK: Record<ChangeLevel, number> = { none: 0, bump: 1, resend: 2, reask: 3 };

/**
 * Every field, classified once.
 *
 * `satisfies Record<keyof EventChangeFields, ChangeLevel>` is the guard that matters: adding
 * a column to `EventChangeFields` without deciding what it costs stops this file compiling,
 * rather than defaulting it to silence. That is the same shape `RESPONSE_TYPES` uses in
 * `server/actions/calendar.ts`.
 *
 * **The attendee set is deliberately absent.** It is not a change to the *event* — the guest
 * diff already emails the one person added and the one removed, and re-asking the other
 * forty-eight because a colleague joined is noise.
 */
const FIELD_LEVELS = {
  // Time and recurrence: the only things that can make "yes" stop being true.
  startWall: "reask",
  endWall: "reask",
  startTzid: "reask",
  endTzid: "reask",
  allDay: "reask",
  rrule: "reask",

  // Worth telling people about; not worth making them answer again.
  title: "resend",
  location: "resend",
  status: "resend",
  calendarId: "resend",

  // In the `.ics`, but nobody needs an email about their free/busy marker.
  transparency: "bump",

  // Invisible to a guest's calendar entry, or purely presentational.
  description: "none",
  url: "none",
  visibility: "none",
  color: "none",
} as const satisfies Record<keyof EventChangeFields, ChangeLevel>;

const FIELDS = Object.keys(FIELD_LEVELS) as (keyof EventChangeFields)[];

/** What this edit obliges, given the row before it and the values going in. */
export function classifyEventChange(
  before: EventChangeFields,
  after: EventChangeFields,
): EventChange {
  let level: ChangeLevel = "none";
  for (const field of FIELDS) {
    if (before[field] === after[field]) continue;
    if (RANK[FIELD_LEVELS[field]] > RANK[level]) level = FIELD_LEVELS[field];
  }

  return {
    bumpsSequence: RANK[level] >= RANK.bump,
    resends: RANK[level] >= RANK.resend,
    reasks: RANK[level] >= RANK.reask,
  };
}

/**
 * A change that alters the emitted `.ics` without going through the field diff — a new
 * `EXDATE`, a new `RDATE`, or a truncated series.
 *
 * `skipOccurrence`, `setRecurrenceDate` and `truncateSeries` all move dates a client renders
 * while touching none of the columns above, so classifying by field alone would leave them
 * emitting nothing and shipping an attachment nobody's client will apply — the exact inert
 * `SEQUENCE:0` failure the bump exists to prevent. They resend without re-asking: the
 * occurrences that remain are at the times their guests already agreed to.
 */
export const RECURRENCE_DATES_CHANGED: EventChange = {
  bumpsSequence: true,
  resends: true,
  reasks: false,
};

/**
 * A "this and following" split, whose new master is a different event with its own `UID`.
 *
 * `splitSeries` copies the guest list verbatim, `status` and `responded_at` included — so a
 * cut that moved the time leaves everyone still `accepted` for a meeting that changed. That
 * debt is booked to this phase in `attendees.md`, and this is where it is paid: the caller
 * classifies the source's civil span against the new master's and re-asks only when the
 * answer is `reask`.
 */
export const SERIES_UNCHANGED: EventChange = {
  bumpsSequence: false,
  resends: false,
  reasks: false,
};
