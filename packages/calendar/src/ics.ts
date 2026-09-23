import { type CivilDateTime, type LocalDateTime, parseLocalDateTime } from "./civil";
import { instantToCivil } from "./timezone";

/**
 * RFC 5545 serialization — the `.ics` body Phase 4 attaches to an invitation email.
 *
 * **`METHOD:PUBLISH`, and never an `ATTENDEE` line.** That pairing is the owner decision
 * of 2026-08-01 and it is also what the spec requires: RFC 5546 §3.2.1 lists `ATTENDEE`
 * as MUST NOT for `PUBLISH`. The reason both point the same way is Gmail — a `REQUEST`
 * carrying an `ATTENDEE` line renders native Yes/No/Maybe buttons, and clicking one emails
 * a `METHOD:REPLY` to the organizer address. There is no inbound pipeline here, so nothing
 * would reach the database and the guest would believe they had answered. `emitAttendee`
 * does not exist in this file, and `ics.test.ts` asserts no output line ever begins
 * `ATTENDEE` — the guard is a test rather than a comment because the line is one helpful
 * commit away from coming back. See docs/context/calendar/invitations.md.
 *
 * **No `VTIMEZONE`, deliberately (Phase 4).** A `TZID` is emitted bare. Google, Apple and
 * Outlook all resolve IANA zone ids from their own databases; a strict validator will
 * object, and that is a stated, documented debt rather than an oversight. Synthesizing
 * `VTIMEZONE` from `Intl` is Phase 6's job, where the ICS feed makes it load-bearing. The
 * alternative — a UTC `DTSTART` — is not one: it drifts an hour across DST for every
 * recurring series, so a 09:00 standup silently becomes 08:00 in November.
 *
 * **The clock is a parameter.** `DTSTAMP` needs "now", and this package may not read one
 * (AGENTS.md). Callers pass `dtstampMs`.
 */

/** The subset of an event this file needs. Mirrors `calendar_events`, minus the plumbing. */
export interface IcsEvent {
  readonly uid: string;
  readonly sequence: number;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly url: string | null;
  /** `cancelled` is derived by the caller from `deleted_at`, never stored (see model.md). */
  readonly status: "confirmed" | "tentative" | "cancelled";
  readonly transparency: "opaque" | "transparent";
  readonly allDay: boolean;
  readonly startWall: LocalDateTime;
  readonly startTzid: string;
  readonly endWall: LocalDateTime;
  readonly endTzid: string;
}

/**
 * A materialised exception to a series, emitted as a sibling `VEVENT` carrying the master's
 * `UID` and its own `RECURRENCE-ID`.
 *
 * **Without these the attachment is silently wrong.** `updateOccurrence` writes an override
 * row and writes no `EXDATE` — suppression is done app-side by the range query, and ICS has
 * no equivalent. A client handed only the `RRULE` therefore expands it and shows the
 * *original* time forever, which is the same class of quiet lie the `PUBLISH` decision
 * exists to refuse.
 */
export interface IcsOverride extends IcsEvent {
  /** The master occurrence start this row replaces — its `recurrence_id`. */
  readonly recurrenceId: LocalDateTime;
  /** The master's zone at that occurrence; `RECURRENCE-ID` must carry the same `TZID`. */
  readonly recurrenceTzid: string;
}

export interface IcsSeries {
  readonly master: IcsEvent;
  readonly rrule: string | null;
  /**
   * Occurrence starts the client must not render. **The caller merges two sources here:**
   * the `exdate` rows of `calendar_recurrence_dates`, and the `recurrence_id` of every
   * **soft-deleted** override — a deleted exception is not a sibling `VEVENT`, it is an
   * absence, and only the app layer knows which rows carry `deleted_at`.
   */
  readonly exdates: readonly LocalDateTime[];
  readonly rdates: readonly LocalDateTime[];
  /** Live overrides only. Soft-deleted ones belong in `exdates`. */
  readonly overrides: readonly IcsOverride[];
  readonly organizerEmail: string | null;
  readonly organizerName: string | null;
}

export interface SerializeIcsInput {
  readonly series: IcsSeries;
  /** Epoch ms for `DTSTAMP`. A parameter because this package may not read a clock. */
  readonly dtstampMs: number;
  /** `PRODID`. */
  readonly productId: string;
}

const CRLF = "\r\n";
const MAX_OCTETS = 75;

const TAB = 9;
const SPACE = 32;
const DEL = 127;

const encoder = new TextEncoder();

