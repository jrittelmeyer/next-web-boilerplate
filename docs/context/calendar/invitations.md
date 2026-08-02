# Calendar — emailed invitations and the `.ics`

Load when touching the invitation email, the calendar attachment, or the public RSVP page.
Guest list and internal RSVP: [attendees.md](attendees.md). Domain model:
[model.md](model.md). Endpoints: [api.md](api.md).

> **Status: Phase 4, in progress.** The serializer and the send seam ship first; delivery,
> the `/rsvp/[token]` page and the re-ask rules follow in the same phase.

## `METHOD:PUBLISH`, and never an `ATTENDEE` line

**Owner decision, 2026-08-01.** The invitation carries a `text/calendar` attachment
serialized as `METHOD:PUBLISH` with no `ATTENDEE` property. The RSVP links in the email
body are the only way to answer.

The alternative was `METHOD:REQUEST`, which is what makes Gmail render native
**Yes / No / Maybe** buttons on the event card (verified by owner screenshot, Gmail
Android, 2026-07-30 — a `.ics` attachment sent through Resend does render a parsed card,
so Resend's lack of a raw-MIME path costs nothing). **Those buttons are a false
affordance.** Clicking one makes Gmail send a `METHOD:REPLY` email to the organizer
address. There is no inbound-email pipeline here, so nothing reaches the database: the
guest sees no error and believes they answered. That is strictly worse than showing no
buttons at all.

**The spec agrees, which is the part worth knowing.** RFC 5546 §3.2.1 lists `ATTENDEE` as
**MUST NOT** for `PUBLISH` — so the single property whose removal kills the dead buttons is
the property conformance already required. This is not a workaround dressed up as a
standard. `ORGANIZER` stays, because the same table makes it REQUIRED for `PUBLISH`; with
no `ATTENDEE` there is nobody for a client to reply *as*.

`packages/calendar/src/ics.test.ts` asserts that **no emitted line ever begins
`ATTENDEE`**, for a series with overrides and an organizer. That guard is a test rather
than a comment because the line is one helpful commit away from coming back, and the
failure it would cause is silent.

The two rejected options, for the record: (b) keep `REQUEST` and build inbound iTIP `REPLY`
ingestion — a real feature (inbound provider, MIME + iTIP parsing, sender-vs-`ATTENDEE`
authorization, `SEQUENCE` ordering, spoofing defences) and a hard external dependency in a
starter that must build with its env unset; (c) keep `REQUEST` and ship the lie.

## No `VTIMEZONE` — a stated debt, not an oversight

Phase 4 emits `DTSTART;TZID=America/New_York:…` with **no accompanying `VTIMEZONE`
component**. A strict RFC 5545 validator will object: a `TZID` is supposed to reference a
`VTIMEZONE` in the same calendar. Google, Apple and Outlook all resolve IANA zone ids from
their own databases, which is why this works in practice for essentially every guest.

**Phase 6 synthesizes the component**, where the ICS feed makes it load-bearing.

Two things this is *not*:

- **Not solvable by emitting UTC.** `DTSTART:…Z` plus an `RRULE` drifts an hour across
  every DST transition, so a 09:00 standup becomes 08:00 in November. A single
  non-recurring event would be fine in UTC; a series is not, and the serializer does not
  get to know which it is being asked for.
- **Not cheap to do properly.** Synthesis means binary-searching `offsetMinutesAt` for each
  year's transitions and emitting `STANDARD`/`DAYLIGHT` subcomponents, under
  `packages/calendar`'s **100/100/100/100** gate and its no-clock rule (the year window has
  to be a caller's parameter), with correct handling of zero-transition zones (`UTC`,
  `Asia/Kolkata` — emit nothing and the `TZID` dangles), negative DST (Dublin inverts
  `TZOFFSETFROM`/`TZOFFSETTO`) and an `UNTIL` before the window. Roughly two days, and
  `RDATE`-only `VTIMEZONE`s are themselves unevenly consumed.

