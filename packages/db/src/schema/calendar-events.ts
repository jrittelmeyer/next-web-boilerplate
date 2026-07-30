import { and, isNull, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  pgView,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { calendars } from "./calendars";

/**
 * An event. Civil time is the source of truth; the instants are a derived cache.
 *
 * `start_wall` + `start_tzid` is what the user meant — "09:30, New York". `start_at`
 * exists only so a window query can use a btree, and it is written **exclusively**
 * by `deriveEventInstants` in `@repo/calendar`. Storing an instant as the source of
 * truth is what makes a recurring 09:00 meeting drift an hour when the clocks
 * change; re-resolving the offset per occurrence from civil time is what prevents it.
 *
 * `mode: "string"` on the wall columns is deliberate and is the positive convention
 * here, not an exception to a rule (there is no "no `mode` on timestamps" rule; see
 * rate-limit.ts). It makes the TypeScript type `"2027-03-08 09:30:00"` rather than
 * `Date`, so a civil reading is not assignable anywhere an instant is expected and
 * the two cannot be confused at a call site.
 *
 * See docs/context/calendar/model.md for the full model.
 */

export const EVENT_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/**
 * No `"public"` member, deliberately. `apps/web/src/proxy.ts` matches
 * `PROTECTED_PREFIXES` with `startsWith`, so every URL under `/calendar` redirects a
 * signed-out visitor to `/login` — a visibility value no URL can serve would be a
 * lie in the schema. Add it together with a public event route, or not at all.
 */
export const EVENT_VISIBILITIES = ["default", "private"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** Busy vs free, in the RFC 5545 sense. Drives Phase 7's free/busy projection. */
export const EVENT_TRANSPARENCIES = ["opaque", "transparent"] as const;
export type EventTransparency = (typeof EVENT_TRANSPARENCIES)[number];

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),

    /**
     * RFC 5545 UID, from day one rather than backfilled. Once a feed has
     * subscribers, adding UIDs later makes every existing event look
     * deleted-and-recreated in every subscriber's client.
     */
    uid: text("uid").notNull(),
    /** Bumped only on a *significant* change (Phase 4) — never on a description edit. */
    sequence: integer("sequence").notNull().default(0),

    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    url: text("url"),
    /** NULL inherits the calendar's colour. */
    color: text("color"),

    status: text("status").$type<EventStatus>().notNull().default("confirmed"),
    visibility: text("visibility").$type<EventVisibility>().notNull().default("default"),
    transparency: text("transparency").$type<EventTransparency>().notNull().default("opaque"),
    allDay: boolean("all_day").notNull().default(false),

    // --- Civil source of truth -------------------------------------------------
    startWall: timestamp("start_wall", { mode: "string", precision: 0 }).notNull(),
    startTzid: text("start_tzid").notNull(),
    endWall: timestamp("end_wall", { mode: "string", precision: 0 }).notNull(),
    endTzid: text("end_tzid").notNull(),

    /**
     * The UTC offset `deriveEventInstants` actually applied, in **minutes**
     * (`Pacific/Chatham` is +13:45 and `Australia/Lord_Howe` shifts by 30, so hours
     * would be wrong). NOT NULL with **no default**, deliberately: that is what
     * makes a writer which bypasses the application fail loudly instead of writing
     * a plausible-looking instant nobody notices.
     *
     * It is stored rather than re-derived because it is what lets the CHECK below be
     * pure arithmetic. Verified against PG 18 before this migration was written:
     * Postgres resolves a fall-back overlap to the *later* instant while we resolve
     * to the earlier, so a constraint that re-derived from `start_tzid` could not
     * distinguish a correct row from a wrong-branch one; its tzdata is a separate
     * copy from Node's ICU, so a rule change landing in one and not the other would
     * make existing rows fail on every UPDATE — including the UPDATE that
     * soft-deletes them; and the two disagree by seconds on pre-1900 local mean
     * time, which `offsetMinutesAt` rounds to whole minutes by design.
     */
    startOffsetMinutes: smallint("start_offset_minutes").notNull(),
    endOffsetMinutes: smallint("end_offset_minutes").notNull(),

    // --- Derived cache ---------------------------------------------------------
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),

    // --- Recurrence: declared, indexed and constrained in Phase 1; INERT ---------
    // Nothing writes these until Phase 2. They land now so the two partial indexes
    // and the masters view are final, and Phase 2 adds no index migration to a table
    // that by then has rows.
    /**
     * Phase 2. A per-occurrence override points at its series master. The self-FK
     * lands now, inert, so deleting a series takes its overrides with it from the
     * first row Phase 2 writes — a cascade added later would leave the rows written
     * in between orphaned.
     */
    recurrenceParentId: uuid("recurrence_parent_id").references(
      (): AnyPgColumn => calendarEvents.id,
      { onDelete: "cascade" },
    ),
    /** Phase 2. The occurrence's ORIGINAL civil start — never the moved-to time. */
    recurrenceId: timestamp("recurrence_id", { mode: "string", precision: 0 }),
    /** Phase 2. Opaque RFC 5545 RRULE; the grammar's owner is @repo/validators. */
    rrule: text("rrule"),
    /** Phase 2. The one denormalised fact: NULL = unbounded series. */
    seriesEndAt: timestamp("series_end_at", { withTimezone: true }),

    /** Soft delete, so Phase 6 feed subscribers can learn a deletion happened. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The derived-instant invariant, stated as arithmetic so it consults no timezone
    // database. Equivalent to `start_at = start_wall - start_offset_minutes`, read
    // as UTC. Probed against PG 18 across a 16-accept / 14-reject corpus before this
    // file was written: it accepts every DST overlap size (30/60/120 min), every gap
    // size (1h/2h/24h), +13:45, +14, negative-DST Dublin and an 1885 LMT reading,
    // and rejects a naive-UTC instant, a stale one, an off-by-one-second one, and —
    // the case only the stored offset can catch — a fall-back overlap resolved to
    // the wrong branch.
    check(
      "calendar_events_start_at_derived",
      sql`${t.startAt} = (${t.startWall} - make_interval(mins => ${t.startOffsetMinutes})) AT TIME ZONE 'UTC'`,
    ),
    check(
      "calendar_events_end_at_derived",
      sql`${t.endAt} = (${t.endWall} - make_interval(mins => ${t.endOffsetMinutes})) AT TIME ZONE 'UTC'`,
    ),
    check("calendar_events_end_not_before_start", sql`${t.endAt} >= ${t.startAt}`),
    // Subtraction, NOT `start_at + interval '366 days'`. `timestamptz_mi` is
    // IMMUTABLE; `timestamptz_pl_interval` is STABLE because day arithmetic on a
    // timestamptz depends on the session TimeZone. Postgres builds either — it does
    // not enforce volatility in a CHECK — so this is a correctness choice, not a
    // legality one.
    //
    // Load-bearing rather than hygiene: it licenses the window query's redundant
    // `start_at >= $t1 - interval '366 days'` lower bound, which keeps that query a
    // bounded range scan. Because subtraction measures ELAPSED time, a 366-day span
    // crossing DST is 366d ± 1h, so the query must use 367 days of slack.
    check("calendar_events_span_bounded", sql`${t.endAt} - ${t.startAt} <= interval '366 days'`),
    // Both or neither: an override is identified by (parent, original civil start).
    check(
      "calendar_events_recurrence_pair",
      sql`num_nonnulls(${t.recurrenceParentId}, ${t.recurrenceId}) <> 1`,
    ),
    check(
      "calendar_events_override_not_recurring",
      sql`${t.recurrenceParentId} IS NULL OR ${t.rrule} IS NULL`,
    ),
    // The two-arg date_trunc(text, timestamp) is IMMUTABLE; the timestamptz form is
    // only STABLE and would be the wrong tool here.
    check(
      "calendar_events_all_day_midnight",
      sql`${t.allDay} IS FALSE OR (${t.startWall} = date_trunc('day', ${t.startWall}) AND ${t.endWall} = date_trunc('day', ${t.endWall}))`,
    ),
    // The Phase-6 ICS-import upsert target. NULLS NOT DISTINCT is load-bearing:
    // without it two masters sharing a UID (both with recurrence_id NULL) would both
    // insert and the feed would emit a duplicate series. Verified: drizzle 0.45.2 puts
    // `nullsNotDistinct()` on `unique()`, NOT on `uniqueIndex()`.
    //
    // A table constraint cannot be partial, so this spans soft-deleted rows: a
    // delete-then-reimport of the same .ics conflicts rather than inserting, and the
    // Phase-6 upsert must therefore clear `deleted_at` — i.e. resurrect the event —
    // and say so in its import report. That semantic is locked here; see model.md.
    unique("calendar_events_calendar_id_uid_recurrence_id_key")
      .on(t.calendarId, t.uid, t.recurrenceId)
      .nullsNotDistinct(),

    // The hot month-view path. Overrides fall in here naturally (an override has no
    // rrule of its own), which is exactly why the range query must NOT read through
    // calendarEventMasters — see the view's comment below.
    index("calendar_events_concrete_idx")
      .on(t.calendarId, t.startAt, t.endAt)
      .where(sql`${t.rrule} IS NULL AND ${t.deletedAt} IS NULL`),
    // Recurring masters, whose `series_end_at IS NULL OR > $t` predicate is not
    // btree-rangeable, so they get their own much smaller index to scan.
    index("calendar_events_recurring_idx")
      .on(t.calendarId, t.seriesEndAt)
      .where(sql`${t.rrule} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    // Both indexes above are partial and exclude soft-deleted rows, so neither can
    // serve the calendar-delete cascade. Postgres does not auto-index FK columns.
    index("calendar_events_calendar_id_idx").on(t.calendarId),
    index("calendar_events_recurrence_parent_id_idx").on(t.recurrenceParentId),
  ],
);

/**
 * The read surface for **list, count and detail** reads: series masters and
 * standalone events, excluding per-occurrence overrides and soft-deleted rows.
 *
 * Without it, a query that forgets `recurrence_parent_id IS NULL` is both fast and
 * silently wrong once Phase 2 writes overrides — the optimisation and the footgun
 * would be the same object.
 *
 * **The window/range query is the documented exception and reads the raw table.**
 * Measured against PG 18 at 5k rows: this view's predicate does not imply
 * `rrule IS NULL`, so Postgres cannot prove `calendar_events_concrete_idx`
 * applicable and a range query through the view degrades to a `Seq Scan` where the
 * raw table with the predicate spelled out gets a `Bitmap Index Scan`. And branch A
 * of that query must *include* overrides, which this view excludes — so from Phase 2
 * a month grid built on it would silently stop showing moved occurrences. The range
 * query therefore reads `calendarEvents` directly and must spell out
 * `rrule IS NULL AND deleted_at IS NULL`; an EXPLAIN assertion in the integration
 * suite pins that.
 *
 * Postgres makes this view auto-updatable and drizzle emits no `WITH CHECK OPTION`,
 * so it is technically a write path. Never write through it — every table constraint
 * still applies, but a row that fails the view's own predicate would silently vanish
 * from it.
 */
export const calendarEventMasters = pgView("calendar_event_masters").as((qb) =>
  qb
    .select()
    .from(calendarEvents)
    .where(and(isNull(calendarEvents.recurrenceParentId), isNull(calendarEvents.deletedAt))),
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