/**
 * RFC 5545's CONTROL set — `%x00-08`, `%x0A-1F` and `%x7F` — which a TEXT value may not
 * contain. Tab is legal and survives; CR and LF are already a literal `\n` by the time this
 * runs.
 *
 * Tested by code point rather than matched by a regex literal **so that no raw control byte
 * ever appears in this file's source.** A character class written with the bytes themselves
 * is invisible in review, survives a copy-paste badly, and is exactly the kind of thing a
 * later editor silently mangles.
 */
function isForbiddenControl(code: number): boolean {
  return code === DEL || (code < SPACE && code !== TAB);
}

function stripControls(value: string): string {
  let out = "";
  for (const character of value) {
    if (!isForbiddenControl(character.charCodeAt(0))) out += character;
  }
  return out;
}

/**
 * RFC 5545 §3.3.11 TEXT escaping. The backslash goes first or it re-escapes the escapes
 * every later rule introduces.
 *
 * A CRLF collapses to one `\n` rather than two: otherwise a pasted Windows description
 * grows a blank line between every pair of lines in every client.
 */
function escapeText(value: string): string {
  return stripControls(
    value
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n?/g, "\n")
      .replace(/\n/g, "\\n"),
  );
}

/** How many octets this code point occupies once UTF-8 encoded. */
function octetsOf(codePoint: string): number {
  return encoder.encode(codePoint).length;
}

/**
 * Fold to 75 **octets** per line (RFC 5545 §3.1), continuation lines prefixed with one
 * space — which itself counts toward the 75, so a continuation carries 74 octets of content.
 *
 * Octets, not characters, and that distinction is why this is not a `slice`: a cut taken at
 * a character offset lands mid-sequence for any multi-byte content and emits two invalid
 * bytes. Packing runs over **code points** (`for…of`, not `line[i]`), which keeps a
 * surrogate pair whole for free — a non-BMP character is one element here, never two halves
 * — while the budget counts the encoded width of each one.
 */
