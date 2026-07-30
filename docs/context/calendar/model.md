# Calendar — domain model

Load when working in `packages/calendar` or on anything that converts between a
wall-clock reading and a point on the timeline. Leaf rules (one imperative per line)
live in [`packages/calendar/AGENTS.md`](../../../packages/calendar/AGENTS.md).

> **Status:** Phase 0 of the calendar program. Only the time core exists so far —
> `civil.ts` and `timezone.ts`. Recurrence, occurrences, ICS and free/busy land in
> later phases and get their own sections here.

## The two kinds of time

Exactly two, and they are never interchangeable:

| Kind | Type | Meaning |
| --- | --- | --- |
| **Civil** | `CivilDateTime` / `LocalDateTime` (`"2026-03-08 09:30:00"`) | A wall-clock reading. No zone, so no instant. |
| **Instant** | epoch milliseconds (`number`) | A point on the timeline. |

A `LocalDateTime` is the storage form and matches Postgres's rendering of
`timestamp(0) without time zone`. It is **not** a `Date`: never construct one from it,
never hand it to a display formatter. Pair it with an IANA zone id.

**Civil is the source of truth for anything that recurs.** A 09:00 weekly meeting is
*defined* civilly — "09:00, every Monday" — so expansion is pure calendar arithmetic
and each occurrence re-resolves its own UTC offset. That is the entire reason the
meeting stays at 09:00 across a DST transition instead of drifting an hour. An
expander that works in instants reports a uniform 7 days between occurrences and is
silently wrong twice a year.

`civil.ts` therefore knows nothing about zones and constructs no `Date`. Day-number
conversion uses Howard Hinnant's algorithm rather than `Date.UTC`, which silently maps
years 0–99 into 1900–1999.

## Converting: `timezone.ts`

`Intl.DateTimeFormat` is the IANA database that ships with the runtime and updates
when Node updates. It is used here **purely for computation**, pinned to
`en-US-u-ca-iso8601` so neither the ambient locale nor a non-Gregorian default
calendar can move the numbers. Display formatting is next-intl's job in `apps/web`
(see [I18N.md](../I18N.md)).

**Postgres is deliberately never asked to convert.** `AT TIME ZONE <non-constant>` is
`STABLE`, so it is rejected in a generated column or a `CHECK` anyway — but the deeper
reasons are that its ambiguity resolution differs from ours and its bundled tzdata
drifts from Node's ICU copy for days after a political change.

### Offsets are minutes, never hours

`Asia/Kolkata` is +05:30, `Pacific/Chatham` is +13:45, and `Australia/Lord_Howe` shifts
by **30** minutes across its DST boundary. Any code that models an offset as hours, or
a DST shift as "one hour", is wrong in those zones and only those zones — which is
exactly why they are in the test corpus.

### Ambiguity policy: `compatible`

A wall-clock reading is not always one instant. `resolveCivil` reports which case it
hit (`unique` / `gap` / `overlap`) so a composer can warn, and resolves it by the
`compatible` rule — matching Temporal, `java.time.ZonedDateTime.ofLocal`, Luxon and
Google Calendar:

- **Gap** (spring forward; e.g. `2026-03-08 02:30` in `America/New_York` never happens)
  → shift **forward** past the gap, landing at 03:30.
- **Overlap** (fall back; `2026-11-01 01:30` happens twice) → take the **earlier**
  instant.

Nothing about the resolution is stored — it is recomputed deterministically from
`(civil, zone)`.

**Throwing on a gap is not an option.** A recurring event can drift into one years
after it was created, and throwing at expansion time would blank an entire month view
for an event nobody touched.

## Zone identifiers: validate, don't canonicalise

Validate with `canonicalizeTimeZone`, **never**
`Intl.supportedValuesOf("timeZone").includes(...)`. That list holds only the ids ICU
considers primary, so it rejects perfectly valid aliases that real ICS files and real
user input are full of — verified on this runtime, `US/Eastern`, `Asia/Kolkata` and
`GMT` are all absent from it yet all resolve correctly.

**The runtime's preferred spelling is not stable, so store what you were given.** Also
verified here: this ICU build resolves `Asia/Kolkata` **to** `Asia/Calcutta` — the
reverse of the modern IANA primary. A value canonicalised by one Node version can
therefore disagree, as text, with one canonicalised by another. Aliases share their
rules, so every function in `timezone.ts` returns identical results for either
spelling; only string comparison would ever notice. **Compare behaviour, never
spelling.**

## Testing

`packages/calendar` is gated at **100/100/100/100** with `all: true`, the
`@repo/validators` posture — this is pure logic whose failure modes are silent (an
event renders an hour off; a recurrence skips a day), which is precisely what a
coverage gate is for. A new module joins the run automatically.

The DST corpus is chosen so each zone breaks a *different* naive implementation:

| Zone | What it catches |
| --- | --- |
| `America/New_York`, `Europe/London` | Northern DST; transitions land on different local hours (02:00 vs 01:00) |
| `Australia/Sydney` | Southern DST — the year runs the other way |
| `Australia/Lord_Howe` | A **30-minute** DST shift |
| `Pacific/Chatham` | +13:45 — breaks whole-hour offset maths |
| `Asia/Kolkata`, `Asia/Tehran`, `Pacific/Kiritimati` | +05:30, +03:30 (DST abolished 2022), +14:00 |

Two properties carry most of the weight: every reading produced *from* an instant
round-trips (and is never a gap), and a weekly 09:00 series reads 09:00 on both sides
of every transition while its instants step by 7 days ∓ the offset delta.

Anchors are read off the runtime's own database before being written down, never
recalled from memory — the zone rules in this file were established that way.
