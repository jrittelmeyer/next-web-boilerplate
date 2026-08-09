# Calendar — emailed invitations and the `.ics`

Load when touching the invitation email, the calendar attachment, or the public RSVP page.
Guest list and internal RSVP: [attendees.md](attendees.md). Domain model:
[model.md](model.md). Endpoints: [api.md](api.md).

> **Status: Phase 4, complete.** The serializer, the send seam, delivery, the public
> `/rsvp` page and the re-ask rules all ship. Per-occurrence RSVP, guest permissions and
> `VTIMEZONE` synthesis are Phase 6.

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

**Verified against a real inbox 2026-08-02 — the decision holds.** The test above proves what
we *emit*; it cannot prove what Gmail *renders*, and that was the whole claim. So a real
invitation went from a `:3105` production build through the real pg-boss worker and real
Resend (`[jobs] calendar-invitation (invite) sent to … (id: d7c948c0-…)`), carrying
`METHOD:PUBLISH`, no `ATTENDEE`, and `DTSTART;TZID=America/New_York`. The owner's Gmail
Android screenshot shows the parsed event card with **"Add to Calendar"** and **no
Yes/No/Maybe buttons**, at the correct civil time. Paired with the 2026-07-30 screenshot of
the `METHOD:REQUEST` alternative *showing* those buttons, both sides of the decision are now
observed rather than reasoned — which is why this was worth doing rather than asserting.

⚠️ Two gotchas that cost real time and will recur: `pnpm start` is `dotenv -e ../../.env`-wrapped,
so the send path is live whenever the root `.env` has `RESEND_API_KEY` — and an **orphaned
worker from an earlier session** will happily claim the job and log the send where nobody is
reading, making delivery unprovable. Confirm exactly one worker is running first.

The two rejected options, for the record: (b) keep `REQUEST` and build inbound iTIP `REPLY`
ingestion — a real feature (inbound provider, MIME + iTIP parsing, sender-vs-`ATTENDEE`
authorization, `SEQUENCE` ordering, spoofing defences) and a hard external dependency in a
starter that must build with its env unset; (c) keep `REQUEST` and ship the lie.

**(b) was closed for good on 2026-08-02, by owner decision: a documented extension point,
not scheduled work.** It had been carried as a Phase 6 item. The premise was re-checked
rather than assumed — [`services/resend.md`](../services/resend.md) describes outbound
sending plus a *delivery-event* webhook and **no inbound-parse path**, so building it means
adopting a new provider capability *and* a public endpoint that accepts attacker-controlled
mail. That is the same call the program already made for Google/Microsoft sync, and it is
the option the `METHOD:PUBLISH` decision was explicitly chosen *over*.

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

## The RSVP token

```
payload = attendeeId (16 bytes) || expSeconds (6 bytes BE, 0 = never)       // 22 bytes
token   = base64url(payload) || base64url(HMAC-SHA256(key, payload))        // 30 + 43 chars
key     = HMAC-SHA256(BETTER_AUTH_SECRET, "calendar-rsvp-token-v1")
```

**Stateless, with no stored column**, which keeps [attendees.md](attendees.md)'s claim true:
Phase 4 is purely additive and the attendee table is unchanged. The row already *is* the
capability. A stored token would buy per-invitation rotation that no surface offers, and
cost a column, an index, a backfill for the rows that already exist, and a second fact that
can disagree with the row.

**No `.` in the alphabet, and that is load-bearing rather than cosmetic.** `proxy.ts`'s
matcher is `/((?!api|_next|_vercel|.*\..*).*)` — a path containing a dot never enters the
proxy — and `routing.ts` uses `localePrefix: "as-needed"`, so the default-locale URL
`/rsvp/<token>` exists **only** via next-intl's rewrite into `[locale]`. A dotted separator
would therefore 404 every invitation in production while a hand-written fixture without one
passed every test. `calendar-invitations.spec.ts` resolves a **real minted** token through
the proxy for exactly this reason.

The key is a purpose-scoped derivation rather than `BETTER_AUTH_SECRET` itself, so an RSVP
token can never be substituted for a session artifact. Bumping the label invalidates every
outstanding link without touching the secret.

### Expiry and revocation, stated precisely

`exp = series_end_at + 30 days`, and `0` (never) when `series_end_at IS NULL`.
`series_end_at` is a stored, deliberately over-estimating bound ([model.md](model.md)), so
the error direction is the safe one.

