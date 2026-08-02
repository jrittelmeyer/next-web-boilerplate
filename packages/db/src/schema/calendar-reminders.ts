import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { calendarEvents } from "./calendar-events";

/**
 * Reminders (Phase 5) — a per-user rule on an event, and the ledger of what has already
 * been delivered for it.
 *
 * The delivery mechanism is a five-minute pg-boss sweeper in `@repo/jobs` that expands against
 * **live** rows every tick, never a pre-enqueued job. Pre-enqueueing fails on every edit:
 * you cannot enqueue an unbounded series, and pg-boss has no cancel-by-correlation-key, so
 * a rescheduled, deleted, split or timezone-shifted event would leave a pending job firing
 * at the wrong time. Sweeping means **there is nothing to cancel and therefore no
 * cancellation bug**. See docs/context/calendar/reminders.md.
 *
 * Reminders hang off the **series master**, exactly as attendees do: resolve
 * `recurrence_parent_id ?? id` before any reminder read. An override inherits its master's
 * reminders rather than carrying copies, which is what keeps "I set one reminder on this
 * weekly meeting" true after someone moves a single occurrence.
 */

/**
 * `in-app` writes a `notifications` row (and NOTIFYs it, so an open SSE stream gets it with
 * no reload); `email` sends through `@repo/email`. Both are produced by the Phase-5 editor,
 * which is the bar `calendar-attendees.ts` sets for a union member: a value nothing can emit
 * is a lie in the schema.
 */
export const REMINDER_CHANNELS = ["email", "in-app"] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

/**
 * `end` is in the vocabulary and is **not yet reachable** — the CHECK below rejects it until
 * Phase 6. It is spelled out now rather than added later because widening a `text` union is a
 * one-line edit while adding a column is a migration.
 *
 * The reason it is gated is a real defect, not caution: `expandSeries` in `@repo/calendar`
 * windows on each occurrence's **start** instant, so an end-anchored reminder on a recurring
 * series would ask for a window the occurrence's start falls outside of and would **silently
 * never fire**. Supporting it means widening the expansion window by the master's nominal
 * span and re-filtering on the end instant. Phase 6 does that with its own tests.
 */
export const REMINDER_ANCHORS = ["start", "end"] as const;
export type ReminderAnchor = (typeof REMINDER_ANCHORS)[number];

/** ±366 days in minutes — the same bound `calendar_events_span_bounded` puts on an event. */
const MAX_OFFSET_MINUTES = 366 * 24 * 60;

export const calendarEventReminders = pgTable(
  "calendar_event_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Cascade: a reminder on a deleted event is not a thing (the attendee precedent). */
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),

    /**
     * Whose reminder. **Cascade, not `set null`** — and that is the deliberate departure
     * from `calendar_event_attendees.user_id`, which nulls so a deleted user degrades into
     * an external guest the organizer can still see. A reminder has no such second life:
     * with no user there is no inbox and no notification feed to deliver to, so an orphan
     * row would be swept forever and delivered nowhere.
     *
     * Phase 5 only ever writes the owner of the calendar the event lives on. **That is a
     * write-path boundary, not a schema one** — this column will accept any user, and
     * Phase 6 widens it to shared-calendar viewers deliberately. Said out loud because the
     * schema otherwise reads as if guest reminders were already sanctioned.
     */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    channel: text("channel").$type<ReminderChannel>().notNull(),
    anchor: text("anchor").$type<ReminderAnchor>().notNull().default("start"),

    /**
     * Signed: **negative is before**. One column replaces minutes/hours/days *and* answers
     * all-day semantics, because an all-day event's start instant is local midnight — so
     * "the day before at 09:00" is just `-900`. It also maps 1:1 onto an ICS
     * `TRIGGER:-PT15M`, which is what Phase 6's feed will need.
     *
     * ⚠️ The sweeper applies this with `make_interval(mins => …)` on a `timestamptz`, which
     * is **exact elapsed time** — only day/month intervals do calendar arithmetic. So a
     * day-before reminder spanning a DST transition fires an hour early or late in local
     * terms. Accepted and documented (reminders.md, DECISIONS.md) rather than discovered:
     * `packages/calendar/src/expand.ts` names instants-based arithmetic as this repo's
     * canonical silent bug, so it does not get to be silent here.
     */
    offsetMinutes: integer("offset_minutes").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The diff target: re-submitting an unchanged reminder list must leave existing rows
    // strictly alone rather than delete-and-reinsert them, which would orphan their
    // delivery ledger and re-send every reminder the user already got. Same role the
    // (event_id, email) unique plays for attendees.
    //
    // No `nullsNotDistinct()` here, unlike both neighbouring calendar tables: every column
    // in this key is NOT NULL, so there are no NULLs to be distinct about. Stated because
    // the asymmetry reads as an omission.
    unique("calendar_event_reminders_rule_key").on(
      t.eventId,
      t.userId,
      t.channel,
      t.anchor,
      t.offsetMinutes,
    ),
    // Bounds the sweeper's expansion window. An unbounded offset means an unbounded window,
    // and the recurring branch would expand a series across centuries to find one match.
    check(
      "calendar_event_reminders_offset_bounded",
      sql`${t.offsetMinutes} BETWEEN ${sql.raw(String(-MAX_OFFSET_MINUTES))} AND ${sql.raw(String(MAX_OFFSET_MINUTES))}`,
    ),
    // The Phase-5 gate on the union above. Dropped by Phase 6 in a compensating migration
    // once end-anchored expansion exists — a CHECK is the right tool precisely because
    // removing it is additive and needs no data rewrite.
    check("calendar_event_reminders_anchor_supported", sql`${t.anchor} = 'start'`),
    // Plain, NOT partial — and that is the measured distinction, not an oversight.
    // `calendar_event_attendees.user_id` is partial because it is NULLable and ~90% NULL in
    // the population Phase 4 creates; this column is NOT NULL, so a partial predicate would
    // exclude nothing and cost an extra planner proof. Serves the user-delete cascade scan
    // (Postgres does not auto-index FK columns).
    index("calendar_event_reminders_user_id_idx").on(t.userId),
    // `event_id` needs no index of its own: it LEADS the unique above, so that constraint's
    // index already serves both the sweeper's per-event read and the event-delete cascade.
    // Same reason `calendar_recurrence_dates` carries no second index.
  ],
);

