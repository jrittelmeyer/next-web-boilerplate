import type { LocalDateTime, SeriesInput } from "@repo/calendar";
import { db } from "@repo/db";
import {
  calendarEventReminders,
  calendarEvents,
  calendarRecurrenceDates,
  calendarReminderDeliveries,
  user,
} from "@repo/db/schema";
import { formatEventWhen } from "@repo/email";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { JOBS } from "../queues";
import { eventPath, eventUrl } from "./site-url";
import {
  type DueOccurrence,
  dueOccurrences,
  type FireWindow,
  fireWindow,
  seriesFloorMs,
  startsInMinutes,
} from "./sweep";

/**
 * The reminder sweeper's **I/O half**. Every branch worth arguing about lives in `sweep.ts`,
 * which is pure and unit-gated; this file is the shell that feeds it — deliberately kept out
 * of `coverage.include`, exactly like `boss.ts` and `enqueue.ts`, and exercised instead by
 * `__tests__/integration/calendar-reminders.test.ts` against a real Postgres.
 *
 * Reminders hang off the **series master**, so an occurrence reaches the sweeper by one of
 * three routes and each needs its own query:
 *
 *   A. a one-off event — the reminder is on the event itself;
 *   B. a per-occurrence **override** — the reminder is on its PARENT, so no join on
 *      `event_id` finds it. This branch is why "the concrete branch picks up overrides
 *      naturally" is false;
 *   C. a recurring master — expanded in JS, minus the occurrences B already owns.
 */

/** Bounds one tick's fan-out so a pathological calendar cannot enqueue unboundedly. */
const MAX_DELIVERIES_PER_SWEEP = 500;

interface DueReminder {
  readonly reminderId: string;
  readonly eventId: string;
  readonly userId: string;
  readonly channel: string;
  readonly email: string;
  readonly eventTitle: string;
  readonly location: string | null;
  readonly allDay: boolean;
  readonly occurrence: DueOccurrence;
}

const reminderColumns = {
  reminderId: calendarEventReminders.id,
  offsetMinutes: calendarEventReminders.offsetMinutes,
  channel: calendarEventReminders.channel,
  userId: calendarEventReminders.userId,
  email: user.email,
};

const eventColumns = {
  eventId: calendarEvents.id,
  eventTitle: calendarEvents.title,
  location: calendarEvents.location,
  allDay: calendarEvents.allDay,
  startAt: calendarEvents.startAt,
  startWall: calendarEvents.startWall,
  startTzid: calendarEvents.startTzid,
};

/** `start_at + offset` lands inside the half-open fire window. */
function firesInWindowSql(window: FireWindow) {
  const fireAt = sql`(${calendarEvents.startAt} + make_interval(mins => ${calendarEventReminders.offsetMinutes}))`;
  return and(
    sql`${fireAt} > ${new Date(window.fromMs)}`,
    sql`${fireAt} <= ${new Date(window.toMs)}`,
  );
}

/** Branch A — a reminder on a non-recurring event of its own. */
async function concreteDue(window: FireWindow): Promise<DueReminder[]> {
  const rows = await db
    .select({ ...reminderColumns, ...eventColumns })
    .from(calendarEventReminders)
    .innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventReminders.eventId))
    .innerJoin(user, eq(user.id, calendarEventReminders.userId))
    .where(
      and(isNull(calendarEvents.rrule), isNull(calendarEvents.deletedAt), firesInWindowSql(window)),
    )
    .limit(MAX_DELIVERIES_PER_SWEEP);

  return rows.map(toDueReminder);
}

/**
 * Branch B — a reminder on a master, fired by one of that master's OVERRIDE rows.
 *
 * The join is on `recurrence_parent_id`, not `id`. An override is a concrete event with its
 * own time and no `rrule` (the `override_not_recurring` CHECK guarantees that), and it
 * inherits its master's reminders exactly as it inherits its master's attendees.
 */
async function overrideDue(window: FireWindow): Promise<DueReminder[]> {
  const rows = await db
    .select({ ...reminderColumns, ...eventColumns })
    .from(calendarEventReminders)
    .innerJoin(
      calendarEvents,
      eq(calendarEvents.recurrenceParentId, calendarEventReminders.eventId),
    )
    .innerJoin(user, eq(user.id, calendarEventReminders.userId))
    .where(and(isNull(calendarEvents.deletedAt), firesInWindowSql(window)))
    .limit(MAX_DELIVERIES_PER_SWEEP);

  return rows.map(toDueReminder);
}