## Overrides are emitted, or the attachment lies

`updateOccurrence` writes an override row and writes **no** `EXDATE` — suppression is done
app-side by the range query, and ICS has no equivalent ([recurrence.md](recurrence.md)). A
client handed only the `RRULE` therefore expands it and shows the **original** time
forever. That is the same class of quiet wrongness the `PUBLISH` decision exists to refuse,
so the serializer takes the override rows and emits, per master:

| Row | Emitted as |
| --- | --- |
| a **live** override | a sibling `VEVENT` carrying the master's `UID` and its own `RECURRENCE-ID` |
| a **soft-deleted** override | an `EXDATE` — a deleted exception is an absence, not a component |
| `calendar_recurrence_dates.kind = 'exdate'` | an `EXDATE` |
| `calendar_recurrence_dates.kind = 'rdate'` | an `RDATE` |

**The caller merges the two `EXDATE` sources.** `IcsSeries.exdates` takes both, because
only the app layer knows which override rows carry `deleted_at`; `packages/calendar` may
not read a database.

## Serializer contract

`serializeIcs` lives in `@repo/calendar` (`src/ics.ts`) — pure, zero-dependency, and
already the home of the civil-time maths it needs.

- **CRLF**, and folded at **75 octets** with continuation lines prefixed by one space
  (which counts toward the 75, so a continuation carries 74). Packing runs over **code
  points**, so a multi-byte sequence is never split and a surrogate pair stays whole.
- RFC 5545 §3.3.11 TEXT escaping (`\\`, `\;`, `\,`, `\n`); a CRLF collapses to one `\n`, and
  the CONTROL set is stripped while tab survives.
- All-day emits `VALUE=DATE` with **no `TZID`** — a floating date is what "all day" means,
  and pinning a zone lands the event on the wrong day for a guest in another one.
- **`DTSTAMP` is a parameter.** `packages/calendar/AGENTS.md` forbids reading a clock.
- `UID` and `SEQUENCE` come from the stored columns. Phase 1 shipped both *for this phase*
  — `uid` from day one so a feed cannot later make every event look recreated, and
  `sequence` because a conforming client **ignores** a re-import whose `UID` matches and
  whose `SEQUENCE` has not increased. An update attachment at `SEQUENCE:0` is inert, which
  is the false-affordance failure in a different costume.

## The attachment, and the one send that has none

`send()` in `@repo/email` takes `attachments: EmailAttachment[]`, whose `content` is UTF-8
**text**; the Buffer encoding happens at the Resend boundary because the SDK reads a bare
string as already-base64. Text is also what lets the `EMAIL_TEST_CAPTURE_DIR` seam record
the body verbatim, so a test asserts `METHOD:PUBLISH` and the missing `ATTENDEE` line by
reading the capture file instead of decoding it. The attachment is recorded **inside** the
capture branch and **after** the suppression consult, so a suppressed recipient still
produces no file ([../services/resend.md](../services/resend.md)).

The content type repeats the method — `text/calendar; charset=utf-8; method=PUBLISH` —
because Gmail reads it there as well as from the body, and the two disagreeing is how a
`PUBLISH` calendar still renders reply buttons. The filename is fixed (`invite.ics`): a
title-derived one leaks the subject into the attachment list of a forwarded message.

**A cancellation and a removal are different, and only one carries a `.ics`:**

| Case | Attachment | Why |
| --- | --- | --- |
| the **event** was deleted | `PUBLISH` + `STATUS:CANCELLED`, same `UID`, bumped `SEQUENCE` | it helps everyone who added it and harms nobody who did not; `softDeleteEvent` already derives `STATUS:CANCELLED` from `deleted_at`, so it costs no new serializer code |
| a **guest** was removed | **none** | the event is still going ahead for everyone else, and a client applying `STATUS:CANCELLED` would delete a live event. "You specifically are uninvited" is `METHOD:CANCEL` vocabulary, which the decision above declined |

The removal email says so in words instead: if you added this to your calendar, remove it.
