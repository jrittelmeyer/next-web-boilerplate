import { db } from "@repo/db";
// `calendar_events` is written through raw SQL here rather than the drizzle table: the
// derived-instant CHECK requires `start_at` to be computed from Postgres's own clock, and
// routing it through the query builder would mean a JS timestamp — the comparison this box's
// container skew has already inverted once.
import {
  calendarEventReminders,
  calendarReminderDeliveries,
  calendars,
  user,
} from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { JOBS } from "../../src/queues";
import { runSweep } from "../../src/reminders/run";

/**
 * The reminder sweeper against a REAL Postgres.
 *
 * This file exists because the two behaviours that matter most **cannot be proven with a
 * mock**: "two concurrent sweeps produce exactly one delivery" is a statement about a unique
 * index and `ON CONFLICT DO NOTHING`, and "a missed tick fires a backlog once" is a statement
 * about the grace window meeting that same index. A mocked `ON CONFLICT` asserts only that
 * the code called the function the author expected — which is the thing under test.
 *
 * The pure selection maths is unit-tested in `src/reminders/sweep.test.ts`; nothing here
 * re-asserts it.
 */

const SCHEMA = "pgboss_reminders_test";

const OWNER = {
  id: "integration-test-sweeper-owner",
  name: "Integration Test Sweeper Owner",
  email: "integration-test-sweeper-owner@example.com",
  emailVerified: true,
} as const;

const CALENDAR_ID = "eeeeeeee-1111-4222-8333-000000000001";
const EVENT_ID = "eeeeeeee-1111-4222-8333-000000000010";

let boss: PgBoss;

