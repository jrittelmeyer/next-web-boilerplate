# Calendar — reminders

Load when working on reminder rules, the delivery sweeper in `@repo/jobs`, or anything
that asks *"when does this fire, and how do we know it fired once?"*

> **Status:** Phase 5 **shipped 2026-08-02** — all of it is live: the schema (`0025`) and its
> integrity tests, the `*/5` sweeper (`@repo/jobs` → `handlers/calendar-reminder-sweep.ts` +
> `reminders/{run,sweep,site-url}.ts`), both delivery handlers
> (`calendar-reminder-{email,notify}`), and the composer editor
> (`components/calendar/reminder-field.tsx` → `applyReminders`). Time-model rules underneath all of it live in
> [`model.md`](model.md); the attendee surface reminders deliberately mirror is
> [`attendees.md`](attendees.md).

## What a reminder is

A row saying *"tell **this user** about **this event**, **N minutes** relative to its
start, over **this channel**."* Channels are `email` and `in-app`. Offsets are **signed
minutes**, negative = before.

One column carries every case a calendar needs. "15 minutes before" is `-15`; "1 day
before" is `-1440`; "the day before at 09:00" on an all-day event is `-900`, because an
all-day event's start instant is local midnight. It also maps 1:1 onto an ICS
`TRIGGER:-PT15M`, which is what Phase 6's feed will emit.

### Reminders are the calendar OWNER's — for now, and not by constraint

Phase 5 writes reminders only for the owner of the calendar the event lives on. Guests get
none, for reasons that are about capability rather than taste: an external guest has no
`user_id`, so an in-app reminder has nowhere to go, and emailing one recurring mail means
building a consent and unsubscribe surface this phase does not.

⚠️ **The schema does not enforce that.** `user_id` will accept any user against any event;
the boundary lives in the write path alone. It is spelled out here because Phase 6 widens
that write path for shared calendars, and a reader who checks only the DDL would conclude
guest reminders were already sanctioned.

### The `end` anchor exists in the union and is rejected by a CHECK

`anchor` is `'start' | 'end'`, and `calendar_event_reminders_anchor_supported` currently
rejects `'end'`. That is a real defect being fenced off, not caution:

`expandSeries` in `@repo/calendar` windows on each occurrence's **start** instant **by
default**, and the sweeper takes that default (`expand.ts` filters
`instantMs >= fromMs && instantMs <= toMs`, where `instantMs` is the
occurrence start; the end is derived afterwards). An end-anchored reminder on a recurring
series would therefore ask for a window the occurrence's start falls outside of, and would
**silently never fire** — no log, no throw, and the concrete branch would keep working, so
it would look correct. Phase 6 supports it by widening the expansion window by the master's
nominal span and re-filtering on the end instant, with its own tests. Until then the CHECK
makes it unreachable rather than merely undocumented.

The column and the union member ship now because widening a `text` union later is a
one-line edit, while adding a column is a migration.

### Overrides inherit, exactly as attendees do

Reminders hang off the **series master**. Resolve `recurrence_parent_id ?? id` before any
reminder read or write. Setting one reminder on a weekly meeting stays true after someone
moves a single occurrence — the override is a concrete row with its own time, and it is
reminded by its master's rules.

## Delivery is swept, never pre-enqueued

The mechanism is a five-minute pg-boss sweeper that expands against **live** rows every
tick. Pre-enqueueing with `boss.send(…, { startAfter })` fails on every edit: an unbounded
series cannot be enqueued at all, and pg-boss has no cancel-by-correlation-key, so a
rescheduled, deleted, split or timezone-shifted event leaves a pending job that fires at the
wrong time. Sweeping means **there is nothing to cancel and therefore no cancellation bug.**

**Precision is ±5–6 minutes and the copy says "about".** pg-boss's own monitor polls at
~60 s, so per-minute would be the resolution floor even at a per-minute cron — and a
per-minute cron would write ~1,440 `pgboss.job` rows/day forever in every generated
project, including ones with no calendar at all.

### The dedupe ledger is the whole concurrency story

`calendar_reminder_deliveries` carries `unique(reminder_id, occurrence_start_at)`, and the
sweeper claims a delivery with:

```sql
INSERT INTO calendar_reminder_deliveries (reminder_id, occurrence_start_at)
VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id
```