/**
 * The dedupe ledger — one row per reminder actually delivered, and **the entire concurrency
 * mechanism**. The sweeper's `INSERT … ON CONFLICT DO NOTHING RETURNING id` against the
 * unique below arbitrates every race there is: two workers, two overlapping sweeps, a
 * missed-tick backlog running into a live tick. A row returned means you own the delivery;
 * no row means someone else already does. Nothing else coordinates, and nothing needs to.
 */
export const calendarReminderDeliveries = pgTable(
  "calendar_reminder_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => calendarEventReminders.id, { onDelete: "cascade" }),

    /**
     * The **instant** of the occurrence this delivery covers — deliberately not its
     * `recurrence_id`, and the alternative is not merely lossy, it is structurally broken.
     *
     * `calendar_events.recurrence_id` is NULL for every non-override row (its
     * `recurrence_pair` CHECK forces both-or-neither), so a unique over it would be
     * all-NULLs-distinct for every ordinary event: **every tick inside the grace window
     * would insert a fresh row and re-send.** Separately, a `recurrence_id` survives a
     * reschedule unchanged, so keying on it would also mean that moving a 10:00 meeting to
     * 14:00 after its 09:45 reminder fired sends nothing at the new time — the exact case a
     * reminder exists for. An instant moves when the occurrence moves.
     *
     * Accepted consequence: editing a reminder's OFFSET after delivery does not re-fire for
     * that same occurrence. Correct — you were already reminded about it.
     */
    occurrenceStartAt: timestamp("occurrence_start_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("calendar_reminder_deliveries_reminder_id_occurrence_key").on(
      t.reminderId,
      t.occurrenceStartAt,
    ),
    // Serves the sweeper's own 90-day retention DELETE. The retention lives INSIDE the
    // sweeper rather than in the nightly cleanup handler on purpose: a project that follows
    // remove-it.md and drops this table would otherwise leave that handler throwing
    // `relation does not exist` every night forever, taking Better Auth's token pruning down
    // with it. Housed in the sweeper, removal is automatic.
    index("calendar_reminder_deliveries_created_at_idx").on(t.createdAt),
    // `reminder_id` leads the unique above, which serves the reminder-delete cascade.
  ],
);

export type CalendarEventReminder = typeof calendarEventReminders.$inferSelect;
export type NewCalendarEventReminder = typeof calendarEventReminders.$inferInsert;
export type CalendarReminderDelivery = typeof calendarReminderDeliveries.$inferSelect;
export type NewCalendarReminderDelivery = typeof calendarReminderDeliveries.$inferInsert;