/** Counts what the sweeper enqueued, per queue, in this test's isolated pgboss schema. */
async function queuedCount(queue: string): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${SCHEMA}.job WHERE name = $1`,
      [queue],
    );
    return Number(rows[0]?.count ?? "0");
  } finally {
    await pool.end();
  }
}

async function cleanup() {
  await db.delete(user).where(eq(user.id, OWNER.id));
}

/**
 * Seeds one non-recurring event whose start is `minutesFromNow` away — measured by
 * **Postgres's** clock, never the host's. This box's Docker Postgres runs several seconds
 * ahead of the host, and a JS-computed instant compared against a PG-computed window has
 * already inverted one comparison in this repo.
 */
async function seedEvent(minutesFromNow: number) {
  await db.insert(user).values(OWNER);
  await db.insert(calendars).values({
    id: CALENDAR_ID,
    userId: OWNER.id,
    name: "Sweeper",
    color: "chart-1",
    timeZone: "UTC",
  });
  await db.execute(sql`
    INSERT INTO calendar_events
      (id, calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
       end_wall, end_tzid, end_offset_minutes, end_at)
    SELECT
      ${EVENT_ID}::uuid, ${CALENDAR_ID}::uuid, 'sweeper-uid', 'Standup',
      w, 'UTC', 0, (w AT TIME ZONE 'UTC'),
      w, 'UTC', 0, (w AT TIME ZONE 'UTC')
    FROM (
      SELECT date_trunc('second', (now() AT TIME ZONE 'UTC')
             + make_interval(mins => ${minutesFromNow})) AS w
    ) s
  `);
}

async function seedReminder(offsetMinutes: number, channel: "email" | "in-app" = "email") {
  const [row] = await db
    .insert(calendarEventReminders)
    .values({ eventId: EVENT_ID, userId: OWNER.id, channel, anchor: "start", offsetMinutes })
    .returning({ id: calendarEventReminders.id });
  if (!row) throw new Error("seedReminder returned no row");
  return row.id;
}

async function deliveries() {
  return await db.select().from(calendarReminderDeliveries);
}

beforeEach(async () => {
  await cleanup();
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: SCHEMA,
    supervise: false,
    schedule: false,
  });
  await boss.start();
  for (const queue of [JOBS.calendarReminderEmail, JOBS.calendarReminderNotify]) {
    await boss.createQueue(queue);
  }
  await db.execute(sql.raw(`DELETE FROM ${SCHEMA}.job`));
});

afterAll(async () => {
  await cleanup();
  await boss?.stop({ graceful: false }).catch(() => undefined);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.end();
});

describe("the sweep", () => {
  it("costs one query and claims nothing when no reminder exists anywhere", async () => {
    // What makes registering the schedule unconditionally cheap. The alternative — only
    // scheduling when reminders exist — has a silent hole: `boss.schedule` runs once at boot,
    // so the FIRST reminder a deployment creates would never fire until a worker restart.
    expect(await runSweep(boss)).toBe(0);
    expect(await deliveries()).toHaveLength(0);
  });

  it("claims a due reminder and enqueues it to the email queue", async () => {
    await seedEvent(15);
    await seedReminder(-15);

    expect(await runSweep(boss)).toBe(1);
    expect(await deliveries()).toHaveLength(1);
    expect(await queuedCount(JOBS.calendarReminderEmail)).toBe(1);
    expect(await queuedCount(JOBS.calendarReminderNotify)).toBe(0);
  });

  it("routes an in-app reminder to the notify queue instead", async () => {
    await seedEvent(15);
    await seedReminder(-15, "in-app");

    expect(await runSweep(boss)).toBe(1);
    expect(await queuedCount(JOBS.calendarReminderNotify)).toBe(1);
    expect(await queuedCount(JOBS.calendarReminderEmail)).toBe(0);
  });

  it("ignores a reminder whose fire time has not arrived", async () => {
    await seedEvent(600); // ten hours out
    await seedReminder(-15);

    expect(await runSweep(boss)).toBe(0);
    expect(await deliveries()).toHaveLength(0);
  });

  it("ignores a reminder on a soft-deleted event", async () => {
    await seedEvent(15);
    await seedReminder(-15);
    await db.execute(
      sql`UPDATE calendar_events SET deleted_at = now() WHERE id = ${EVENT_ID}::uuid`,
    );

    expect(await runSweep(boss)).toBe(0);
  });

  it("does not send twice when the same tick runs again", async () => {
    // The ordinary case for the dedupe ledger: the grace window means consecutive ticks
    // legitimately overlap, so re-running must be a no-op rather than a second reminder.
    await seedEvent(15);
    await seedReminder(-15);

    expect(await runSweep(boss)).toBe(1);
    expect(await runSweep(boss)).toBe(0);
    expect(await deliveries()).toHaveLength(1);
    expect(await queuedCount(JOBS.calendarReminderEmail)).toBe(1);
  });

  it("fires a missed-tick backlog exactly once", async () => {
    // A worker down for half an hour: the event started 20 minutes ago, so its -15 reminder
    // was due 35 minutes ago — inside the 60-minute grace window. It must deliver, and the
    // catch-up must not double up with the tick that follows it.
    await seedEvent(-20);
    await seedReminder(-15);

    expect(await runSweep(boss)).toBe(1);
    expect(await runSweep(boss)).toBe(0);
    expect(await queuedCount(JOBS.calendarReminderEmail)).toBe(1);
  });

  it("drops a backlog older than the grace window rather than delivering it late", async () => {
    // Stated behaviour, not an accident: a two-hour-late "starts in about 15 minutes" is
    // noise. The fixed lookback is what makes this deterministic instead of cursor-dependent.
    await seedEvent(-120);
    await seedReminder(-15);

    expect(await runSweep(boss)).toBe(0);
  });

  it("lets exactly ONE of three concurrent sweeps deliver — the whole mechanism", async () => {
    // THE test this file exists for. Three sweeps race the same due reminder on three pooled
    // connections; the unique index plus ON CONFLICT DO NOTHING is the only arbiter. Without
    // it every worker in a scaled deployment sends, and the user gets N copies of every
    // reminder — a failure mode a single-worker test can never reveal.
    await seedEvent(15);
    await seedReminder(-15);

    const claimed = await Promise.all([runSweep(boss), runSweep(boss), runSweep(boss)]);

    expect(claimed.filter((n) => n === 1)).toHaveLength(1);
    expect(claimed.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await deliveries()).toHaveLength(1);
    expect(await queuedCount(JOBS.calendarReminderEmail)).toBe(1);
  });

  it("compensates the claim when the enqueue fails, so the next tick retries", async () => {
    // The ordering rule that makes the ledger honest. The claim commits BEFORE the enqueue,
    // so a failed enqueue must delete it — otherwise the ledger permanently says "delivered"
    // for a reminder nobody received, and no later sweep will ever try again.
    await seedEvent(15);
    await seedReminder(-15);

    const broken = {
      send: () => Promise.reject(new Error("queue unavailable")),
    } as unknown as PgBoss;

    await expect(runSweep(broken)).rejects.toThrow("queue unavailable");
    expect(await deliveries()).toHaveLength(0);

    // And the retry succeeds, because nothing was left claiming it.
    expect(await runSweep(boss)).toBe(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it("sweeps a recurring master's next occurrence", async () => {
    await seedEvent(15);
    await db.execute(
      sql`UPDATE calendar_events SET rrule = 'FREQ=DAILY' WHERE id = ${EVENT_ID}::uuid`,
    );
    await seedReminder(-15);

    expect(await runSweep(boss)).toBe(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it("prunes delivery rows past the retention window, inside the sweep", async () => {
    // Retention lives here rather than in the nightly cleanup handler: a project that
    // followed remove-it.md and dropped this table would otherwise leave that handler
    // throwing `relation does not exist` every night forever.
    await seedEvent(15);
    const reminderId = await seedReminder(-15);
    await db
      .insert(calendarReminderDeliveries)
      .values({ reminderId, occurrenceStartAt: new Date("2020-01-01T00:00:00Z") });
    await db.execute(
      sql`UPDATE calendar_reminder_deliveries SET created_at = now() - interval '91 days'`,
    );

    await runSweep(boss);

    const rows = await deliveries();
    expect(rows).toHaveLength(1); // the fresh claim, not the ancient row
    expect(rows[0]?.occurrenceStartAt.getTime()).toBeGreaterThan(Date.UTC(2026, 0, 1));
  });
});