| Event | Effect on the link |
| --- | --- |
| the guest is removed | `removeAttendees` hard-deletes the row → the token resolves to nothing |
| the event is soft-deleted | the read filters `deleted_at` → nothing resolves |
| `splitSeries` | the copy gets new attendee ids, so the second half has its own links |
| `BETTER_AUTH_SECRET` rotates | **every** outstanding link dies — same blast radius as session rotation |

Three residuals, documented rather than papered over:

1. **Rotating one guest's link means remove-then-add**, which fires a cancellation *and* an
   invitation to the same person.
2. **An account deletion leaves a working token.** `user_id` is `ON DELETE SET NULL`, so the
   row survives — and that is correct, not a gap: the invitation is to the *address*, which
   is the whole Phase-3 identity model.
3. **A forwarded link is a read grant** on the event's title, time and location to whoever
   receives it, bounded by `exp` only for a finite series.

## The public page: verify, drop the token, then render

`/rsvp/[token]` is a **route handler**, not a page, because only a route handler may set a
cookie. It verifies the token, moves it into an httpOnly `SameSite=Lax` cookie scoped to the
locale-prefixed `/rsvp` path, and redirects to `/rsvp/s/<handle>`, where the handle is a
short non-secret derivation. Two invitations can therefore sit open in two tabs without one
clobbering the other.

**Why redirect at all:** a capability token left in the address bar reaches PostHog's
`$current_url` autocapture (its provider is mounted in the `[locale]` layout), Sentry's
`request.url`, the `Referer` of any outbound link, and browser history. One redirect removes
it from all four, and the client component never sees the token — `respondByToken` takes the
handle and reads the cookie itself.

**Both outcomes redirect to a handle-shaped URL.** An invalid token yields
`rsvpHandle(token)`: a well-formed handle with no cookie behind it. Destination, status and
rendered page are identical whether the token was real, forged, expired or revoked — so the
route is not an oracle for which invitations exist. **Unknown, malformed, revoked, expired
and event-deleted all render the same page at HTTP 200.** There is no `notFound()`: a 404
answers "does this invitation exist?" for anyone who asks.

The email's Yes/No/Maybe buttons carry `?intent=`, which only **preselects**. A link that
recorded the answer on GET would be answered by every corporate mail scanner that follows
URLs in an inbound message — the same class of lie as the Gmail reply buttons this design
removed, with a different actor. The guest still presses a button, and the write is a POST.

The redirect has to carry `intent` onward or the preselect never happens — and it forwards
it **allow-listed against the three known answers**, not verbatim: the value arrives from an
emailed URL and is reflected into the page, so anything else is dropped rather than echoed.
The e2e asserts both halves: the button comes up pressed, and the stored status is still
`needs-action`.

`respondByToken` lives in its own file, `server/actions/calendar-rsvp.ts`, because every
export in the 1,600-line `server/actions/calendar.ts` opens with `requireSession()`; the one
function that must not would read as an oversight beside them. It deliberately does **not**
stamp `user_id`: a session proves who the caller is, a token proves only that whoever holds
the link was sent it, and those are not the same fact.

Its write limit (20/min, keyed by `clientKeyFromHeaders`) is **abuse dampening, not the
defence** — as is the **read cap**: the DB-bearing read (`loadRsvpView`, a four-table join)
is limited to **60/min per invitation**, keyed by attendee id, returning the same 200 "no
longer valid" page on denial rather than a distinguishing 429. It sits on `loadRsvpView` and
**not** on the `/rsvp/[token]` route handler on purpose — that handler verifies the HMAC and
redirects with **no database read**, so a held or forwarded token replaying the cookie
amplifies against the *page*, not the exchange, and a one-hour cookie means limiting the
exchange would cap nothing downstream. Per-invitation (attendee id), **not** per-IP, so
guests behind one shared egress don't cross-lock. The limiter is in-memory per instance
without Upstash and fails open; what makes forgery infeasible is the HMAC. A multi-instance
deploy that wants a real limit should set the Upstash pair.

## What an edit owes: three independent booleans

`lib/calendar/significant-change.ts` returns `{ bumpsSequence, resends, reasks }`. They do
not co-vary, and collapsing them into one "significant" flag is wrong in both directions.

| Changed field | bumps | resends | re-asks |
| --- | :-: | :-: | :-: |
| `startWall` · `endWall` · `startTzid` · `endTzid` · `allDay` · `rrule` | ✓ | ✓ | ✓ |
| `location` · `status` · `title` · `calendarId` (changes `ORGANIZER`) | ✓ | ✓ | ✗ |
| `transparency` | ✓ | ✗ | ✗ |
| `description` · `url` · `visibility` · `color` | ✗ | ✗ | ✗ |

