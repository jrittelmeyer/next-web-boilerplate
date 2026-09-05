import {
  calendarEventReminders,
  calendarReminderDeliveries,
  calendars,
  db,
  type NewCalendarEventReminder,
  user,
} from "@repo/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Reminder integrity, against a REAL Postgres (Phase 5).
 *
 * Same posture as its three siblings: where a rule is enforced by the database, the write
 * goes in **around** the application writer so the constraint is what refuses it, and the
 * assertion names the constraint rather than matching a message — drizzle keeps the name on
 * `err.cause`, so `rejects.toThrow(/message/)` would pass for any constraint at all.
 *
 * The centre of this file is the **dedupe ledger under real concurrency**. It is not one
 * assertion among many: `unique(reminder_id, occurrence_start_at)` plus
 * `INSERT … ON CONFLICT DO NOTHING RETURNING id` is the *entire* mechanism that stops two
 * workers, two overlapping sweeps, or a missed-tick backlog from sending the same reminder
 * twice. A mocked `ON CONFLICT` in a unit test proves nothing about it, which is why the
 * race is exercised here on two real pooled connections.
 *
 * Context: docs/context/calendar/reminders.md.
 */

const TEST_OWNER = {
  id: "integration-test-reminders-owner",
  name: "Integration Test Reminders Owner",
  email: "integration-test-reminders-owner@example.com",
  emailVerified: true,
} as const;

const OTHER_USER = {
  id: "integration-test-reminders-other",
  name: "Integration Test Reminders Other",
  email: "integration-test-reminders-other@example.com",
  emailVerified: true,
} as const;

const CALENDAR_ID = "dddddddd-1111-4222-8333-000000000001";
const EVENT_ID = "dddddddd-1111-4222-8333-000000000010";
const SECOND_EVENT_ID = "dddddddd-1111-4222-8333-000000000011";

const EVENT_WALL = "2027-05-10 09:00:00";
/** Two distinct occurrence instants. Fixed, never derived from `now()`. */
const FIRST_OCCURRENCE = new Date("2027-05-10T09:00:00Z");
const SECOND_OCCURRENCE = new Date("2027-05-17T09:00:00Z");

async function cleanup() {
  // calendars.user_id cascades to calendar_events, which cascades to
  // calendar_event_reminders, which cascades to calendar_reminder_deliveries — so deleting
  // the two users is the whole cleanup, and that chain is itself one of the assertions below.
  for (const id of [TEST_OWNER.id, OTHER_USER.id]) {
    await db.delete(user).where(eq(user.id, id));
  }
}

/**
 * A UTC event at offset 0, so `calendar_events_start_at_derived` holds trivially without the
 * application writer. That constraint is `calendar-events.test.ts`'s subject; here it is
 * scaffolding, exactly as in its two siblings.
 */
async function insertRawEvent(id: string, uid: string) {
  await db.execute(sql`
    INSERT INTO calendar_events
      (id, calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
       end_wall, end_tzid, end_offset_minutes, end_at)
    VALUES (
      ${id}::uuid, ${CALENDAR_ID}::uuid, ${uid}, ${uid},
      ${EVENT_WALL}::timestamp, 'UTC', 0, (${EVENT_WALL}::timestamp AT TIME ZONE 'UTC'),
      ${EVENT_WALL}::timestamp, 'UTC', 0, (${EVENT_WALL}::timestamp AT TIME ZONE 'UTC')
    )
  `);
}

async function seed() {
  await db.insert(user).values([TEST_OWNER, OTHER_USER]);
  await db.insert(calendars).values({
    id: CALENDAR_ID,
    userId: TEST_OWNER.id,
    name: "Reminders",
    color: "chart-1",
    timeZone: "UTC",
  });
  await insertRawEvent(EVENT_ID, "reminders-event-uid");
  await insertRawEvent(SECOND_EVENT_ID, "reminders-second-uid");
}

/** Re-throws with the violated constraint's NAME, which drizzle keeps on `err.cause`. */
async function surfaceConstraint<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    const cause = (err as { cause?: { constraint?: string; column?: string } }).cause;
    const name = cause?.constraint ?? cause?.column;
    if (!name) throw err;
    throw new Error(name, { cause: err });
  }
}

const BASE_RULE = {
  eventId: EVENT_ID,
  userId: TEST_OWNER.id,
  channel: "email",
  anchor: "start",
  offsetMinutes: -15,
} as const;

/** The sweeper's exact claim statement — the only way a delivery is ever created. */
async function claimDelivery(reminderId: string, occurrenceStartAt: Date) {
  const claimed = await db
    .insert(calendarReminderDeliveries)
    .values({ reminderId, occurrenceStartAt })
    .onConflictDoNothing()
    .returning({ id: calendarReminderDeliveries.id });
  return claimed;
}

