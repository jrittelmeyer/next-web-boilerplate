# Calendar — remove it

The convention every integration doc under [services/](../services/) follows
([ARCHITECTURE.md](../ARCHITECTURE.md)), applied to the calendar. Use this when a
generated project doesn't want a calendar at all.

The calendar has **no third-party dependency, no env var and no CSP entry** — it is
`@repo/calendar` (zero-dependency pure logic), six tables + a view and a slice of `apps/web`.
That makes it easier to remove than any service integration, with exactly two
complications, both below.

> **Phase 3 added the second complication, and it is the one that is easy to miss.** The
> calendar is no longer self-contained: `notifications.type` gained a family of `calendar_*`
> members, and **`notifications` survives removal** — it is a general-purpose table the
> realtime example depends on. So removal has to reach into a table it does not delete,
> in two packages, and clean up rows that already exist. Steps 5 and 9 carry it, and the
> `DELETE` at the bottom of this page finishes it.

## The first complication: you cannot delete a migration

`packages/db/AGENTS.md` is unambiguous — migrations are **forward-only**. Deleting
`0020_nostalgic_hitman.sql` would desynchronise `drizzle/migrations/meta/_journal.json`
from every database that has already applied it, and the next `db:migrate` on a deployed
environment would fail or, worse, half-apply. So removal means **authoring a
compensating migration**. Its DDL is at the bottom of this page.

If you are removing the calendar from a **freshly generated project that has never run
`db:migrate` against a real database**, you may instead delete the calendar migrations
outright along with their snapshots and journal entries — but only then, and only before
the first deploy.

## Steps

1. **Delete the app slice** (under `apps/web/src/`):
   - `app/[locale]/(dashboard)/calendar/` (all three routes, including `invites/`)
   - **`app/[locale]/rsvp/`** (Phase 4 — the public `[token]/route.ts` and `s/[handle]/page.tsx`)
   - `components/calendar/`
   - `lib/calendar-acl.ts`, `lib/calendar-attendees.ts`, **`lib/calendar-tokens.ts`**,
     `lib/calendar/`
   - `server/actions/calendar.ts`, **`server/actions/calendar-rsvp.ts`**,
     **`server/calendar/`**, `server/trpc/routers/calendar.ts`
   - the `*.test.ts` siblings of all of the above
2. **Unhook the router**: remove the `calendar:` line and its import from
   `server/trpc/root.ts`.
3. **Unhook the nav and the gate**: remove the `/calendar` `<Link>` from
   `app/[locale]/(dashboard)/layout.tsx` and `"/calendar"` from `PROTECTED_PREFIXES` in
   `src/proxy.ts`.
4. **Drop the i18n namespaces**: delete `Calendar` **and `Rsvp`** from `messages/en.json`
   and `messages/es.json`, plus `Metadata.calendar`, `Metadata.calendarEvent`,
   `Metadata.calendarInvites`, **`Metadata.rsvp`** and `Dashboard.nav.calendar`.
   `src/lib/i18n-parity.test.ts` fails if you do one locale and not the other, which is
   the point of it.
5. **Drop the calendar half of the notifications namespace** — the step that is easy to
   miss, because `notifications` is not a calendar table and survives. Delete
   `Notifications.calendarInvite`, `.calendarResponseAccepted`, `.calendarResponseDeclined`,
   `.calendarResponseTentative`, `.calendarCancelled` and **`.calendarReminder`** (Phase 5)
   from **both** locales, and remove **every `calendar_*` member** from `SENTENCE_KEYS` in
   `src/components/notifications/notifications-feed.tsx`. That object is
   `satisfies Record<Exclude<FeedItem["type"], "test" | "system">, string>`, so it stops
   compiling until the union in step 9 is trimmed to match — which is the guard working,
   not a problem.
6. **Trim coverage**: remove every calendar entry from `coverage.include` in
   `apps/web/vitest.config.ts` — `src/server/actions/calendar.ts`,
   `src/server/actions/calendar-rsvp.ts`, `src/lib/calendar-acl.ts`,
   `src/lib/calendar-attendees.ts`, `src/lib/calendar-tokens.ts`,
   `src/lib/calendar/grid.ts`, `src/lib/calendar/recurrence-dates.ts`,
   `src/lib/calendar/recurrence-prose.ts`, `src/lib/calendar/significant-change.ts`,
   `src/lib/calendar-reminders.ts`, `src/server/calendar/invitations.ts` and
   `src/server/calendar/rsvp.ts`. It is an explicit
   file list, and a stale entry there fails the run — so grep the block for `calendar`
   rather than trusting this enumeration, which every phase has extended. Leave
   `src/server/notifications/create.ts` and `src/server/realtime/notification-bus.ts`;
   neither is calendar-specific.
