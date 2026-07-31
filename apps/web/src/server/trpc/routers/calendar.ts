import { calendarEventMasters, calendarEvents, calendars } from "@repo/db/schema";
import { eventRangeSchema, MAX_RANGE_ROWS } from "@repo/validators/calendar";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, userRateLimitedProcedure } from "../trpc";

/**
 * Calendar reads. Writes are Server Actions (`server/actions/calendar.ts`).
 *
 * Both procedures are `userRateLimitedProcedure`: they are authenticated but
 * abusable (a window query over up to twenty calendars is not cheap), and the fair
 * unit is the account, not the source IP.
 */

/**
 * The window query's redundant lower bound uses **367** days, not 366.
 *
 * `calendar_events_span_bounded` is `end_at - start_at <= interval '366 days'`, and
 * subtraction on `timestamptz` measures ELAPSED time — so a 366-day span that crosses
 * a DST transition is 366 days ± 1 hour. A 366-day bound here would drop such an
 * event from the window it genuinely overlaps. The extra day is slack, not a fudge:
 * without the bound at all the query cannot use a range scan on `start_at`, and with
 * the wrong bound it is fast and wrong.
 */
const MAX_SPAN_SLACK_DAYS = 367;

export const calendarRouter = createTRPCRouter({
  /**
   * The caller's calendars in their active workspace, primary first.
   *
   * Owner-scoped by `user_id` today. Phase 6 widens this to shared and organization
   * calendars, at which point the scope moves behind the same `lib/calendar-acl`
   * authority the writes already use — the reason the ACL ships its full shape now.
   */
  list: userRateLimitedProcedure
    .input(z.object({ organizationId: z.string().nullish() }).default({}))
    .query(async ({ ctx, input }) => {
      const organizationId = input.organizationId ?? null;
      const rows = await ctx.db
        .select({
          id: calendars.id,
          name: calendars.name,
          description: calendars.description,
          color: calendars.color,
          timeZone: calendars.timeZone,
          isPrimary: calendars.isPrimary,
          organizationId: calendars.organizationId,
        })
        .from(calendars)
        .where(
          and(
            eq(calendars.userId, ctx.session.user.id),
            organizationId
              ? eq(calendars.organizationId, organizationId)
              : isNull(calendars.organizationId),
          ),
        )
        // (user_id, organization_id) is the leading pair of calendars_user_id_org_id_idx,
        // so the scope is an index range; the ordering is a small in-memory sort.
        // DESC on a NOT NULL boolean puts the primary calendar first.
        .orderBy(desc(calendars.isPrimary), asc(calendars.name));

      return rows;
    }),

  /**
   * Every event overlapping a window, for the month grid.
   *
   * **This is the documented exception to the masters-view rule** and reads
   * `calendar_events` directly, spelling out `rrule IS NULL AND deleted_at IS NULL`.
   * Two measured reasons (docs/context/calendar/model.md → The read surface is split):
   * `calendar_event_masters`'s predicate does not imply `rrule IS NULL`, so Postgres
   * cannot prove `calendar_events_concrete_idx` applicable and the plan degrades to a
   * `Seq Scan`; and the view excludes per-occurrence overrides, which this query must
   * *include* — from Phase 2 a grid built on the view would silently stop showing
   * moved occurrences. An `EXPLAIN` assertion in the integration suite pins the index
   * choice, because nothing else catches a regression here before Phase 2 makes it
   * wrong as well as slow.
   *
   * Access is enforced by scoping to calendars the caller owns rather than by asking
   * the ACL per calendar: one `IN` list against an indexed `user_id` beats N
   * round-trips, and a calendar id the caller cannot see simply contributes nothing.
   */
  range: userRateLimitedProcedure.input(eventRangeSchema).query(async ({ ctx, input }) => {
    const visible = await ctx.db
      .select({ id: calendars.id })
      .from(calendars)
      .where(
        and(eq(calendars.userId, ctx.session.user.id), inArray(calendars.id, input.calendarIds)),
      );
    const visibleIds = visible.map((row) => row.id);
    if (visibleIds.length === 0) return { items: [], truncated: false };

    const from = new Date(input.fromMs);
    const to = new Date(input.toMs);
    // Computed here rather than as `$1::timestamptz - interval '367 days'`: a plain
    // bound parameter is trivially index-usable and consults nothing.
    const earliestStart = new Date(input.fromMs - MAX_SPAN_SLACK_DAYS * 86_400_000);

    const rows = await ctx.db
      .select({
        id: calendarEvents.id,
        calendarId: calendarEvents.calendarId,
        title: calendarEvents.title,
        location: calendarEvents.location,
        color: calendarEvents.color,
        status: calendarEvents.status,
        visibility: calendarEvents.visibility,
        transparency: calendarEvents.transparency,
        allDay: calendarEvents.allDay,
        startWall: calendarEvents.startWall,
        startTzid: calendarEvents.startTzid,
        endWall: calendarEvents.endWall,
        endTzid: calendarEvents.endTzid,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
      })
      .from(calendarEvents)
      .where(
        and(
          inArray(calendarEvents.calendarId, visibleIds),
          // Spelled out, not inherited from a view — this pair is what makes
          // calendar_events_concrete_idx provable to the planner.
          isNull(calendarEvents.rrule),
          isNull(calendarEvents.deletedAt),
          // Overlap: the event starts before the window ends and ends after it
          // starts. The third clause is redundant with the second but bounds
          // `start_at` from below, which is what turns the index scan from
          // open-ended into a range.
          lte(calendarEvents.startAt, to),
          gte(calendarEvents.endAt, from),
          gte(calendarEvents.startAt, earliestStart),
        ),
      )
      .orderBy(asc(calendarEvents.startAt), asc(calendarEvents.id))
      .limit(MAX_RANGE_ROWS + 1);

    // One extra row is the probe: if it came back, the window holds more than the cap
    // and the UI must say so. A silently short month is the failure mode this exists
    // to make visible.
    const truncated = rows.length > MAX_RANGE_ROWS;
    return { items: truncated ? rows.slice(0, MAX_RANGE_ROWS) : rows, truncated };
  }),

  /**
   * One event, for the detail route.
   *
   * Reads through `calendar_event_masters` — the rule the range query is the
   * exception to. The view already excludes soft-deleted rows and per-occurrence
   * overrides, which is exactly right for a detail page: an override is not a thing
   * with its own URL, it is an edit to an occurrence of something that is.
   */
  byId: userRateLimitedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select()
      .from(calendarEventMasters)
      .innerJoin(calendars, eq(calendars.id, calendarEventMasters.calendarId))
      .where(and(eq(calendarEventMasters.id, input.id), eq(calendars.userId, ctx.session.user.id)))
      .limit(1);
    if (!row) return null;
    return { event: row.calendar_event_masters, calendar: row.calendars };
  }),
});