`transparency` is the row that proves the split: it changes the `.ics` body, so Phase 6's
feed needs the bump, but nobody needs an email about a free/busy marker. `reasks` is narrowed
to time and recurrence, matching every major calendar — a venue change resends without
re-asking, because re-asking on every edit is how people learn to ignore the question.

**The attendee set is not a change to the event.** The guest diff already emails the person
added and the person removed; re-asking the other forty-eight because a colleague joined is
noise.

### Re-asking never destroys an answer

A `reasks` change stamps **`calendar_events.reask_at`**. Staleness is then derived:

```sql
attendee.responded_at IS NOT NULL AND attendee.responded_at < event.reask_at
```

So "declined — clashes with my flight" survives a reschedule, and the guest list renders
*"accepted — answered for an earlier version"*. `respondToEvent` needed no change at all: it
already stamps `responded_at = now()`, which clears staleness for free. A `splitSeries` copy
gets it automatically, since the copied timestamps predate the new master's stamp.

Not `sequence`: that bumps on a title edit too, so comparing against it would mark every
guest stale for a typo fix — the exact noise the three booleans exist to avoid.

## Every writer emits, or the attachment goes stale

| Writer | bumps | resends | re-asks |
| --- | :-: | :-: | :-: |
| `updateWholeEvent` | per the table above | | |
| `updateOccurrence` | ✓ on the **master** | ✓ | ✗ |
| `splitSeries` | new master at 0; first half +1 | ✓ **both halves** | ✓ new master, if the cut moved the time |
| `truncateSeries` · `skipOccurrence` · `setRecurrenceDate` | ✓ | ✓ | ✗ |
| `softDeleteEvent` | ✓ | cancellation | — |

`skipOccurrence` and `setRecurrenceDate` are the easy ones to miss: they change `EXDATE`/
`RDATE` — which **are** in the emitted `.ics` — while touching none of the columns the field
classifier reads. Leave them out and the update ships an attachment every conforming client
ignores, which is the inert-`SEQUENCE:0` failure in yet another costume.

`updateOccurrence` bumps the **master's** sequence, not the override's: the `.ics` is one
calendar, the override rides in it as a `RECURRENCE-ID` sibling, and the client decides
whether to apply the whole thing from the master's `SEQUENCE`.

`splitSeries` sends **two** emails per guest, one per UID, and that is not noise: their
client holds the original series and needs both the first half's new bound and the second
half, which is a different event.

## Delivery is a job, and the payload is self-contained

`JOBS.calendarInvitation`, **one job per recipient** so one hard-bounced address cannot force
forty-nine re-sends on a retry. Enqueued after the commit, beside `publishNotifications`.

The payload carries `to`, `organizerEmail`, `eventTitle`, a pre-formatted `when`, the `.ics`
and the already-minted `rsvpUrl` — never ids to re-read. The rule, and it is not a style
preference: **ids where the row survives, denormalised where the row is the thing being
destroyed.** `removeAttendees` hard-deletes inside the write transaction, so a cancellation
job handed only ids would find nothing and complete silently. (`welcomeEmailPayload` already
denormalises `to` for the same reason.)

Minting also has to happen here: `@repo/jobs` depends on `@repo/db` and `@repo/email` only,
cannot reach the token module, and `BETTER_AUTH_SECRET` is validated in `apps/web`'s env
schema alone — a worker holding a different secret would sign a **wrong** link rather than
fail to boot. Signing stays in one process. The minted URL does land in `pgboss.job.data`;
anyone who can read that table can already `UPDATE` the RSVP directly, so it grants nothing
new.

`when` is pre-formatted in the **event's own zone with the zone named**, because an external
guest has no stored locale and no stored zone, and "09:00" is meaningless three zones away.

## Graceful degradation, and how the E2E uses it

With email unconfigured no invitation is delivered, so the event page surfaces a **copyable
RSVP link per guest** — the `sendOrganizationInvitationEmail` posture. Only for a caller with
`canWriteCalendar`: the link *is* the capability, and handing it to a reader hands them the
power to answer for someone else.

`calendar-invitations.spec.ts` runs on the email-unconfigured lane and takes its token from
exactly that control, so the fallback and the RSVP flow are proven by the same steps. **The
`.ics` is asserted from `pgboss.job`, not from a captured email**: the Playwright `webServer`
array runs two Next servers and nothing that drains the queue, so a capture-file assertion
behind a job would hang for its timeout and throw. The queue row proves the writer assembled
the right calendar for the right person; live-verify covers the delivery step against a real
inbox.
