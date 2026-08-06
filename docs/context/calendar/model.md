# Calendar — domain model

Load when working in `packages/calendar` or on anything that converts between a
wall-clock reading and a point on the timeline. Leaf rules (one imperative per line)
live in [`packages/calendar/AGENTS.md`](../../../packages/calendar/AGENTS.md).

> **Status:** Phases 0–5. The time core (`civil.ts`, `timezone.ts`, `derive.ts`) and the
> `calendars` / `calendar_events` schema exist. `recurrence_parent_id`, `recurrence_id`,
> `rrule` and `series_end_at` are **written as of Phase 2** — no longer inert. The
> `RRULE` engine, the `calendar_recurrence_dates` table, per-occurrence overrides and
> the three edit scopes are documented in [`recurrence.md`](recurrence.md), which owns
> that surface; attendees, RSVP and the invitation notifications are in
> [`attendees.md`](attendees.md), which owns theirs. This file keeps the time model
> underneath both. Emailed invitations and the `.ics` serializer shipped in Phase 4
([invitations.md](invitations.md)); reminders in Phase 5 ([reminders.md](reminders.md)).
**Every "Phase 6" mention across these calendar docs is deferred, unscheduled and
unauthorized work** — its one tracked home is the B2 row in [BACKLOG.md](../../BACKLOG.md).
**Free/busy is Phase 7 and is not scheduled** — it has no backlog row, so do not read this
file as promising it a section.

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

### Postgres is deliberately never asked to convert

Not because it can't. Measured against PG 18 before migration `0020` was written: the
two-argument `timezone(text, timestamp)` that `AT TIME ZONE <non-constant>` compiles to
is marked **`IMMUTABLE`** (`pg_proc.provolatile`); only the one-argument form, which
reads the session `TimeZone` GUC, is `STABLE`. So the conversion is legal in a generated
column, an index and a `CHECK`. Upstream marks it immutable by deliberate fiat despite
its dependence on a mutable timezone database, on the position that users accept
rebuilding affected indexes after a tzdata update.

We decline for three reasons, none of them legality:

1. **Its ambiguity resolution is not ours.** On a fall-back overlap Postgres returns the
   *later* instant; `resolveCivil` returns the earlier (the `compatible` rule below).
   They disagree by the transition size — measured at 30 min (`Australia/Lord_Howe`),
   60 min (`America/New_York`) and **120 min** (`Antarctica/Troll`).
2. **Its tzdata is a different copy from Node's ICU**, on a different release cadence.
   Postgres re-evaluates every `CHECK` on **every UPDATE**, so a rule change landing in
   one and not the other would make affected rows un-editable — including the UPDATE
   that soft-deletes them. `COPY` enforces CHECKs too and `pg_restore --disable-triggers`
   does not disable them, so a dump could also fail to restore.
3. **It disagrees with us by seconds on pre-1900 local mean time**, which
   `offsetMinutesAt` rounds to whole minutes by design (`Asia/Kolkata` in 1885 has a
   ~10-second residue).

⚠️ **A CHECK building is not evidence of immutability.** Postgres does not enforce
volatility in `CHECK` constraints at all — a `STABLE` `timestamptz + interval` builds
fine in one. **Generated columns** do enforce it, and are the valid discriminator.