async function insertRule(overrides: Partial<NewCalendarEventReminder> = {}) {
  const [row] = await db
    .insert(calendarEventReminders)
    .values({ ...BASE_RULE, ...overrides })
    .returning({ id: calendarEventReminders.id });
  if (!row) throw new Error("insertRule returned no row");
  return row.id;
}

beforeEach(async () => {
  await cleanup();
  await seed();
});

afterAll(cleanup);

describe("the rule key", () => {
  it("refuses a second identical rule on the same event for the same user", async () => {
    // What makes the editor's diff expressible as "leave this row strictly alone". A
    // delete-and-reinsert would orphan the delivery ledger below and re-send every reminder
    // the user had already received.
    await insertRule();
    await expect(surfaceConstraint(insertRule())).rejects.toThrow(
      "calendar_event_reminders_rule_key",
    );
  });

  it("accepts rules differing in any single component", async () => {
    await insertRule();
    // Each of these is a genuinely different reminder, and a key that collapsed any of them
    // would silently drop a rule the user asked for.
    await insertRule({ offsetMinutes: -30 });
    await insertRule({ channel: "in-app" });
    await insertRule({ userId: OTHER_USER.id });
    await insertRule({ eventId: SECOND_EVENT_ID });

    const rows = await db.select().from(calendarEventReminders);
    expect(rows).toHaveLength(5);
  });
});

describe("per-user scoping — a shared event (predicate-sensor long tail)", () => {
  /**
   * `calendar.byId`'s reminders read, restated (the router lives in `apps/web`, which this
   * package cannot depend on — same constraint the attendees suite documents). Takes the
   * `userId` conjunct as a parameter so the same helper serves the correct query and the
   * planted defect below.
   */
  async function existingRulesFor(userId: string, scoped: boolean) {
    return await db
      .select({ id: calendarEventReminders.id })
      .from(calendarEventReminders)
      .where(
        scoped
          ? and(
              eq(calendarEventReminders.eventId, EVENT_ID),
              eq(calendarEventReminders.userId, userId),
            )
          : eq(calendarEventReminders.eventId, EVENT_ID),
      );
  }

  /**
   * `applyReminders`'s destructive tip, restated: given whatever the "existing" read
   * returned, an empty submission keeps nothing, so every row that read saw is `removed`
   * and gets deleted. This is `diffReminders`'s shape with the identity check skipped —
   * legitimate here because the submission is empty, so every existing id is unkept
   * regardless of key. What matters is which rows the "existing" read handed in.
   */
  async function saveEmptyReminderList(existing: { id: string }[]) {
    if (existing.length === 0) return;
    await db.delete(calendarEventReminders).where(
      inArray(
        calendarEventReminders.id,
        existing.map((row) => row.id),
      ),
    );
  }

  beforeEach(async () => {
    await insertRule({ userId: TEST_OWNER.id });
    await insertRule({ userId: OTHER_USER.id, offsetMinutes: -30 });
  });

  it("reads only the caller's own rule off a shared event", async () => {
    // The read `calendar.ts:593-598` performs. Without the `userId` conjunct, the
    // composer would seed its editor from BOTH attendees' rules.
    const mine = await existingRulesFor(TEST_OWNER.id, true);
    expect(mine).toHaveLength(1);
  });

  it("sees both rules under the spelling without the `userId` conjunct — the composer's blind spot", async () => {
    // The planted defect. Nothing here is destructive yet; this is what the read alone
    // would hand the composer if the conjunct were dropped.
    const both = await existingRulesFor(TEST_OWNER.id, false);
    expect(both).toHaveLength(2);
  });

  it("an empty save deletes only the caller's own rule", async () => {
    // `calendar.ts:668-670`, correctly scoped: the owner clearing their reminders never
    // touches a co-attendee's row on the same event.
    const existing = await existingRulesFor(TEST_OWNER.id, true);
    await saveEmptyReminderList(existing);

    const remaining = await db
      .select({ userId: calendarEventReminders.userId })
      .from(calendarEventReminders)
      .where(eq(calendarEventReminders.eventId, EVENT_ID));
    expect(remaining).toEqual([{ userId: OTHER_USER.id }]);
  });

  it("a save under the unscoped read deletes what the caller never saw", async () => {
    // The defect, planted (the row's own "destructive gap"). The owner clears a list they
    // were shown as their own reminders — but because the "existing" read carried no
    // `userId` conjunct, it included the co-attendee's rule too, and the empty submission
    // marks it `removed` right alongside. The composer never rendered it, and the
    // co-attendee never asked for it to go.
    const existing = await existingRulesFor(TEST_OWNER.id, false);
    await saveEmptyReminderList(existing);

    const remaining = await db.select().from(calendarEventReminders);
    expect(remaining).toHaveLength(0);
  });
});