7. **Delete the E2E**: `e2e/calendar.spec.ts`, `e2e/calendar-invites.spec.ts`,
   **`e2e/calendar-invitations.spec.ts`**, the calendar helpers at the bottom of
   `e2e/support/db.ts` (`setUserTimeZone`, `seedCalendar`, `seedEvents`, `seedAttendee`,
   `getAttendeeStatus`, **`getEventIdByTitle`**, **`getInvitationJobs`**,
   **`deleteInvitationJobs`**, **`getEventReminders`** (Phase 5),
   `deleteCalendarFixtures`), and the calendar block inside
   `a11y.spec.ts`'s signed-in test (it was added **in place** rather than as a new `test()`,
   so remove the block, not the test).
7b. **Unhook the job** (Phase 4): remove `calendarInvitation` from `JOBS` and
   `calendarInvitationPayload` in `packages/jobs/src/queues.ts`, its `boss.work` line and
   import in `worker.ts`, and `handlers/calendar-invitation.ts` + its test. Then remove the
   three calendar helpers and templates from `@repo/email` (`sendCalendarInvitationEmail`,
   `…EventUpdatedEmail`, `…EventCancelledEmail`, their `templates/calendar-*.tsx`, their
   fixtures in `templates.test.tsx` and `send.test.tsx`, and the export lines in
   `src/index.ts`) — but **keep `send()`'s `attachments` parameter and `EmailAttachment`**,
   which are generic. Finally drop `@repo/jobs` from `apps/web`'s dependencies if nothing
   else there enqueues.
   ⚠️ **This job is *enqueued*, not scheduled**, so unlike the Phase-5 reminder sweeper it
   leaves **no `pgboss.schedule` row** and needs no `boss.unschedule` call. Undrained jobs
   in `pgboss.job` simply expire. Nothing to clean up beyond the code.
7c. **Unschedule the reminder sweeper BEFORE removing its code** (Phase 5) — the step that
   has no equivalent above, and the one that silently keeps working if you skip it.
   `boss.schedule` persists into `pgboss.schedule` **keyed by queue name**, so the row
   outlives the code that created it: delete the handler alone and pg-boss keeps enqueueing
   `calendar-reminder-sweep` jobs into a queue nobody watches, forever, on every deployment
   that ever ran the worker. Run this against each such environment first:

   ```js
   // node, with DATABASE_URL set — or add it temporarily to worker.ts and boot once.
   await boss.unschedule("calendar-reminder-sweep");
   ```

   Confirm with `SELECT * FROM pgboss.schedule;` (it should list only
   `cleanup-expired-verifications`). Then remove `calendarReminderSweep`,
   `calendarReminderEmail` and `calendarReminderNotify` from `JOBS` and their payload
   schemas in `packages/jobs/src/queues.ts`; the three `boss.work` lines, the
   `boss.schedule` call, `REMINDER_SWEEP_CRON` and the imports in `worker.ts`;
   `handlers/calendar-reminder-{sweep,email,notify}.ts` and their tests;
   `src/reminders/` entirely; `__tests__/integration/calendar-reminders.test.ts`; and the
   `src/reminders/sweep.ts` entry from `coverage.include` in `vitest.config.ts`. Drop
   `sendCalendarReminderEmail` and `templates/calendar-reminder.tsx` from `@repo/email`
   with their fixtures — but **keep `formatEventWhen`** (`src/format.ts`), which the
   Phase-4 invitation path also uses, unless you are removing that too. **The 90-day
   delivery retention needs no step**: it lives inside the sweeper precisely so it cannot
   be forgotten here.
   Finally drop `@repo/calendar` and `@repo/validators` from `packages/jobs/package.json`
   if nothing else there uses them, and revert the four reminder imperatives in
   `packages/jobs/AGENTS.md`.
7d. **Delete the reminder app slice** (Phase 5): `src/components/calendar/reminder-field.tsx`,
   `src/lib/calendar-reminders.ts` + its test, `applyReminders` and the `diffReminders`
   import in `server/actions/calendar.ts` (plus the `actorUserId` parameter threaded through
   `updateWholeEvent`/`splitSeries` for it), the `reminders` select in
   `trpc/routers/calendar.ts`'s `byId`, the `reminders` field on `EventComposerDefaults` and
   its `FormField`, the seed in `calendar-workspace.tsx`, and `Calendar.reminders` +
   `Calendar.composer.remindersLabel`/`remindersHelp` from **both** locales. Remove
   `src/lib/calendar-reminders.ts` from `coverage.include` in `apps/web/vitest.config.ts`.
8. **Drop the validators subpath**: delete `packages/validators/src/calendar.ts` and its
   test, and remove `"./calendar"` from that package's `exports` map. Then **edit** —
   do not delete — `src/lib/union-parity.test.ts`: it guards `NOTIFICATION_TYPES` too,
   which is not a calendar union. Remove its calendar `describe` and drop the calendar
   pairs from the table; its per-group length meta-guard moves with them.
