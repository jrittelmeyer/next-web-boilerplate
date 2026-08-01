import { log } from "@logtail/next";
import {
  addCivilDays,
  expandSeries,
  formatLocalDateTime,
  instantToCivil,
  type LocalDateTime,
} from "@repo/calendar";
import {
  calendarEventAttendees,
  calendarEventMasters,
  calendarEvents,
  calendarRecurrenceDates,
  calendars,
  type EventStatus,
  type EventTransparency,
  type EventVisibility,
  user,
} from "@repo/db/schema";
import { eventRangeSchema, MAX_RANGE_ROWS, MAX_RANGE_SERIES } from "@repo/validators/calendar";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { partitionRecurrenceDates } from "@/lib/calendar/recurrence-dates";
import { canReadEvent, getEventAccess } from "@/lib/calendar-acl";
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

/**
 * One chip on the month grid, whether it is a row or not.
 *
 * **`id` is the series master's id for anything that belongs to a series** — including a
 * materialised override, whose own row id is deliberately never exposed. The grid renders
 * virtual occurrences and overrides as identical chips, and every scoped write names an
 * occurrence by `(master id, recurrenceId)`; handing the client an override's own id
 * would make the chip it came from unusable as the target of `scope: "all"`. See
 * docs/context/calendar/api.md → the occurrence-identity contract.
 *
 * `recurrenceId` is `null` for a one-off and the occurrence's **original** civil start
 * for anything else — never the moved-to time.
 */
interface RangeItem {
  id: string;
  calendarId: string;
  title: string;
  location: string | null;
  color: string | null;
  status: EventStatus;
  visibility: EventVisibility;
  transparency: EventTransparency;
  allDay: boolean;
  startWall: string;
  startTzid: string;
  endWall: string;
  endTzid: string;
  startAt: Date;
  endAt: Date;
  recurrenceId: string | null;
  /** True when the chip belongs to a repeating event, so it can carry a repeat glyph. */
  recurring: boolean;
}

/**
 * The `recurrence_id` window the suppression scan reads.
 *
 * `recurrence_id` is a civil reading, the window is two instants, and the two live in
 * different spaces — so the bounds are the window read as UTC civil ±1 day, which is
 * safely wider than any real offset (±14 h) in both directions. Wider is free here: the
 * scan only ever answers "which of these occurrences already have a row", and an extra
 * day of candidates costs a handful of index entries.
 */
function suppressionBounds(fromMs: number, toMs: number): { lo: LocalDateTime; hi: LocalDateTime } {
  return {
    lo: formatLocalDateTime(addCivilDays(instantToCivil(fromMs, "UTC"), -1)),
    hi: formatLocalDateTime(addCivilDays(instantToCivil(toMs, "UTC"), 1)),
  };
}

/**
 * Total, so the merged stream is deterministic: a grid that reshuffles on every refetch
 * is the failure this avoids, and two occurrences of the same series share an `id`.
 */