What the schema enforces instead is pure arithmetic over a **stored** offset — see
[Derived instants](#derived-instants-are-enforced-by-arithmetic-not-by-tzdata) below.

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

The *kind* is not stored — it is recomputed deterministically from `(civil, zone)`. The
resolved **offset** is stored, and that is a separate decision with its own reasons; see
[Derived instants](#derived-instants-are-enforced-by-arithmetic-not-by-tzdata).

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

## Storage: the event row

`calendar_events` keeps civil time as the source of truth and the instants as a derived
cache. Schema: [`packages/db/src/schema/calendar-events.ts`](../../../packages/db/src/schema/calendar-events.ts);
leaf rules: [`packages/db/AGENTS.md`](../../../packages/db/AGENTS.md).

| Column group | Role |
| --- | --- |
| `start_wall` / `start_tzid` (and the `end_*` pair) | What the user meant — "09:30, New York". The truth. |
| `start_offset_minutes` / `end_offset_minutes` | The offset `deriveEventInstants` actually applied. `smallint NOT NULL`, **no default**. |
| `start_at` / `end_at` | `timestamptz` cache, so a window query can use a btree. |

Start and end carry **independent** zones, so a flight departs 09:00 New York and
arrives 11:30 Los Angeles.

### Derived instants are enforced by arithmetic, not by tzdata

```sql
CHECK ( start_at = (start_wall - make_interval(mins => start_offset_minutes)) AT TIME ZONE 'UTC' )
```

Every operand is immutable *and* true: `make_interval` is `IMMUTABLE`, `timestamp -
interval` is `IMMUTABLE`, and `timezone('UTC', …)` consults no mutable rule set. The
constraint therefore never reads a timezone database, which is what makes all three
objections above moot.

Storing the offset buys one thing nothing else does: **it pins which branch of a
fall-back overlap was taken.** The two candidate instants have different offsets, so a
row claiming `01:30` New York at offset −240 while storing the later `06:30Z` instant is
rejected. A constraint that re-derived from `start_tzid` could not tell those apart —
and its second disjunct would have been the naive backfill idiom
(`SET start_at = start_wall AT TIME ZONE start_tzid`) verbatim, so it could not reject
its own output.

`NOT NULL` with **no default** is the other half. A writer that bypasses
`deriveEventInstants` and doesn't know the column gets a not-null violation rather than
writing a plausible-looking instant nobody notices.

**Residual, stated rather than papered over:** a writer that lies *consistently* — a
naive instant together with offset `0` — satisfies the arithmetic. That is covered by
**detection, not DDL**: an integration assertion recomputes each row's offset from the
live tz database and reports mismatches. It reports; it never blocks. Blocking would
reintroduce exactly the un-editable-row failure mode the design exists to avoid.

### The other constraints

- `end_at >= start_at`.
- `end_at - start_at <= interval '366 days'` — **subtraction**, not `start_at + interval`.
  `timestamptz_mi` is `IMMUTABLE`; `timestamptz_pl_interval` is only `STABLE` (day
  arithmetic on a `timestamptz` depends on the session `TimeZone`). Postgres builds
  either, so this is a correctness choice, not a legality one. Consequence: subtraction
  measures **elapsed** time, so a 366-day span crossing DST is 366 d ± 1 h — the window
  query's redundant lower bound must therefore use **367 days** of slack.
- `num_nonnulls(recurrence_parent_id, recurrence_id) <> 1` — both or neither.
- `recurrence_parent_id IS NULL OR rrule IS NULL` — an override is not itself a series.
- All-day rows sit on midnight in both wall columns (two-arg `date_trunc` is `IMMUTABLE`).
- `UNIQUE (calendar_id, uid, recurrence_id) NULLS NOT DISTINCT` — the Phase-6 ICS upsert
  target, landed now because backfilling UIDs after a feed has subscribers makes every
  event look deleted-and-recreated in every subscriber's client.

### Soft delete resurrects on reimport — decided, not discovered

A table constraint cannot be partial, so the UID unique **spans soft-deleted rows**.
Delete an event, reimport the same `.ics`, and the write conflicts instead of inserting.
The Phase-6 upsert must therefore clear `deleted_at` — it **resurrects** the event — and
its import report must say so. Migration `0020` locks that semantic; it is written down
here so Phase 6 implements it deliberately instead of discovering it as a bug.

### The read surface is split

`calendar_event_masters` (a `pgView`: `recurrence_parent_id IS NULL AND deleted_at IS
NULL`) is the read surface for **list, count and detail**. The **window/range query is
the documented exception and reads `calendar_events` directly**, spelling out
`rrule IS NULL AND deleted_at IS NULL`. Two measured reasons, at 5k rows on PG 18:

- **Planner** — the view's predicate does not imply `rrule IS NULL`, so Postgres cannot
  prove `calendar_events_concrete_idx` applicable: `Seq Scan` through the view vs
  `Bitmap Index Scan` on the raw table.
- **Correctness** — the range query must *include* per-occurrence overrides, and the view
  excludes them (measured: it hid 294 of 4,546 concrete rows). From Phase 2 a month grid
  built on the view would silently stop showing moved occurrences.

An `EXPLAIN (FORMAT JSON)` assertion in the integration suite pins the index choice —
it is the only thing that catches a regression here before Phase 2 makes it wrong as
well as slow. The view is **auto-updatable** and drizzle emits no `WITH CHECK OPTION`,
so it is technically a write path: never write through it.

From Phase 2 the range query is **three** queries, not one: the concrete branch above, a
masters branch on `calendar_events_recurring_idx`, and the **override-suppression scan** —
*which occurrences of these masters already have an override row?* — on
`calendar_events_override_idx`. That third access pattern is what migration `0021` exists
for. Measured on PG 18 at 22,400 rows / 2,000 overrides, after `VACUUM (ANALYZE)`, on the
identical query:

| Index | Size | Plan | Index-side buffers |
| --- | --- | --- | --- |
| `(recurrence_parent_id)` — Phase 1's | 176 kB | `Index Scan`, `recurrence_id` as a Filter, 1,405 rows discarded | 1,971 |
| `(recurrence_parent_id, recurrence_id)` plain | 232 kB | — | — |
| `+ calendar_id` plain | 272 kB | — | — |
| **`(recurrence_parent_id, recurrence_id) WHERE recurrence_parent_id IS NOT NULL`** | **96 kB** | **`Index Only Scan`, Heap Fetches 0** | **15** |
| `+ calendar_id`, partial | 136 kB | `Index Only Scan`, Heap Fetches 0 | 17 |

**A plain btree stores NULL keys**, so "only override rows are non-NULL, therefore the
index is the same size" is false — the plain three-column variant is 55% *larger* than the
single-column index it would replace. The partial predicate is what actually buys "override
rows only", and it lands smaller than what it replaces. `calendar_id` is absent because it
buys nothing measurable and `calendar_events_parent_same_calendar` makes it redundant. The
partial index still serves the FK cascade, verified: a strict `= $1` implies `IS NOT NULL`,
which Postgres can prove against the predicate.

### The three ICS columns, and who writes them (Phase 4)

`uid`, `sequence` and `reask_at` are all written by the invitation machinery and by nothing
else — `eventColumns()` deliberately omits every one of them, so no ordinary save can touch
them by accident.

| Column | Written by | Why it exists |
| --- | --- | --- |
| `uid` | once, at insert (`crypto.randomUUID()`) — and by `splitSeries`, explicitly, for the new master | Immutable. Changing it reads as delete-and-recreate in every subscriber's client, which is also why it shipped in Phase 1 rather than being backfilled |
| `sequence` | every writer whose edit changes the emitted `.ics` | A conforming client **ignores** a re-import whose `UID` matches and whose `SEQUENCE` has not risen, so an update that does not bump ships an inert attachment |
| `reask_at` | a time-or-recurrence change, and a `splitSeries` cut that moved the time | Lets "re-ask the guests" be a *derived* comparison (`responded_at < reask_at`) instead of a write that overwrites their stored answer and comment |

Full rules, including which of the six writers owes which email:
[invitations.md](invitations.md).

### Override integrity — one rule of three is enforced by the database

| Rule | Enforced by |
| --- | --- |
| An override lives in its master's calendar | **`calendar_events_parent_same_calendar`** — a composite FK, `ON UPDATE CASCADE`, so a master that changes calendar takes its overrides with it |
| An override carries its master's `uid` | The writer, plus a detection assertion in the integration suite |
| An override's parent is a recurring event | The writer, plus the same detection assertion |

The last two are cross-row predicates a `CHECK` cannot express. **Detected and reported,
never blocked** — the same posture this document takes for the derived-instant residual,
and for the same reason: a guard that can make an existing row un-editable is worse than
the drift it prevents.

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