function foldLine(line: string): string {
  if (octetsOf(line) <= MAX_OCTETS) return line;

  const chunks: string[] = [];
  let current = "";
  let used = 0;
  let budget = MAX_OCTETS;

  for (const codePoint of line) {
    const width = octetsOf(codePoint);
    if (used + width > budget) {
      chunks.push(current);
      current = "";
      used = 0;
      budget = MAX_OCTETS - 1;
    }
    current += codePoint;
    used += width;
  }
  chunks.push(current);

  return chunks.join(`${CRLF} `);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function formatDate(civil: CivilDateTime): string {
  return `${pad(civil.year, 4)}${pad(civil.month, 2)}${pad(civil.day, 2)}`;
}

function formatDateTime(civil: CivilDateTime): string {
  return `${formatDate(civil)}T${pad(civil.hour, 2)}${pad(civil.minute, 2)}${pad(civil.second, 2)}`;
}

/** `DTSTAMP`'s UTC form. Built through `instantToCivil`, so no `Date` is constructed. */
function formatUtc(instantMs: number): string {
  return `${formatDateTime(instantToCivil(instantMs, "UTC"))}Z`;
}

/**
 * A date-or-date-time property with its zone parameter.
 *
 * An all-day value is `VALUE=DATE` with **no `TZID`** — a floating date is what "all day"
 * means, and pinning a zone to it lands the event on the wrong day for anyone east or west
 * of the organizer.
 */
function temporalProperty(
  name: string,
  wall: LocalDateTime,
  tzid: string,
  allDay: boolean,
): string {
  const civil = parseLocalDateTime(wall);
  return allDay
    ? `${name};VALUE=DATE:${formatDate(civil)}`
    : `${name};TZID=${tzid}:${formatDateTime(civil)}`;
}

/**
 * A list-valued date property (`EXDATE`/`RDATE`), one property per line rather than one
 * comma-joined value: every value inside a single `EXDATE` must share that property's
 * `TZID`, and separate lines keep it true without the caller having to group by zone.
 */
function temporalList(
  name: string,
  walls: readonly LocalDateTime[],
  tzid: string,
  allDay: boolean,
): string[] {
  return walls.map((wall) => temporalProperty(name, wall, tzid, allDay));
}

function textProperty(name: string, value: string | null): string[] {
  return value === null || value === "" ? [] : [`${name}:${escapeText(value)}`];
}

/**
 * RFC 6868 caret-encoding — applied ONLY inside a DQUOTE-quoted param-value (see
 * {@link quoteParamValue}), and only to the three characters the RFC actually defines an
 * escape for. Order matters: `^` must be encoded first, on the ORIGINAL text alone, or the
 * carets the other two rules introduce get double-escaped by a later `^` pass.
 *
 * **Never encodes `;`, `,`, or `:`.** RFC 6868 defines no unescape for those — a caret
 * sequence is only ever `^^`, `^'`, or `^n` — so caret-encoding a semicolon would ship a
 * NEW corruption bug in the exact property this function exists to fix: a conforming
 * reader decoding `^,` back gets undefined behavior. Quoting alone (the DQUOTE wrapper,
 * not an escape) is what makes those three safe inside a param-value — RFC 5545 §3.2's
 * grammar, a different rule from RFC 5545 §3.3.11 TEXT escaping, which is what `CN` used
 * to run through by mistake.
 */
function caretEncode(value: string): string {
  return value
    .replace(/\^/g, "^^")
    .replace(/"/g, "^'")
    .replace(/\r\n|\r|\n/g, "^n");
}

/**
 * RFC 5545 §3.2 param-value quoting. DQUOTE-wraps when the value contains `"`, `;`, `,`,
 * or `:` — or, once caret-encoded, would contain a caret sequence, which is exactly the
 * `^`/`"`/newline set above; checking the raw value for any of the seven characters below
 * is equivalent to checking the encoded result for a caret, without encoding twice.
 * Caret-encoding runs only inside the quotes it triggers (rule 2 is not independent of
 * rule 1's decision — an unquoted value is never caret-encoded).
 */
function quoteParamValue(value: string): string {
  const needsQuoting = /["\r\n;,:^]/.test(value);
  return needsQuoting ? `"${stripControls(caretEncode(value))}"` : stripControls(value);
}

/**
 * `mailto:` percent-encoding (RFC 6068). `ORGANIZER`'s value type is CAL-ADDRESS — a URI,
 * not TEXT — so a `;`, `,` or `:` inside the address needs URI percent-encoding here, not
 * backslash-escaping: emitting one unencoded would either truncate the property at the
 * next `;`/`:` in a strict parser or silently merge into the next param. Iterates by CODE
 * POINT (`[...value]`, not `value[i]`), matching `foldLine`'s own reasoning — a UTF-16
 * surrogate pair split by index would encode two invalid halves.
 */
function encodeMailtoAddress(email: string): string {
  return [...stripControls(email)]
    .map((char) => (/^[A-Za-z0-9._+@-]$/.test(char) ? char : encodeURIComponent(char)))
    .join("");
}

/**
 * `ORGANIZER` is REQUIRED for `PUBLISH` (RFC 5546 §3.2.1) and is the only address this file
 * emits. It is informational: with no `ATTENDEE` line there is nobody for a client to reply
 * *as*, which is precisely the property that removes the dead buttons.
 */
function organizerProperty(email: string | null, name: string | null): string[] {
  if (email === null || email === "") return [];
  const cn = name === null || name === "" ? "" : `;CN=${quoteParamValue(name)}`;
  return [`ORGANIZER${cn}:mailto:${encodeMailtoAddress(email)}`];
}

function eventBody(event: IcsEvent, dtstampMs: number): string[] {
  return [
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${formatUtc(dtstampMs)}`,
    `SEQUENCE:${event.sequence}`,
    temporalProperty("DTSTART", event.startWall, event.startTzid, event.allDay),
    temporalProperty("DTEND", event.endWall, event.endTzid, event.allDay),
    ...textProperty("SUMMARY", event.title),
    ...textProperty("DESCRIPTION", event.description),
    ...textProperty("LOCATION", event.location),
    ...textProperty("URL", event.url),
    `STATUS:${event.status.toUpperCase()}`,
    `TRANSP:${event.transparency.toUpperCase()}`,
  ];
}

/**
 * Serialize one series — master, its recurrence rule and dates, and every live override —
 * as a `METHOD:PUBLISH` calendar.
 *
 * The output is CRLF-terminated and folded. It carries no `ATTENDEE` and no `VTIMEZONE`;
 * both absences are decisions, documented at the top of this file.
 */
export function serializeIcs(input: SerializeIcsInput): string {
  const { series, dtstampMs, productId } = input;
  const { master } = series;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${escapeText(productId)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    ...eventBody(master, dtstampMs),
    ...(series.rrule === null ? [] : [`RRULE:${series.rrule}`]),
    ...temporalList("EXDATE", series.exdates, master.startTzid, master.allDay),
    ...temporalList("RDATE", series.rdates, master.startTzid, master.allDay),
    ...organizerProperty(series.organizerEmail, series.organizerName),
    "END:VEVENT",
  ];

  for (const override of series.overrides) {
    lines.push(
      "BEGIN:VEVENT",
      ...eventBody(override, dtstampMs),
      temporalProperty(
        "RECURRENCE-ID",
        override.recurrenceId,
        override.recurrenceTzid,
        override.allDay,
      ),
      ...organizerProperty(series.organizerEmail, series.organizerName),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}