describe("the column constraints", () => {
  it("rejects an offset beyond ±366 days", async () => {
    // The bound is what keeps the sweeper's expansion window finite: an unbounded offset
    // means an unbounded window, and the recurring branch would expand across centuries.
    await expect(surfaceConstraint(insertRule({ offsetMinutes: -527_041 }))).rejects.toThrow(
      "calendar_event_reminders_offset_bounded",
    );
    await expect(surfaceConstraint(insertRule({ offsetMinutes: 527_041 }))).rejects.toThrow(
      "calendar_event_reminders_offset_bounded",
    );
  });

  it("accepts both signs at exactly the bound", async () => {
    await insertRule({ offsetMinutes: -527_040 });
    await insertRule({ offsetMinutes: 527_040 });
    expect(await db.select().from(calendarEventReminders)).toHaveLength(2);
  });

  it("rejects the end anchor until Phase 6 builds its expansion", async () => {
    // Not caution: `expandSeries` windows on an occurrence's START instant by default and
    // the sweeper takes that default, so an
    // end-anchored reminder on a recurring series would silently never fire. The CHECK is
    // what makes that unreachable rather than merely undocumented.
    await expect(
      surfaceConstraint(db.insert(calendarEventReminders).values({ ...BASE_RULE, anchor: "end" })),
    ).rejects.toThrow("calendar_event_reminders_anchor_supported");
  });
});

describe("the cascades", () => {
  it("drops reminders when the event goes", async () => {
    await insertRule();
    await db.execute(sql`DELETE FROM calendar_events WHERE id = ${EVENT_ID}::uuid`);
    expect(await db.select().from(calendarEventReminders)).toHaveLength(0);
  });

  it("drops reminders when the user goes", async () => {
    // The reason this column cascades where `calendar_event_attendees.user_id` nulls: an
    // attendee with no account degrades into an external guest the organizer still needs to
    // see, but a reminder with no user has no inbox and no feed — it would be swept forever
    // and delivered nowhere.
    await insertRule({ userId: OTHER_USER.id });
    await db.delete(user).where(eq(user.id, OTHER_USER.id));
    expect(await db.select().from(calendarEventReminders)).toHaveLength(0);
  });

  it("drops deliveries when the rule goes", async () => {
    const reminderId = await insertRule();
    await claimDelivery(reminderId, FIRST_OCCURRENCE);
    await db.delete(calendarEventReminders).where(eq(calendarEventReminders.id, reminderId));
    expect(await db.select().from(calendarReminderDeliveries)).toHaveLength(0);
  });
});

describe("the dedupe ledger", () => {
  it("claims once per occurrence and returns nothing on the second attempt", async () => {
    const reminderId = await insertRule();

    const first = await claimDelivery(reminderId, FIRST_OCCURRENCE);
    const second = await claimDelivery(reminderId, FIRST_OCCURRENCE);

    // A returned row IS the claim — the sweeper sends only when it gets one.
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("treats each occurrence of a series as its own claim", async () => {
    const reminderId = await insertRule();
    expect(await claimDelivery(reminderId, FIRST_OCCURRENCE)).toHaveLength(1);
    expect(await claimDelivery(reminderId, SECOND_OCCURRENCE)).toHaveLength(1);
  });

  it("re-claims when an occurrence MOVES — the reason the key is an instant", async () => {
    // The falsifying case for keying on `recurrence_id` instead. A rescheduled occurrence
    // keeps its recurrence_id and would be suppressed here; it gets a new instant, so the
    // reminder fires again at the new time. This is the behaviour live-verify drives by hand.
    const reminderId = await insertRule();
    await claimDelivery(reminderId, FIRST_OCCURRENCE);

    const moved = new Date("2027-05-10T14:00:00Z");
    expect(await claimDelivery(reminderId, moved)).toHaveLength(1);
  });

  it("lets exactly ONE of two concurrent sweeps claim the same occurrence", async () => {
    // THE test. Two pooled connections race the identical statement; the unique index is the
    // only arbiter. Without it both sweeps send, and the user gets every reminder twice —
    // the failure mode a single-worker test can never reveal.
    const reminderId = await insertRule();

    const results = await Promise.all([
      claimDelivery(reminderId, FIRST_OCCURRENCE),
      claimDelivery(reminderId, FIRST_OCCURRENCE),
      claimDelivery(reminderId, FIRST_OCCURRENCE),
    ]);

    const winners = results.filter((rows) => rows.length === 1);
    expect(winners).toHaveLength(1);
    expect(await db.select().from(calendarReminderDeliveries)).toHaveLength(1);
  });
});
