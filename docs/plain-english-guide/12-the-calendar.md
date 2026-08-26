# Chapter 12 — The Calendar: the hardest easy feature

[← Built With AI Agents](11-built-with-ai-agents.md) · [Guide index](README.md) · [Next: Glossary →](13-glossary.md)

---

Everybody thinks a calendar is a grid of boxes. It is, in the same way an
aeroplane is a chair with windows. Scheduling is the feature that most reliably
teaches a team they did not actually understand time — and because everyone has
used a calendar, nobody budgets for it. This chapter walks the newest room in the
house, and, in the guide's usual habit, says exactly where it stops.

## Two kinds of time, and they are never the same thing

This is the intellectual core of the feature, and worth two minutes even if you
skip the rest.

**Technical names:** a **civil** time and an **instant**.

**Plainly:** "09:00 next Monday" is a *wall-clock reading*. It is what a person
means, and on its own it is not a moment in history — until you also say *where*,
it could be any of two dozen instants around the world. An **instant** is the
other thing: a specific point on the timeline, the same for everyone alive,
however their local clock happens to be labelled. Most calendar bugs are a team
quietly treating these as interchangeable.

**Why it decides the design:** the wall-clock reading is the truth for anything
that repeats. A 09:00 Monday standup is *defined* as "09:00, every Monday" — so
when the clocks change in spring it stays at 09:00, because that is what the
person meant. Build the repeating machinery out of instants instead and it
faithfully reports a uniform seven days between occurrences, and is **silently
wrong twice a year**. Silently is the operative word: nothing crashes, nothing is
logged, the meeting simply starts an hour off and everyone blames each other.

Two smaller traps the project calls out by name, because both are usually got
wrong:

- **Time offsets are minutes, never hours.** India is five and a half hours
  ahead; the Chatham Islands 13 hours 45 minutes; Lord Howe Island's
  daylight-saving shift is **thirty** minutes. Code assuming "the clocks go
  forward an hour" is right almost everywhere and wrong exactly where nobody
  tests — so those zones are deliberately in the test set.
- **Some wall-clock readings don't exist, and some happen twice.** The morning
  the clocks spring forward, 02:30 never happens; the morning they fall back,
  01:30 happens twice. The project picks the same answers as Google Calendar
  (skip past the gap, take the earlier of the two) and refuses to call it an
  error — a meeting created today can drift into one of those holes years later,
  and throwing then would blank out somebody's whole month view for an event
  nobody touched.

## Repeating events: a rule, not ten thousand rows

**Technical name:** an `RRULE` (recurrence rule), from the same standard your
email program uses.

**Plainly:** "every second Tuesday" is stored *as that sentence*, not as
thousands of entries stretching into the future. When a screen asks for March,
the rule is unrolled just far enough to fill March.

The decisions here are about refusing to guess. The standard is enormous; this
project supports a defined slice and **rejects the rest loudly** rather than
half-understanding a rule — because dropping the part you don't support renders
*wrong* dates, which is worse than rendering fewer. That strictness was measured,
not assumed: the most popular open-source implementation of this standard accepts
a rule with no frequency at all, accepts two contradictory ways of saying when a
series ends (which the specification forbids), accepts an interval of zero, and
accepts a count of −1 — which unrolls to 416,011 occurrences. This engine rejects
each with a specific error.

One detail stands in for the genre: if a series is "five occurrences" and the
organiser deletes one, the answer is **four**, not five — the skipped one still
consumes its slot. The specification says so, and most implementations get it
wrong.

## Changing one of something that repeats

Every user expects three options, and most software fumbles one: change **this
occurrence**, **this and everything after it**, or **the whole series**.

Moving a single occurrence stores a small exception pointing back at the series,
so a moved Tuesday is a real, addressable entry that behaves exactly like an
ordinary event on the grid. Splitting "from here onwards" creates a genuine
second series, carrying the guests, their answers and their comments across
rather than resetting them.

Changing the *whole* series when it has exceptions is the honest hard case:
moving everything invalidates every "except this one" already recorded, because
those exceptions were pinned to occurrence times that no longer exist. Correct,
and destructive — so the editing screen says so before you submit, not after.

## How the repeating engine was proven

Date maths is the kind of code easily tested *against your own assumptions*,
which proves nothing, because the assumptions are the bug. So the engine was
checked against a separate, independently written implementation across **568
recurrence rules**. Three details make that more than a box-tick:

- **The answer key was written before the engine was**, so it cannot have been
  fitted to whatever the code happened to produce.
- **The answer key is fingerprinted.** A checksum is pinned in the test, so
  regenerating it is a visible change a reviewer must approve.
- **The rule when it disagrees is written down:** fix the engine, or settle it
  against the published standard and record the citation. Never regenerate the
  answer key — that silently converts an independent check into a mirror of the
  code it exists to check.

The calendar package also sits under a **100% test-coverage** requirement on all
four measures the industry counts — reserved for exactly this kind of pure logic,
where failure is silent: an event renders an hour off, a recurrence skips a day,
and nothing reports an error.

## Guests who don't have an account

**The identity is the email address, not the account.** You invite
`someone@elsewhere.com`; whether that address has an account here is a separate
and changeable fact. External guests aren't a bolt-on — they are emailed, they
answer from a public page without signing in, and they appear on the guest list.

