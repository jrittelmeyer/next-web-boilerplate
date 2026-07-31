# Calendar — remove it

The convention every integration doc under [services/](../services/) follows
([ARCHITECTURE.md](../ARCHITECTURE.md)), applied to the calendar. Use this when a
generated project doesn't want a calendar at all.

The calendar has **no third-party dependency, no env var and no CSP entry** — it is
`@repo/calendar` (zero-dependency pure logic), two tables and a slice of `apps/web`.
That makes it easier to remove than any service integration, with exactly one
complication, below.

## The complication: you cannot delete a migration

`packages/db/AGENTS.md` is unambiguous — migrations are **forward-only**. Deleting
`0020_nostalgic_hitman.sql` would desynchronise `drizzle/migrations/meta/_journal.json`
from every database that has already applied it, and the next `db:migrate` on a deployed
environment would fail or, worse, half-apply. So removal means **authoring a
compensating migration**. Its DDL is at the bottom of this page.

If you are removing the calendar from a **freshly generated project that has never run
`db:migrate` against a real database**, you may instead delete `0020` outright along
with its snapshot and journal entry — but only then, and only before the first deploy.

## Steps

1. **Delete the app slice** (under `apps/web/src/`):
   - `app/[locale]/(dashboard)/calendar/` (both routes)
   - `components/calendar/`
   - `lib/calendar-acl.ts`, `lib/calendar/`
   - `server/actions/calendar.ts`, `server/trpc/routers/calendar.ts`
   - the `*.test.ts` siblings of all of the above
2. **Unhook the router**: remove the `calendar:` line and its import from
   `server/trpc/root.ts`.
3. **Unhook the nav and the gate**: remove the `/calendar` `<Link>` from
   `app/[locale]/(dashboard)/layout.tsx` and `"/calendar"` from `PROTECTED_PREFIXES` in
   `src/proxy.ts`.
4. **Drop the i18n namespace**: delete `Calendar` from `messages/en.json` and
   `messages/es.json`, plus `Metadata.calendar`, `Metadata.calendarEvent` and
   `Dashboard.nav.calendar`. `src/lib/i18n-parity.test.ts` fails if you do one locale
   and not the other, which is the point of it.
5. **Trim coverage**: remove `src/server/actions/calendar.ts`, `src/lib/calendar-acl.ts`
   and `src/lib/calendar/grid.ts` from `coverage.include` in `apps/web/vitest.config.ts`
   — it is an explicit file list, and a stale entry there fails the run.
6. **Delete the E2E**: `e2e/calendar.spec.ts`, the calendar helpers at the bottom of
   `e2e/support/db.ts` (`setUserTimeZone`, `seedCalendar`, `seedEvents`,
   `deleteCalendarFixtures`), and the calendar block inside `a11y.spec.ts`'s signed-in
   test (it was added **in place** rather than as a new `test()`, so remove the block,
   not the test).
7. **Drop the validators subpath**: delete `packages/validators/src/calendar.ts` and its
   test, and remove `"./calendar"` from that package's `exports` map.
8. **Drop the schema**: delete `packages/db/src/schema/calendars.ts` and
   `calendar-events.ts`, remove both lines from `schema/index.ts`, delete
   `packages/db/__tests__/integration/calendar-events.test.ts`, then author the
   compensating migration below.
9. **Decide about `@repo/calendar`**: the package is pure, dependency-free and useful on
   its own (zone-correct civil-time maths). Keeping it costs nothing at runtime. To
   remove it too: delete `packages/calendar/`, drop it from `apps/web`'s dependencies
   and from `packages/db`'s **devDependencies** (the integration suite imports it), and
   delete `docs/context/calendar/`.
10. **Decide about `user_preferences`** (migration `0019`, Phase 0): it holds
    `time_zone`, `week_start` and `time_format`, and the `/account` preferences card and
    every timestamp in the app use it. It is **not** calendar-specific — leave it.
11. **Docs**: remove the calendar row from `AGENTS.md`'s context table, the calendar
    entries in `DECISIONS.md`, and the calendar lines in `FEATURES.md`,
    `PROJECT_STATUS.md` and `packages/db/AGENTS.md`.

Then run the full gate. `pnpm knip` is the check that catches a symbol you unhooked but
forgot to delete, and `pnpm docs:sanity` catches a link left pointing at a deleted doc.

## The compensating migration

Author it the normal way — edit the schema first, then `pnpm --filter @repo/db db:generate`,
then **review the SQL**. Drizzle should produce something equivalent to this; if it
produces less, the difference is what you forgot to delete from the schema.

```sql
DROP VIEW IF EXISTS "public"."calendar_event_masters";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_recurrence_dates";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "calendars";
```

Four statements is all it takes: every index, CHECK, unique constraint and foreign key in
`0020` and `0021` is attached to one of those three tables, and every foreign key into
them (`calendar_events.calendar_id`, the composite `recurrence_parent_id, calendar_id`
self-reference added by `0021`, and `calendar_recurrence_dates.event_id`) goes with the
table. `calendar_recurrence_dates` is dropped before `calendar_events` because it
references it. The view is dropped first because Postgres refuses to drop a table a view
depends on without `CASCADE`, and an explicit `DROP VIEW` says what is happening instead
of letting `CASCADE` silently take whatever else might have accumulated.

**This is destructive and there is no soft version of it.** `calendar_events` uses
`deleted_at` for user-facing deletion; this drops the rows for real, including
soft-deleted ones a Phase-6 feed subscriber may still be reconciling against. Take a dump
first if the environment has ever had real data in it.