**A returned row is the claim.** No row means another sweep already owns it. That one
statement arbitrates two workers, two overlapping sweeps, and a missed-tick backlog running
into a live tick. Nothing else coordinates, and nothing else needs to.

#### Why the key is an instant and not a `recurrence_id`

Keying on `recurrence_id` is not merely lossy — it does not function.
`calendar_events.recurrence_id` is **NULL for every non-override row** (its
`recurrence_pair` CHECK forces both-or-neither), so a unique over it would be
all-NULLs-distinct for ordinary events and **every tick inside the grace window would
insert a fresh row and re-send**.

It fails a second way even where it is non-NULL: a `recurrence_id` is an occurrence's
*identity* and survives a reschedule unchanged. Moving a 10:00 meeting to 14:00 after its
09:45 reminder fired would send nothing at the new time — the exact case a reminder exists
for. An instant moves when the occurrence moves.

**Accepted consequence:** editing a reminder's *offset* after delivery does not re-fire for
that same occurrence. That is correct — you were already reminded about it.

## The in-app notification's shape

`calendar_reminder` joins `NOTIFICATION_TYPES` in **`@repo/db` and `@repo/validators`, in
one commit**. Extending one alone makes `notification-bus.ts`'s `safeParse` drop every
reminder with no log, no error and no Sentry event; `lib/union-parity.test.ts` is what
refuses to let those be two commits.

The feed renders through exactly two slots — `notifications-feed.tsx` passes
`{ actor: body, event: title }` — so:

| Column | Carries |
| --- | --- |
| `title` | the event title (fills `{event}`) |
| `body` | the minutes until start, as a **number in a string** |
| `link` | `/calendar/event/<id>` — a **relative path** |

**`body` holds a machine value, never a phrase.** The DB union's own contract says it:
there is no stored user locale, so a body written at NOTIFY time cannot be localized. Write
`"starts in about 15 minutes"` into it and a Spanish reader gets that English clause
interpolated into a Spanish sentence — while `i18n-parity.test.ts` and `union-parity.test.ts`
both stay green, because they check key presence, not slot semantics.

**The sentence interpolates `{event}` only** — "{event} starts soon" — like
`calendarCancelled`. Putting the number in the sentence looked obvious and does not survive
contact: `{actor} minutes` renders "1 minutes", and a day-before reminder would read "in
about 1440 minutes". The precision is ±5–6 minutes anyway; the exact time is in the email.
`body` still carries the number because it is the one durable fact a future sentence (or a
support query) would want, and storing it costs nothing.

⚠️ **`link` must be relative.** `notifications_link_same_origin` CHECKs
`left(link,1) = '/'`, so handing it an absolute URL means Postgres rejects the insert, the
handler throws, and every reminder retries to exhaustion into the DLQ. The worker builds the
path with no base URL at all — which is also why it can do this without any `apps/web` env.

## Two accepted inaccuracies, stated rather than discovered

**Signed minutes is exact-elapsed arithmetic.** `make_interval(mins => …)` on a
`timestamptz` measures elapsed time; only day/month intervals do calendar arithmetic. So a
day-before reminder spanning a DST transition fires an hour early or late in local terms.
`packages/calendar/src/expand.ts` names instants-based arithmetic as this repo's canonical
silent bug, so it does not get to be silent here. The single-column design is worth it: it
is what makes all-day semantics and the ICS `TRIGGER` mapping free.

**A worker outage longer than the grace window drops what it slept through.** The sweeper
looks back a fixed 60 minutes rather than tracking a persisted cursor — a cursor is one
stuck row away from either replaying everything or silently skipping a day, and the dedupe
unique already makes an overlapping window a no-op. A two-hour-late "starts in about 15
minutes" is noise, not a reminder. It is one constant if a deployment disagrees.

## Removal

The Phase-5 step in [`remove-it.md`](remove-it.md) is not just "delete the code":
`boss.schedule` persists into `pgboss.schedule` keyed by queue name, so the sweeper's row
outlives its code and keeps enqueueing into a queue nobody watches. **Removal must call
`boss.unschedule` first.**

The 90-day retention DELETE for the delivery ledger lives **inside the sweeper** for the
same class of reason: parked in the nightly cleanup handler instead, a project that dropped
the table would leave that handler throwing `relation does not exist` every night forever,
taking Better Auth's token pruning down with it. In the sweeper, removal is automatic.
