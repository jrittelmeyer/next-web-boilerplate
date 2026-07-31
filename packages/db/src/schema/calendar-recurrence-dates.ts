import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { calendarEvents } from "./calendar-events";

/**
 * RFC 5545 `EXDATE` and `RDATE` — one row per modified date, never a jsonb array.
 *
 * The deciding argument is concurrency. "Skip this occurrence" as an array element
 * is read-modify-write, so two users skipping two different occurrences in the same
 * second silently resurrect one. As a row it is `INSERT … ON CONFLICT DO NOTHING` —
 * idempotent and race-free. `RDATE` has no cancellation equivalent, so the table has
 * to exist regardless.
 *
 * See docs/context/calendar/recurrence.md.
 */

export const RECURRENCE_DATE_KINDS = ["exdate", "rdate"] as const;
export type RecurrenceDateKind = (typeof RECURRENCE_DATE_KINDS)[number];

export const calendarRecurrenceDates = pgTable(
  "calendar_recurrence_dates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always a series master. An override has no modifiers of its own. */
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),

    /**
     * No CHECK, deliberately: `status`, `visibility` and `transparency` on
     * `calendar_events` carry none either, and inventing one here would be an
     * inconsistency rather than a safeguard.
     *
     * ⚠️ The obligation this moves onto the reader is real and is stated in
     * recurrence.md: **partition these rows by `kind` and treat an unrecognised
     * value as a logged error — never `WHERE kind = 'exdate'`.** A filter would
     * reproduce the shape that silently drops notifications today
     * (`apps/web/src/server/realtime/notification-bus.ts` fails closed with no log):
     * the user's skip would quietly do nothing, forever, while the unique below
     * happily accepted the row.
     */
    kind: text("kind").$type<RecurrenceDateKind>().notNull(),

    /**
     * The occurrence's ORIGINAL civil start — the same space as
     * `calendar_events.recurrence_id`, read in the master's `start_tzid`. An
     * `RDATE` carries no duration: the added occurrence takes the master's nominal
     * span, exactly as an expanded one does.
     */
    dateWall: timestamp("date_wall", { mode: "string", precision: 0 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The `ON CONFLICT DO NOTHING` target — what makes skipping an occurrence
    // idempotent and race-free. Its leading column is `event_id`, so it ALSO serves
    // the foreign key; that is why there is no second index here, despite
    // packages/db/AGENTS.md's "index every FK you add" (Postgres does not
    // auto-index a referencing column, but a unique constraint on a prefix of it
    // does the job).
    unique("calendar_recurrence_dates_event_id_kind_date_wall_key").on(
      t.eventId,
      t.kind,
      t.dateWall,
    ),
  ],
);

export type CalendarRecurrenceDate = typeof calendarRecurrenceDates.$inferSelect;
export type NewCalendarRecurrenceDate = typeof calendarRecurrenceDates.$inferInsert;