function compareRangeItems(a: RangeItem, b: RangeItem): number {
  const byStart = a.startAt.getTime() - b.startAt.getTime();
  if (byStart !== 0) return byStart;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  const left = a.recurrenceId ?? "";
  const right = b.recurrenceId ?? "";
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * The columns `byId` may hand back, named once per source and key-checked against each
 * other.
 *
 * **`byId` answers from two different tables** — the masters view for a series master or
 * a one-off, `calendar_events` for a materialised override — and both feed the *same*
 * consumer through `event: override ?? master`. Narrowing one alone would hand that
 * consumer two different shapes depending on which occurrence was clicked, which is the
 * kind of bug that only shows up on a moved occurrence. The `satisfies` below is the
 * guard: adding a key to one literal and not the other stops the file compiling.
 *
 * What is deliberately **not** here is `calendars.user_id`. From Phase 3 an attendee can
 * read this procedure, and a bare `select()` over the joined calendar row would hand every
 * invitee the organizer's internal user id (decision 11).
 */
type EventDetailKey =
  | "id"
  | "calendarId"
  | "title"
  | "description"
  | "location"
  | "url"
  | "color"
  | "status"
  | "visibility"
  | "transparency"
  | "allDay"
  | "startWall"
  | "startTzid"
  | "endWall"
  | "endTzid"
  | "startAt"
  | "endAt"
  | "rrule"
  | "recurrenceParentId"
  | "deletedAt";

const MASTER_DETAIL_COLUMNS = {
  id: calendarEventMasters.id,
  calendarId: calendarEventMasters.calendarId,
  title: calendarEventMasters.title,
  description: calendarEventMasters.description,
  location: calendarEventMasters.location,
  url: calendarEventMasters.url,
  color: calendarEventMasters.color,
  status: calendarEventMasters.status,
  visibility: calendarEventMasters.visibility,
  transparency: calendarEventMasters.transparency,
  allDay: calendarEventMasters.allDay,
  startWall: calendarEventMasters.startWall,
  startTzid: calendarEventMasters.startTzid,
  endWall: calendarEventMasters.endWall,
  endTzid: calendarEventMasters.endTzid,
  startAt: calendarEventMasters.startAt,
  endAt: calendarEventMasters.endAt,
  rrule: calendarEventMasters.rrule,
  recurrenceParentId: calendarEventMasters.recurrenceParentId,
  deletedAt: calendarEventMasters.deletedAt,
} satisfies Record<EventDetailKey, unknown>;

const OVERRIDE_DETAIL_COLUMNS = {
  id: calendarEvents.id,
  calendarId: calendarEvents.calendarId,
  title: calendarEvents.title,
  description: calendarEvents.description,
  location: calendarEvents.location,
  url: calendarEvents.url,
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
  rrule: calendarEvents.rrule,
  recurrenceParentId: calendarEvents.recurrenceParentId,
  deletedAt: calendarEvents.deletedAt,
} satisfies Record<EventDetailKey, unknown>;

/** The invitations page's cursor and page size. */
const MAX_INVITES_PAGE_SIZE = 50;
const DEFAULT_INVITES_PAGE_SIZE = 20;

/**
 * `id` is validated as a uuid **here**, at the boundary, for the reason
 * `notification.list` spells out: `calendar_events.id` is a uuid column, so a
 * hand-crafted non-uuid cursor would reach `id > $1` and make Postgres throw rather than
 * degrade — a 500 that leaks the query text, where a 400 is the honest answer. A
 * legitimate cursor is always server-originated.
 */
const inviteCursorSchema = z.object({ startAt: z.date(), id: z.uuid() });

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
    if (visibleIds.length === 0) return { items: [], truncated: false, seriesTruncated: false };

    const from = new Date(input.fromMs);
    const to = new Date(input.toMs);
    // Computed here rather than as `$1::timestamptz - interval '367 days'`: a plain
    // bound parameter is trivially index-usable and consults nothing.
    const earliestStart = new Date(input.fromMs - MAX_SPAN_SLACK_DAYS * 86_400_000);

    // --- Branch A: concrete rows, on `calendar_events_concrete_idx` ------------
    const concreteRows = await ctx.db
      .select({
        id: calendarEvents.id,
        parentId: calendarEvents.recurrenceParentId,
        recurrenceId: calendarEvents.recurrenceId,
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
          // calendar_events_concrete_idx provable to the planner. It now legitimately
          // matches per-occurrence overrides too, which is exactly why the range query
          // could never read through `calendar_event_masters`.
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

    const items: RangeItem[] = concreteRows.map(({ id, parentId, ...row }) => ({
      ...row,
      // The identity contract: an override answers with its MASTER's id.
      id: parentId ?? id,
      recurring: parentId !== null,
    }));

    // --- Branch B: series masters, on `calendar_events_recurring_idx` ----------
    const masters = await ctx.db
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
        rrule: calendarEvents.rrule,
      })
      .from(calendarEvents)
      .where(
        and(
          inArray(calendarEvents.calendarId, visibleIds),
          isNotNull(calendarEvents.rrule),
          isNull(calendarEvents.deletedAt),
          // `series_end_at` may over-estimate and never under-estimates, which is what
          // makes it safe to EXCLUDE a master on. NULL is an unbounded series.
          or(isNull(calendarEvents.seriesEndAt), gte(calendarEvents.seriesEndAt, from)),
          // No occurrence can start before DTSTART, so a series beginning after the
          // window contributes nothing — and would otherwise spend one of the
          // MAX_RANGE_SERIES slots proving it.
          lte(calendarEvents.startAt, to),
        ),
      )
      .orderBy(asc(calendarEvents.startAt), asc(calendarEvents.id))
      .limit(MAX_RANGE_SERIES + 1);

    const seriesTruncated = masters.length > MAX_RANGE_SERIES;
    const expandable = seriesTruncated ? masters.slice(0, MAX_RANGE_SERIES) : masters;
    let truncated = items.length > MAX_RANGE_ROWS;

    if (expandable.length > 0) {
      const masterIds = expandable.map((master) => master.id);
      const bounds = suppressionBounds(input.fromMs, input.toMs);

      const [dateRows, overrideRows] = await Promise.all([
        ctx.db
          .select({
            eventId: calendarRecurrenceDates.eventId,
            kind: calendarRecurrenceDates.kind,
            dateWall: calendarRecurrenceDates.dateWall,
          })
          .from(calendarRecurrenceDates)
          .where(inArray(calendarRecurrenceDates.eventId, masterIds)),
        // --- The suppression scan, on `calendar_events_override_idx` ----------
        //
        // No `calendar_id` predicate: measured, it costs +42% index size for noise, and
        // `calendar_events_parent_same_calendar` already makes it redundant.
        //
        // No `deleted_at` predicate either, and that is deliberate. A soft-deleted
        // override still means *this occurrence is not a plain occurrence*, so filtering
        // it would resurrect the base occurrence at its original time — the opposite of
        // what the user asked for. The writer contract is what guarantees an override is
        // never soft-deleted while its master is live; this query does not paper over a
        // writer that broke it.
        ctx.db
          .select({
            parentId: calendarEvents.recurrenceParentId,
            recurrenceId: calendarEvents.recurrenceId,
          })
          .from(calendarEvents)
          .where(
            and(
              inArray(calendarEvents.recurrenceParentId, masterIds),
              gte(calendarEvents.recurrenceId, bounds.lo),
              lte(calendarEvents.recurrenceId, bounds.hi),
            ),
          ),
      ]);

      const modifiersByMaster = new Map<string, { kind: string; dateWall: string }[]>();
      for (const row of dateRows) {
        const list = modifiersByMaster.get(row.eventId);
        if (list) list.push(row);
        else modifiersByMaster.set(row.eventId, [row]);
      }

      const overriddenByMaster = new Map<string, LocalDateTime[]>();
      for (const row of overrideRows) {
        if (row.parentId === null || row.recurrenceId === null) continue;
        const list = overriddenByMaster.get(row.parentId);
        if (list) list.push(row.recurrenceId);
        else overriddenByMaster.set(row.parentId, [row.recurrenceId]);
      }

      const unknownKinds = new Set<string>();
      for (const master of expandable) {
        if (master.rrule === null) continue;
        const modifiers = partitionRecurrenceDates(modifiersByMaster.get(master.id) ?? []);
        for (const row of modifiers.unknown) unknownKinds.add(row.kind);

        try {
          const series = expandSeries(
            {
              rrule: master.rrule,
              startWall: master.startWall,
              startTzid: master.startTzid,
              endWall: master.endWall,
              endTzid: master.endTzid,
              exdates: modifiers.exdates,
              rdates: modifiers.rdates,
              overriddenRecurrenceIds: overriddenByMaster.get(master.id) ?? [],
            },
            { fromMs: input.fromMs, toMs: input.toMs },
            MAX_RANGE_ROWS,
          );
          if (series.truncated) truncated = true;
          for (const occurrence of series.occurrences) {
            items.push({
              id: master.id,
              calendarId: master.calendarId,
              title: master.title,
              location: master.location,
              color: master.color,
              status: master.status,
              visibility: master.visibility,
              transparency: master.transparency,
              allDay: master.allDay,
              startWall: occurrence.startWall,
              startTzid: occurrence.startTzid,
              endWall: occurrence.endWall,
              endTzid: occurrence.endTzid,
              startAt: new Date(occurrence.startAtMs),
              endAt: new Date(occurrence.endAtMs),
              recurrenceId: occurrence.recurrenceId,
              recurring: true,
            });
          }
        } catch (error) {
          // One unreadable rule is one series missing from the grid, not a 500 for the
          // whole month. Detect and report — the posture the schema's writer-enforced
          // invariants already take.
          log.error("calendar.range series could not be expanded", {
            eventId: master.id,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      if (unknownKinds.size > 0) {
        // Loud, never a silent skip: the row was accepted by the unique constraint, so
        // the user believes their skip stuck (lib/calendar/recurrence-dates.ts).
        log.error("calendar.recurrence-date kind not recognised", {
          kinds: [...unknownKinds],
        });
      }
    }

    // ONE time-ordered stream, capped once. If branch A could consume the cap alone, a
    // tenant with 2,000 one-off events in a month would get zero occurrences from every
    // series — a *category*-shaped truncation, strictly worse than the tail-shaped one
    // the banner copy was written for.
    items.sort(compareRangeItems);
    truncated ||= items.length > MAX_RANGE_ROWS;
    return { items: items.slice(0, MAX_RANGE_ROWS), truncated, seriesTruncated };
  }),

  /**
   * One event for the editor — and optionally one **occurrence** of it.
   *
   * The `id` is always a series master's, so the lookup reads through
   * `calendar_event_masters`: the rule the range query is the documented exception to.
   * An override is not a thing with its own URL, and passing one here is a `null`, not a
   * row.
   *
   * `recurrenceId` names an occurrence, and the override row is resolved **here** rather
   * than by the client — the same resolution the scoped actions do. Without it the editor
   * would seed from the master, and a user who changed only the title of an
   * already-moved occurrence would silently revert its description and link to the
   * series' own. That is the same erase the workspace already avoids by not seeding the
   * composer from a grid row.
   *
   * `seriesRrule` is always the **master's** rule, even when `event` is an override
   * (whose own `rrule` is NULL by constraint). An editor that seeded its repeat field
   * from the returned row would submit "no rule" for a `thisAndFollowing` edit.
   *
   * **From Phase 3 the join is no longer the authorization.** It scoped to
   * `calendars.user_id = me`, which stopped being the right question once an invitee
   * could legitimately see an event on someone else's calendar. `getEventAccess` answers
   * instead — it composes the calendar role with the attendee row internally, so this
   * procedure cannot get the `||` wrong — and a refusal is the same `null` a missing row
   * returns.
   *
   * `attendees` comes back for every reader, which is decision 7: an attendee sees the
   * full guest list, Google's default. It is **emails only** (decision 11): a resolved
   * `user_id` changes storage and nothing on screen, and joining a display name here
   * would turn "is this address registered" from a slow oracle into an instant one.
   */
  byId: userRateLimitedProcedure
    .input(z.object({ id: z.uuid(), recurrenceId: z.string().nullish() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          event: MASTER_DETAIL_COLUMNS,
          calendar: {
            id: calendars.id,
            name: calendars.name,
            color: calendars.color,
            timeZone: calendars.timeZone,
          },
        })
        .from(calendarEventMasters)
        .innerJoin(calendars, eq(calendars.id, calendarEventMasters.calendarId))
        .where(eq(calendarEventMasters.id, input.id))
        .limit(1);
      if (!row) return null;

      const master = row.event;
      // Handed the row we already loaded: the view has applied both filters that are part
      // of the answer — no override, not soft-deleted — so what is left to decide is this
      // caller's relationship to it, and re-reading the event would be a third query.
      const access = await getEventAccess(input.id, ctx.session.user.id, master);
      if (!canReadEvent(access)) return null;

      const attendees = await ctx.db
        .select({
          email: calendarEventAttendees.email,
          role: calendarEventAttendees.role,
          status: calendarEventAttendees.status,
        })
        .from(calendarEventAttendees)
        .where(eq(calendarEventAttendees.eventId, master.id))
        .orderBy(asc(calendarEventAttendees.email));

      const recurrenceId = input.recurrenceId ?? null;
      if (recurrenceId === null) {
        return { event: master, calendar: row.calendar, seriesRrule: master.rrule, attendees };
      }

      const [override] = await ctx.db
        .select(OVERRIDE_DETAIL_COLUMNS)
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.recurrenceParentId, master.id),
            eq(calendarEvents.recurrenceId, recurrenceId),
            isNull(calendarEvents.deletedAt),
          ),
        )
        .limit(1);

      // The guest list stays the master's even here: overrides inherit attendees rather
      // than carrying their own (attendees.md), so an occurrence's editor must seed from
      // the series or a save would drop everyone.
      return {
        event: override ?? master,
        calendar: row.calendar,
        seriesRrule: master.rrule,
        attendees,
      };
    }),

  /**
   * The caller's invitations, soonest first — the whole of `/calendar/invites`.
   *
   * **It cannot reuse `byId`'s join, because that join *is* an authorization.** An
   * invitee is not the owner of the calendar their invitation lives on, so the scope here
   * is decision 14's predicate over the attendee rows themselves:
   *
   * ```sql
   * user_id = :me OR (email = lower(:myEmail) AND :myEmailIsVerified)
   * ```
   *
   * **The `emailVerified` conjunct is not optional.** Without it, signing up as
   * `victim@example.com` and never verifying would list that person's invitations.
   *
   * **Both halves are read from Postgres rather than off the session.** The Better Auth
   * cookie cache is up to five minutes stale, and this repo's `changeEmail` is configured
   * with `updateEmailWithoutVerification`, so the snapshot that matters is `(old address,
   * verified)` held briefly after someone moves away from an address another person may
   * now be able to claim. It is a plain primary-key read rather than the join an earlier
   * draft assumed: with `me.email` in hand the predicate is two constants, which lets
   * Postgres `BitmapOr` the two attendee indexes — the join form would have made the
   * disjunction reference a column and lose both.
   *
   * **`lower()` goes on the parameter**, never the column:
   * `calendar_event_attendees.email` is CHECK-lowercased and `user.email` is not, so the
   * comparison needs normalising — but `lower(a.email)` would put a function on the
   * indexed side and lose `calendar_event_attendees_email_idx`.
   *
   * Read through `calendar_event_masters`, which excludes soft-deleted events and
   * overrides for free — an invitation to a cancelled meeting is not an invitation, and
   * attendees hang off the master anyway.
   *
   * **There is no time filter, deliberately.** Ordering ascending on `(start_at, id)`
   * makes this the caller's invitations in the order they happen; a `start_at >= now()`
   * bound would make the contents depend on the request clock for no product reason that
   * survives Phase 6 folding this list into the grid.
   */
  listInvites: userRateLimitedProcedure
    .input(
      z
        .object({
          cursor: inviteCursorSchema.nullish(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_INVITES_PAGE_SIZE)
            .default(DEFAULT_INVITES_PAGE_SIZE),
        })
        .default({ limit: DEFAULT_INVITES_PAGE_SIZE }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;
      const userId = ctx.session.user.id;

      const [me] = await ctx.db
        .select({ email: user.email, emailVerified: user.emailVerified })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      // The durable arm always applies; the claim arm applies only to a proved address.
      const claimed = me?.emailVerified
        ? or(
            eq(calendarEventAttendees.userId, userId),
            eq(calendarEventAttendees.email, sql`lower(${me.email})`),
          )
        : eq(calendarEventAttendees.userId, userId);

      const rows = await ctx.db
        .select({
          id: calendarEventMasters.id,
          title: calendarEventMasters.title,
          location: calendarEventMasters.location,
          allDay: calendarEventMasters.allDay,
          startAt: calendarEventMasters.startAt,
          endAt: calendarEventMasters.endAt,
          startWall: calendarEventMasters.startWall,
          startTzid: calendarEventMasters.startTzid,
          endWall: calendarEventMasters.endWall,
          endTzid: calendarEventMasters.endTzid,
          rrule: calendarEventMasters.rrule,
          status: calendarEventAttendees.status,
          role: calendarEventAttendees.role,
        })
        .from(calendarEventAttendees)
        .innerJoin(
          calendarEventMasters,
          eq(calendarEventMasters.id, calendarEventAttendees.eventId),
        )
        .where(
          and(
            claimed,
            // Strictly after the cursor in the same (start_at, id) order as the sort.
            cursor
              ? or(
                  gt(calendarEventMasters.startAt, cursor.startAt),
                  and(
                    eq(calendarEventMasters.startAt, cursor.startAt),
                    gt(calendarEventMasters.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(calendarEventMasters.startAt), asc(calendarEventMasters.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      // The cursor is the last row actually RETURNED, never the probe row, or the next
      // page skips it.
      const last = items[items.length - 1];
      const nextCursor = hasMore && last ? { startAt: last.startAt, id: last.id } : null;

      return { items, nextCursor };
    }),
});
