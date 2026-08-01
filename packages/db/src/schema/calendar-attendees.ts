import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { calendarEvents } from "./calendar-events";

/**
 * Who is invited to an event, and what they said.
 *
 * **The email is the identity; `user_id` is a nullable resolution of it.** An invitation
 * names an address, and whether that address happens to have an account here is a
 * separate, changeable fact. Keying on `user_id` instead would need `nullsNotDistinct()`
 * to stop two rows describing one person, and would still have no answer for the person
 * who has not signed up yet. Keying on `email` — NOT NULL, always — makes Phase 4's
 * external attendee a row that already exists, and makes a deleted user degrade into an
 * external attendee (`ON DELETE SET NULL`, the `post_revisions.author_id` precedent)
 * rather than vanish from a guest list the organizer still needs.
 *
 * **One attendee list per series: overrides inherit, they never copy.** Every attendee
 * read and write resolves `recurrence_parent_id ?? id` first, so an attendee row on an
 * override means exactly one thing — someone deliberately set a per-occurrence response.
 * Copying the master's list onto an override at materialisation would destroy that
 * distinction, and the copies would diverge the moment anyone answered, because RSVP is
 * series-level. `splitSeries` is the one writer that copies, because the master it
 * creates is a real event with its own id and its own URL. See
 * docs/context/calendar/attendees.md.
 *
 * The roles here are the ones a Phase-3 surface can actually produce. `chair` and
 * `resource` are in the ICS vocabulary and are deliberately absent, for the reason
 * `visibility: "public"` is absent from `calendar-events.ts`: a union member nothing can
 * emit or render is a lie in the schema. A `text` union extends in one line with no
 * `ALTER TYPE` when Phase 6's ICS import needs them.
 */

export const ATTENDEE_ROLES = ["organizer", "required", "optional"] as const;
export type AttendeeRole = (typeof ATTENDEE_ROLES)[number];

/**
 * All four ship, unlike the roles above, and every one is produced by something on day
 * one: `needs-action` is the column default an invitation starts at, and the other three
 * are what the RSVP control submits. That split is real — `ATTENDEE_RESPONSES` in
 * `@repo/validators/calendar` is the submittable subset, and `needs-action` is
 * deliberately not in it.
 */
export const ATTENDEE_STATUSES = ["needs-action", "accepted", "declined", "tentative"] as const;
export type AttendeeStatus = (typeof ATTENDEE_STATUSES)[number];

export const calendarEventAttendees = pgTable(
  "calendar_event_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Cascade, not `set null`: an attendee of a deleted event is not a thing. */
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),

    /**
     * Resolved from `email` at write time when an account matches, left NULL when none
     * does, and nulled again if that account is deleted. Never the identity — an
     * invitation addressed to someone who signs up later is claimed by verified email,
     * not by this column.
     */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),

    email: text("email").notNull(),

    role: text("role").$type<AttendeeRole>().notNull().default("required"),
    status: text("status").$type<AttendeeStatus>().notNull().default("needs-action"),

    /** The invitee's note on their response. NULL until they leave one. */
    comment: text("comment"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The real key, and the target the guest-list diff is written against: re-submitting
    // an unchanged list must leave an existing row strictly alone rather than re-insert
    // it at the default status and silently reset someone's RSVP. `event_id` leads, so
    // this also serves the foreign key — the same reason calendar_recurrence_dates
    // carries no second index despite AGENTS.md's "index every FK you add".
    unique("calendar_event_attendees_event_id_email_key").on(t.eventId, t.email),
    // **Partial, and that is measured rather than assumed.** A plain btree STORES its
    // NULL keys, which is Phase 2's most expensive lesson (`0021`, where "only overrides
    // are non-NULL so the index is the same size" was simply false). Measured here on
    // postgres 18 over 10,000 rows: 248 kB plain vs 216 kB partial at half external, and
    // 120 kB vs 56 kB at 90% external — the population Phase 4 creates, since an external
    // attendee is exactly a NULL `user_id`. Nothing is given up for it: both variants
    // plan `WHERE user_id = $1` as the same single-search Index Scan, and the partial one
    // still serves the FK's `ON DELETE SET NULL` scan, whose predicate is never NULL. A
    // "list the external guests" read is scoped by event and served by the unique above.
    index("calendar_event_attendees_user_id_idx").on(t.userId).where(sql`${t.userId} IS NOT NULL`),
    // The claim path: an invitation addressed to someone who signs up an hour later is
    // found by their verified address, which is a lookup by email and nothing else.
    index("calendar_event_attendees_email_idx").on(t.email),
    // Enforced twice, like `notifications.link`. The Zod `.toLowerCase()` covers one
    // write path; this covers the rest. Phase 4's ICS import, a seed helper or a support
    // script would each otherwise be free to insert `John@Example.com` beside
    // `john@example.com` — two guest rows, two invitations and two RSVP states for one
    // person, which the unique above cannot see because to Postgres they are different
    // strings.
    check("calendar_event_attendees_email_lower", sql`${t.email} = lower(${t.email})`),
    // Bidirectional on purpose. The one-directional spelling permits `accepted` with a
    // NULL `responded_at`, which is exactly what a careless `splitSeries` copy produces.
    // Written with `IS NULL` rather than `num_nonnulls(…) = 0`: the `calendar_events`
    // precedent for `num_nonnulls` is genuinely multi-column, and one column does not
    // need it.
    check(
      "calendar_event_attendees_responded_pair",
      sql`(${t.respondedAt} IS NULL) = (${t.status} = 'needs-action')`,
    ),
  ],
);

export type CalendarEventAttendee = typeof calendarEventAttendees.$inferSelect;
export type NewCalendarEventAttendee = typeof calendarEventAttendees.$inferInsert;