9. **Drop the schema**: delete `packages/db/src/schema/calendars.ts`,
   `calendar-events.ts`, **`calendar-recurrence-dates.ts`**, `calendar-attendees.ts` and
   `calendar-reminders.ts`, then remove **every `./calendar*` export** from
   `schema/index.ts` (grep it — miss one and you ship a module exporting a dropped
   table). Delete all four calendar integration tests under
   `packages/db/__tests__/integration/` — `calendar-events`, `calendar-attendees`,
   `calendar-recurrence` and `calendar-reminders`. Revert `NOTIFICATION_TYPES` to `["test", "system"]` in
   **both** `packages/db/src/schema/notifications.ts` and
   `packages/validators/src/index.ts` (one commit — extending or trimming one alone makes
   the bus's `safeParse` drop messages with no log, no error and no Sentry event), then
   author the compensating migration below.
   **Keep `notifications.link` and `notifications.title`.** They are generically useful,
   the two-slot `body` contract beside the union is not calendar-specific, and dropping
   them would take the realtime example's link rendering with them.
10. **Decide about `@repo/calendar`**: the package is pure, dependency-free and useful on
   its own (zone-correct civil-time maths). Keeping it costs nothing at runtime. To
   remove it too: delete `packages/calendar/`, drop it from `apps/web`'s dependencies
   and from `packages/db`'s **devDependencies** (the integration suite imports it), and
   delete `docs/context/calendar/`.
11. **Decide about `user_preferences`** (migration `0019`, Phase 0): it holds
    `time_zone`, `week_start` and `time_format`, and the `/account` preferences card and
    every timestamp in the app use it. It is **not** calendar-specific — leave it.
12. **Docs**: remove the calendar row from `AGENTS.md`'s context table, the
    `context/calendar/` entry in **`docs/README.md`**'s reference section, the calendar
    entries in `DECISIONS.md`, the Calendar Phase 6 row and Watch line in
    **`BACKLOG.md`**, and the calendar lines in `FEATURES.md`, `PROJECT_STATUS.md` and
    `packages/db/AGENTS.md` (**every calendar imperative in that leaf** — attendees,
    invitations *and* reminders; the list grew with each phase, so grep it).

Then run the full gate. `pnpm knip` is the check that catches a symbol you unhooked but
forgot to delete, and `pnpm docs:sanity` catches a link left pointing at a deleted doc.

## The compensating migration

Author it the normal way — edit the schema first, then `pnpm --filter @repo/db db:generate`,
then **review the SQL**. Drizzle should produce something equivalent to this; if it
produces less, the difference is what you forgot to delete from the schema.

Note the view must be dropped **first** and is not recreated: `0024` added
`calendar_events.reask_at` and had to drop-and-recreate the view to widen it, which is the
shape drizzle produces whenever a column joins a table a view selects from.

```sql
DROP VIEW IF EXISTS "public"."calendar_event_masters";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_reminder_deliveries";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_event_reminders";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_event_attendees";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_recurrence_dates";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendars";
--> statement-breakpoint
DELETE FROM "notifications" WHERE "type" LIKE 'calendar_%';
```

`calendar_reminder_deliveries` goes **before** `calendar_event_reminders` (it references
it), and both before `calendar_events`. The `LIKE 'calendar_%'` delete already covers
`calendar_reminder` rows along with every other `calendar_*` type.

**The last statement is the one drizzle will not generate for you**, and the reason this
list is no longer "four DROPs and every constraint goes with a table". `notifications`
**survives** removal, so its rows survive too — leaving a feed full of *"someone invited
you to Standup"* messages pointing at events that no longer exist, whose `type` no longer
parses, and which `notification-bus.ts` therefore drops **silently, with no log and no
Sentry event**. Author it by hand as part of the same migration.

The `DROP TABLE`s do still take everything attached to them: every index, CHECK,
unique constraint and foreign key added by `0020`, `0021`, `0023`, `0024` and `0025`
hangs off one of
those tables, and so does every foreign key into them
(`calendar_events.calendar_id`, the composite `recurrence_parent_id, calendar_id`
self-reference from `0021`, `calendar_recurrence_dates.event_id`, and
`calendar_event_attendees.event_id`). **Order matters:**
`calendar_event_attendees` and `calendar_recurrence_dates` both reference
`calendar_events`, so they go first. The view is dropped before all of them because
Postgres refuses to drop a table a view depends on without `CASCADE`, and an explicit
`DROP VIEW` says what is happening instead of letting `CASCADE` silently take whatever
else might have accumulated.

`calendar_event_attendees.user_id` points at `user`, which also survives — but that FK is
`ON DELETE SET NULL` and goes with the table it lives on, so there is nothing to clean up
on the `user` side.

**This is destructive and there is no soft version of it.** `calendar_events` uses
`deleted_at` for user-facing deletion; this drops the rows for real, including
soft-deleted ones a Phase-6 feed subscriber may still be reconciling against, and every
guest list with them. Take a dump first if the environment has ever had real data in it.