function toDueReminder(row: {
  reminderId: string;
  channel: string;
  userId: string;
  email: string;
  eventId: string;
  eventTitle: string;
  location: string | null;
  allDay: boolean;
  startAt: Date;
  startWall: string;
  startTzid: string;
}): DueReminder {
  return {
    reminderId: row.reminderId,
    eventId: row.eventId,
    userId: row.userId,
    channel: row.channel,
    email: row.email,
    eventTitle: row.eventTitle,
    location: row.location,
    allDay: row.allDay,
    occurrence: {
      startAtMs: row.startAt.getTime(),
      startWall: row.startWall,
      startTzid: row.startTzid,
    },
  };
}

/** Branch C — recurring masters, expanded against the live rule every tick. */
async function recurringDue(window: FireWindow): Promise<DueReminder[]> {
  const masters = await db
    .select({
      ...reminderColumns,
      ...eventColumns,
      endWall: calendarEvents.endWall,
      endTzid: calendarEvents.endTzid,
      rrule: calendarEvents.rrule,
    })
    .from(calendarEventReminders)
    .innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventReminders.eventId))
    .innerJoin(user, eq(user.id, calendarEventReminders.userId))
    .where(
      and(
        isNotNull(calendarEvents.rrule),
        isNull(calendarEvents.deletedAt),
        sql`(${calendarEvents.seriesEndAt} IS NULL OR ${calendarEvents.seriesEndAt} > ${new Date(seriesFloorMs(window))})`,
      ),
    )
    .limit(MAX_DELIVERIES_PER_SWEEP);

  if (masters.length === 0) return [];

  const masterIds = [...new Set(masters.map((row) => row.eventId))];
  const [recurrenceDates, overrides] = await Promise.all([
    db
      .select({
        eventId: calendarRecurrenceDates.eventId,
        kind: calendarRecurrenceDates.kind,
        dateWall: calendarRecurrenceDates.dateWall,
      })
      .from(calendarRecurrenceDates)
      .where(inArray(calendarRecurrenceDates.eventId, masterIds)),
    // Which occurrences already have an override row — branch B owns those, and leaving
    // them in the expansion would remind the user twice for one meeting.
    db
      .select({
        parentId: calendarEvents.recurrenceParentId,
        recurrenceId: calendarEvents.recurrenceId,
      })
      .from(calendarEvents)
      .where(inArray(calendarEvents.recurrenceParentId, masterIds)),
  ]);

  const due: DueReminder[] = [];
  for (const master of masters) {
    const dates = recurrenceDates.filter((row) => row.eventId === master.eventId);
    const series: SeriesInput = {
      rrule: master.rrule ?? "",
      startWall: master.startWall as LocalDateTime,
      startTzid: master.startTzid,
      endWall: master.endWall as LocalDateTime,
      endTzid: master.endTzid,
      // Partitioned by `kind`, never filtered with `WHERE kind = …` — an unrecognised value
      // must be a logged error rather than a row silently dropped (packages/db/AGENTS.md).
      exdates: dates.filter((d) => d.kind === "exdate").map((d) => d.dateWall as LocalDateTime),
      rdates: dates.filter((d) => d.kind === "rdate").map((d) => d.dateWall as LocalDateTime),
      overriddenRecurrenceIds: overrides
        .filter((o) => o.parentId === master.eventId && o.recurrenceId !== null)
        .map((o) => o.recurrenceId as LocalDateTime),
    };
    for (const unknown of dates.filter((d) => d.kind !== "exdate" && d.kind !== "rdate")) {
      console.error(`[jobs] calendar-reminder-sweep: unknown recurrence date kind ${unknown.kind}`);
    }

    for (const occurrence of dueOccurrences(series, master.offsetMinutes, window)) {
      due.push({
        reminderId: master.reminderId,
        eventId: master.eventId,
        userId: master.userId,
        channel: master.channel,
        email: master.email,
        eventTitle: master.eventTitle,
        location: master.location,
        allDay: master.allDay,
        occurrence,
      });
    }
  }
  return due;
}