- **An invitation binds to an account only once a *verified* email claims it.**
  Without that word, anyone could sign up as `victim@example.com`, never verify
  it, and read that person's invitations.
- **Deleting an account doesn't remove you from someone's guest list** — you
  degrade back into an external guest, because the organiser still needs to know
  who is coming.
- **Editing an event doesn't quietly reset everyone's answer.** The guest list is
  compared address by address and anyone unchanged is left alone. The naive
  implementation — delete the list, re-insert it — turns a typo fix in the title
  into forty-nine people marked as not having replied.

The same restraint governs re-asking. Change the *time* and everyone is asked
again; change the *venue* and the update goes out without reopening the question,
because software that re-asks on every edit teaches people to ignore the
question. And re-asking never destroys an answer: "declined — clashes with my
flight" survives a reschedule, shown on the guest list as *answered for an
earlier version*.

## The file your email program understands

**Technical name:** iCalendar, the `.ics` attachment — the format every mail and
calendar program agrees on, so an invitation becomes an entry in one click.

**It is fussier than anyone expects.** Its line-length limit is counted in
**bytes, not letters**: most English letters are one byte, while accented, Greek,
Cyrillic, Arabic and CJK characters are two to four. Cut a line at a *character*
count and you eventually slice a character in half and emit two invalid bytes —
precisely where non-English calendars break in lesser implementations. This one
measures the budget in bytes while packing whole characters.

The most interesting decision is one about **refusing a feature**. Sending the
attachment in "meeting request" mode makes Gmail render native **Yes / No /
Maybe** buttons — which looks like a win, and was verified working. It was
rejected anyway: pressing one makes Gmail email the reply back to the organiser,
and this project has nothing that reads incoming email. Nothing would reach the
database, and the guest would see no error and believe they had answered. A
button that lies is worse than no button — and, pleasingly, the standard agrees:
the one property whose removal kills the dead buttons is one the specification
already forbids in this mode. Both halves were confirmed by screenshot from a
real inbox rather than reasoned about.

The same instinct shows up one layer down. The Yes / No / Maybe links in the
email only *preselect*; the guest still presses a button on the page to record
it, because a link that answered on click would be "answered" by every corporate
mail scanner that follows links in incoming messages. The invitation link is also
traded for a browser cookie the moment it opens, so the secret never lands in
analytics, error reports, browser history, or the trail left when the page links
out — and it deliberately contains no dot, because the app's routing treats a
dotted address as a file request, so a dot there would have produced a passing
test suite and a 404 for every real invitation in production.

## Reminders that fire exactly once

"Remind me 15 minutes before" looks like an afternoon's work and quietly isn't.

The obvious design — when an event is saved, schedule its alerts — falls apart on
contact: a series that repeats forever has infinitely many alerts to schedule,
and every reschedule, cancellation, split or timezone change strands
already-scheduled ones waiting to fire at the wrong time. So this project
schedules nothing. A sweeper wakes every five minutes, looks at events as they
*currently* are, and sends what is due. **There is nothing to cancel, and
therefore no cancellation bug.**

The exactly-once guarantee is then one line of database work and no coordination
machinery: before sending, the sweeper writes a claim for *this reminder, this
occurrence*, and the database's uniqueness rule means only one writer can win.
Two servers at once, two overlapping sweeps, a post-outage backlog colliding with
a live run — same answer every time. That is the sort of thing this project takes
seriously and most starters leave to chance.

Its limits, stated in the same spirit: alerts anchor to an event's *start*, not
its end (the end-anchored version is blocked by a database rule, so it is
unreachable rather than silently broken); reminders go to the calendar's owner
and not to guests, because emailing external people on a schedule needs a consent
and unsubscribe surface this feature doesn't have; the email is written in the
organiser's timezone; and because the sweep is every five minutes, the wording
says "about 15 minutes" rather than claiming a precision it doesn't have.

## What it deliberately doesn't do yet

The guide's rule is that the roads not taken get named.

**Designed, documented, and not built** — each gated on a real user needing it
rather than on enthusiasm: sharing a calendar with another person, organisation
calendars, publishing a subscribe-by-URL feed, importing someone else's `.ics`,
answering for a single occurrence of a series, and per-guest permissions (who may
invite others, who may see the guest list).

**Closed by decision, with reasons on file:** parsing replies that arrive *by
email*, which needs an inbound-mail pipeline and a public endpoint accepting
attacker-controlled mail — the same call the project already made about syncing
with Google and Microsoft; and reminders to external guests, which need the
consent record described above. Free/busy lookup ("when is this person free?") is
not scheduled at all.

Two honest notes rather than features. There is **no administrator override**, by
design: an admin who can list every user's meeting titles, locations and
attendees is a privacy incident with a user interface. And the per-event
**"private" marker is stored but does not yet hide anything** — today an event is
visible to its owner and to the people invited to it, so the marker changes
nothing for anyone not already entitled to see it. The project says that plainly
in its own documentation instead of implying a privacy feature it hasn't built.

**Business value of the chapter in one line:** the calendar is the exhibit that
this project's method survives a genuinely hard domain — a feature everyone
underestimates, built with the difficult parts done properly, proved against an
independent reference, and shipped with its own unfinished edges written down
rather than dressed up.

---

[← Built With AI Agents](11-built-with-ai-agents.md) · [Guide index](README.md) · [Next: Glossary →](13-glossary.md)