/**
 * Claim one delivery and hand it to its channel's queue.
 *
 * **The ordering is the correctness story.** The claim commits first, so a crash between the
 * two loses one reminder rather than sending it twice — the safe direction. If the enqueue
 * then fails, the claim is compensated away so the next tick can retry it; without that, a
 * failed enqueue would leave a ledger row saying "delivered" for a reminder nobody received,
 * permanently.
 *
 * This is also why the sweeper takes `boss` rather than importing `enqueue()`: that helper
 * builds a SECOND pg-boss instance inside a process that already has one, and swallows every
 * error by design — correct for a web request that must not fail the user's flow, and
 * catastrophic here, where the swallowed error is the one thing that must trigger the
 * compensation.
 */
async function claimAndDispatch(boss: PgBoss, due: DueReminder, nowMs: number): Promise<boolean> {
  const occurrenceStartAt = new Date(due.occurrence.startAtMs);
  const [claim] = await db
    .insert(calendarReminderDeliveries)
    .values({ reminderId: due.reminderId, occurrenceStartAt })
    .onConflictDoNothing()
    .returning({ id: calendarReminderDeliveries.id });

  // No row: another worker, or an earlier tick inside the grace window, already owns it.
  if (!claim) return false;

  const minutes = startsInMinutes(due.occurrence.startAtMs, nowMs);
  try {
    if (due.channel === "email") {
      await boss.send(JOBS.calendarReminderEmail, {
        deliveryId: claim.id,
        eventTitle: due.eventTitle,
        startsInMinutes: minutes,
        to: due.email,
        when: formatEventWhen({
          startWall: due.occurrence.startWall,
          startTzid: due.occurrence.startTzid,
          allDay: due.allDay,
        }),
        location: due.location,
        eventUrl: eventUrl(due.eventId),
      });
    } else {
      await boss.send(JOBS.calendarReminderNotify, {
        deliveryId: claim.id,
        eventTitle: due.eventTitle,
        startsInMinutes: minutes,
        userId: due.userId,
        eventPath: eventPath(due.eventId),
      });
    }
    return true;
  } catch (error) {
    await db
      .delete(calendarReminderDeliveries)
      .where(eq(calendarReminderDeliveries.id, claim.id))
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Retention for the delivery ledger, run inside the sweep.
 *
 * **Deliberately not in `cleanup-expired-verifications`.** Parked there, a project that
 * followed `remove-it.md` and dropped this table would leave that nightly handler throwing
 * `relation does not exist` — retrying, dead-lettering, every night forever, taking Better
 * Auth's token pruning down with it. Housed here, removal is automatic.
 */
async function pruneDeliveries(): Promise<void> {
  await db
    .delete(calendarReminderDeliveries)
    .where(sql`${calendarReminderDeliveries.createdAt} < now() - interval '90 days'`);
}

/**
 * One tick. Returns the number of deliveries this sweep claimed, for the log line.
 */
export async function runSweep(boss: PgBoss): Promise<number> {
  // The clock is POSTGRES'S, never the worker's. Multiple workers must agree, and this
  // repo has already been bitten by a host/container skew (~4.5s) silently inverting a
  // comparison. Every bound below derives from this single read.
  const [clock] = (await db.execute<{ now: Date }>(sql`SELECT now() AS now`)).rows;
  if (!clock) return 0;
  const nowMs = new Date(clock.now).getTime();

  // The whole feature costs one trivial query per tick when nothing uses it. The SCHEDULE
  // is registered unconditionally — see worker.ts for why a conditional register has a
  // silent hole — so this is what makes "costs nothing when unused" true.
  const [any] = (
    await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM ${calendarEventReminders} LIMIT 1) AS exists`,
    )
  ).rows;
  if (!any?.exists) return 0;

  const window = fireWindow(nowMs);
  const batches = await Promise.all([
    concreteDue(window),
    overrideDue(window),
    recurringDue(window),
  ]);
  const due = batches.flat().slice(0, MAX_DELIVERIES_PER_SWEEP);

  let claimed = 0;
  for (const reminder of due) {
    if (await claimAndDispatch(boss, reminder, nowMs)) claimed += 1;
  }

  await pruneDeliveries();
  return claimed;
}
