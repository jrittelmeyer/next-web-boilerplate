import { calendarEvents, calendarRecurrenceDates, calendars, db, user } from "@repo/db";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Recurrence integrity, against a REAL Postgres.
 *
 * Same posture as `calendar-events.test.ts`: every negative case writes through **raw
 * SQL that bypasses the application writer**, because a test that reproduces the
 * writer's own logic and then checks the writer agrees with itself cannot fail.
 *
 * What is under test here is the *split of responsibility* migration `0021` settles.
 * Exactly one of the three override-integrity rules is enforced by the database — an
 * override lives in its master's calendar, by composite FK. The other two (an override
 * carries its master's `uid`; an override's parent is a recurring event) are cross-row
 * predicates a CHECK cannot express, so they are **detected and reported, never
 * blocked** — and the detection scans at the bottom are where that promise is kept.
 */

const TEST_OWNER = {
  id: "integration-test-recurrence-owner",
  name: "Integration Test Recurrence Owner",
  email: "integration-test-recurrence-owner@example.com",
  emailVerified: true,
} as const;

const CALENDAR_ID = "11111111-2222-4333-8444-000000000001";
const OTHER_CALENDAR_ID = "11111111-2222-4333-8444-000000000002";
const MASTER_ID = "11111111-2222-4333-8444-000000000010";
const MASTER_UID = "master-uid";

/** An occurrence of the weekly master seeded below. */
const OCCURRENCE = "2027-03-22 09:00:00";

async function cleanup() {
  // calendars.user_id cascades to calendar_events, which cascades to
  // calendar_recurrence_dates — so deleting the owner is the only cleanup needed.
  await db.delete(user).where(eq(user.id, TEST_OWNER.id));
}

/**
 * A UTC event at offset 0, so `start_at = start_wall AT TIME ZONE 'UTC'` holds
 * trivially and the derived-instant CHECK is satisfied without the application writer.
 * That constraint is `calendar-events.test.ts`'s subject; here it is scaffolding.
 */
async function insertRaw(values: {
  id?: string;
  calendarId?: string;
  uid: string;
  wall: string;
  rrule?: string | null;
  parentId?: string | null;
  recurrenceId?: string | null;
}) {
  await db.execute(sql`
    INSERT INTO calendar_events
      (id, calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
       end_wall, end_tzid, end_offset_minutes, end_at, rrule,
       recurrence_parent_id, recurrence_id)
    VALUES (
      COALESCE(${values.id ?? null}::uuid, gen_random_uuid()),
      ${values.calendarId ?? CALENDAR_ID}::uuid,
      ${values.uid}, ${values.uid},
      ${values.wall}::timestamp, 'UTC', 0, (${values.wall}::timestamp AT TIME ZONE 'UTC'),
      ${values.wall}::timestamp, 'UTC', 0, (${values.wall}::timestamp AT TIME ZONE 'UTC'),
      ${values.rrule ?? null},
      ${values.parentId ?? null}::uuid,
      ${values.recurrenceId ?? null}::timestamp
    )
  `);
}

async function seed() {
  await db.insert(user).values(TEST_OWNER);
  await db.insert(calendars).values([
    { id: CALENDAR_ID, userId: TEST_OWNER.id, name: "Series", color: "chart-1", timeZone: "UTC" },
    {
      id: OTHER_CALENDAR_ID,
      userId: TEST_OWNER.id,
      name: "Other",
      color: "chart-2",
      timeZone: "UTC",
    },
  ]);
  await insertRaw({
    id: MASTER_ID,
    uid: MASTER_UID,
    wall: "2027-03-15 09:00:00",
    rrule: "FREQ=WEEKLY;BYDAY=MO",
  });
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

beforeEach(async () => {
  await cleanup();
  await seed();
});

afterAll(cleanup);

describe("calendar_events_parent_same_calendar — the composite self-FK", () => {
  it("refuses an override in a different calendar from its master", async () => {
    // Without this constraint the row inserts happily, and `updateEvent` has always
    // accepted a calendar change — so the moment overrides exist, that path strands
    // them. Asserted by NAME: drizzle does not put it in the message, so a
    // `toThrow(/./)` here would pass for any failure at all.
    await expect(
      surfaceConstraint(
        insertRaw({
          calendarId: OTHER_CALENDAR_ID,
          uid: MASTER_UID,
          wall: OCCURRENCE,
          parentId: MASTER_ID,
          recurrenceId: OCCURRENCE,
        }),
      ),
    ).rejects.toThrow("calendar_events_parent_same_calendar");
  });

  it("accepts an override in the SAME calendar", async () => {
    await expect(
      insertRaw({
        uid: MASTER_UID,
        wall: OCCURRENCE,
        parentId: MASTER_ID,
        recurrenceId: OCCURRENCE,
      }),
    ).resolves.not.toThrow();
  });

  it("ON UPDATE CASCADE moves every override when the master changes calendar", async () => {
    for (const day of ["2027-03-22", "2027-03-29", "2027-04-05"]) {
      await insertRaw({
        uid: MASTER_UID,
        wall: `${day} 09:00:00`,
        parentId: MASTER_ID,
        recurrenceId: `${day} 09:00:00`,
      });
    }

    // The half that earns a constraint rather than a writer rule: the calendar move
    // becomes correct BY CONSTRUCTION, not by anyone remembering to write the second
    // UPDATE.
    await db
      .update(calendarEvents)
      .set({ calendarId: OTHER_CALENDAR_ID })
      .where(eq(calendarEvents.id, MASTER_ID));

    const moved = await db
      .select({ id: calendarEvents.id, calendarId: calendarEvents.calendarId })
      .from(calendarEvents)
      .where(eq(calendarEvents.recurrenceParentId, MASTER_ID));
    expect(moved).toHaveLength(3);
    expect(moved.every((row) => row.calendarId === OTHER_CALENDAR_ID)).toBe(true);
  });

  it("ON DELETE CASCADE still removes the overrides with their master", async () => {
    await insertRaw({
      uid: MASTER_UID,
      wall: OCCURRENCE,
      parentId: MASTER_ID,
      recurrenceId: OCCURRENCE,
    });
    await db.delete(calendarEvents).where(eq(calendarEvents.id, MASTER_ID));
    const left = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(eq(calendarEvents.calendarId, CALENDAR_ID));
    expect(left).toEqual([]);
  });
});

describe("calendar_recurrence_dates — idempotent by constraint", () => {
  it("accepts the same skip twice under ON CONFLICT DO NOTHING", async () => {
    // The deciding argument for rows over a jsonb array. As an array element this is
    // read-modify-write, so two users skipping two different occurrences in the same
    // second silently resurrect one.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await db
        .insert(calendarRecurrenceDates)
        .values({ eventId: MASTER_ID, kind: "exdate", dateWall: OCCURRENCE })
        .onConflictDoNothing();
    }
    const rows = await db
      .select({ id: calendarRecurrenceDates.id })
      .from(calendarRecurrenceDates)
      .where(eq(calendarRecurrenceDates.eventId, MASTER_ID));
    expect(rows).toHaveLength(1);
  });

  it("keeps an EXDATE and an RDATE on the same instant apart", async () => {
    // `kind` is part of the unique, so "skip this" and "add this" are different facts
    // about the same date rather than one row overwriting the other.
    await db.insert(calendarRecurrenceDates).values([
      { eventId: MASTER_ID, kind: "exdate", dateWall: OCCURRENCE },
      { eventId: MASTER_ID, kind: "rdate", dateWall: OCCURRENCE },
    ]);
    const rows = await db
      .select({ kind: calendarRecurrenceDates.kind })
      .from(calendarRecurrenceDates)
      .where(eq(calendarRecurrenceDates.eventId, MASTER_ID));
    expect(rows.map((row) => row.kind).sort()).toEqual(["exdate", "rdate"]);
  });

  it("rejects a duplicate outright when nothing catches the conflict", async () => {
    await db
      .insert(calendarRecurrenceDates)
      .values({ eventId: MASTER_ID, kind: "exdate", dateWall: OCCURRENCE });
    await expect(
      surfaceConstraint(
        db
          .insert(calendarRecurrenceDates)
          .values({ eventId: MASTER_ID, kind: "exdate", dateWall: OCCURRENCE }),
      ),
    ).rejects.toThrow("calendar_recurrence_dates_event_id_kind_date_wall_key");
  });
});

describe("soft-deleting a master orphans its overrides — the writer's obligation", () => {
  it("leaves them in the range query's concrete branch when the writer forgets", async () => {
    // MEASURED, and the reason `deleteEvent` runs two UPDATEs in one transaction. An
    // override matches `rrule IS NULL AND deleted_at IS NULL` exactly, so the grid
    // keeps painting the occurrences of a deleted series. Postgres could enforce this
    // with a trigger and deliberately does not: the schema enforces invariants, not
    // behaviour — which makes this a test of the hazard, not of a guard.
    for (const day of ["2027-03-22", "2027-03-29"]) {
      await insertRaw({
        uid: MASTER_UID,
        wall: `${day} 09:00:00`,
        parentId: MASTER_ID,
        recurrenceId: `${day} 09:00:00`,
      });
    }
    await db
      .update(calendarEvents)
      .set({ deletedAt: new Date() })
      .where(eq(calendarEvents.id, MASTER_ID));

    const concrete = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.calendarId, CALENDAR_ID),
          isNull(calendarEvents.rrule),
          isNull(calendarEvents.deletedAt),
        ),
      );
    expect(concrete).toHaveLength(2);
  });

  it("hides them once the writer soft-deletes both, as `deleteEvent` does", async () => {
    for (const day of ["2027-03-22", "2027-03-29"]) {
      await insertRaw({
        uid: MASTER_UID,
        wall: `${day} 09:00:00`,
        parentId: MASTER_ID,
        recurrenceId: `${day} 09:00:00`,
      });
    }
    const deletedAt = new Date();
    await db.transaction(async (tx) => {
      await tx.update(calendarEvents).set({ deletedAt }).where(eq(calendarEvents.id, MASTER_ID));
      await tx
        .update(calendarEvents)
        .set({ deletedAt })
        .where(eq(calendarEvents.recurrenceParentId, MASTER_ID));
    });

    const concrete = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.calendarId, CALENDAR_ID),
          isNull(calendarEvents.rrule),
          isNull(calendarEvents.deletedAt),
        ),
      );
    expect(concrete).toEqual([]);
  });
});

describe("a series split — the uid rewrite, positively", () => {
  const NEW_MASTER_ID = "11111111-2222-4333-8444-000000000020";
  const NEW_MASTER_UID = "new-master-uid";

  it("re-parents the overrides at or after the cut AND rewrites their uid", async () => {
    for (const day of ["2027-03-22", "2027-03-29", "2027-04-05"]) {
      await insertRaw({
        uid: MASTER_UID,
        wall: `${day} 09:00:00`,
        parentId: MASTER_ID,
        recurrenceId: `${day} 09:00:00`,
      });
    }
    await insertRaw({
      id: NEW_MASTER_ID,
      uid: NEW_MASTER_UID,
      wall: "2027-03-29 09:00:00",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });

    // Both columns in one UPDATE, which is exactly what `splitSeries` does. Doing only
    // the re-parent manufactures the corruption the schema leaves writer-enforced, and
    // the detection scan below reports without blocking — so nothing else stops it.
    await db
      .update(calendarEvents)
      .set({ recurrenceParentId: NEW_MASTER_ID, uid: NEW_MASTER_UID })
      .where(
        and(
          eq(calendarEvents.recurrenceParentId, MASTER_ID),
          sql`${calendarEvents.recurrenceId} >= '2027-03-29 09:00:00'::timestamp`,
        ),
      );

    const rows = await db
      .select({
        uid: calendarEvents.uid,
        parentId: calendarEvents.recurrenceParentId,
        recurrenceId: calendarEvents.recurrenceId,
      })
      .from(calendarEvents)
      .where(isNotNull(calendarEvents.recurrenceParentId));

    // Positive, not a passive scan: every override's uid equals its NEW parent's.
    for (const row of rows) {
      expect(row.uid).toBe(row.parentId === NEW_MASTER_ID ? NEW_MASTER_UID : MASTER_UID);
    }
    expect(rows.filter((row) => row.parentId === NEW_MASTER_ID)).toHaveLength(2);
  });

  it("does not collide with calendar_events_calendar_id_uid_recurrence_id_key", async () => {
    // NULLS NOT DISTINCT, so two masters sharing a uid with a NULL recurrence_id would
    // conflict. The split's new master takes a NEW uid — which is also why a
    // subscriber does not see one series split into two events at the same UID.
    await insertRaw({
      id: NEW_MASTER_ID,
      uid: NEW_MASTER_UID,
      wall: "2027-03-29 09:00:00",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });
    await expect(
      surfaceConstraint(
        insertRaw({ uid: MASTER_UID, wall: "2027-05-03 09:00:00", rrule: "FREQ=WEEKLY" }),
      ),
    ).rejects.toThrow("calendar_events_calendar_id_uid_recurrence_id_key");
  });
});

describe("the override-suppression scan's index", () => {
  it("is an Index Only Scan on calendar_events_override_idx, with no heap fetches", async () => {
    // 400 masters × 9 overrides across 20 calendars. Both halves matter: too few rows
    // and Postgres correctly prefers a sequential scan, and with every row on one
    // calendar the index's leading column would have no selectivity.
    await db.execute(sql`
      INSERT INTO calendars (user_id, name, color, time_zone)
      SELECT ${TEST_OWNER.id}, 'bulk-cal-' || g, 'chart-1', 'UTC' FROM generate_series(1, 18) g
    `);
    await db.execute(sql`
      WITH cals AS (
        SELECT id, (row_number() OVER (ORDER BY name)) - 1 AS n
        FROM calendars WHERE user_id = ${TEST_OWNER.id}
      )
      INSERT INTO calendar_events
        (calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
         end_wall, end_tzid, end_offset_minutes, end_at, rrule)
      SELECT c.id, 'bulk-master-' || g, 'bulk',
             '2027-01-01 09:00:00'::timestamp, 'UTC', 0, '2027-01-01 09:00:00+00'::timestamptz,
             '2027-01-01 10:00:00'::timestamp, 'UTC', 0, '2027-01-01 10:00:00+00'::timestamptz,
             'FREQ=WEEKLY'
      FROM generate_series(1, 400) g
      JOIN cals c ON c.n = g % 20
    `);
    await db.execute(sql`
      WITH masters AS (
        SELECT e.id, e.calendar_id, e.uid FROM calendar_events e
        JOIN calendars c ON c.id = e.calendar_id
        WHERE c.user_id = ${TEST_OWNER.id} AND e.uid LIKE 'bulk-master-%'
      )
      INSERT INTO calendar_events
        (calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
         end_wall, end_tzid, end_offset_minutes, end_at,
         recurrence_parent_id, recurrence_id)
      SELECT m.calendar_id, m.uid, 'ovr',
             '2027-01-01 09:00:00'::timestamp + (g || ' days')::interval, 'UTC', 0,
             '2027-01-01 09:00:00+00'::timestamptz + (g || ' days')::interval,
             '2027-01-01 10:00:00'::timestamp + (g || ' days')::interval, 'UTC', 0,
             '2027-01-01 10:00:00+00'::timestamptz + (g || ' days')::interval,
             m.id, '2027-01-01 09:00:00'::timestamp + (g || ' days')::interval
      FROM masters m, generate_series(1, 9) g
    `);

    // ⚠️ VACUUM, not just ANALYZE, and the reason is the assertion below. Measured: on
    // a freshly-inserted ANALYZEd-but-not-VACUUMed table the planner still chooses
    // `Index Only Scan` — but reports **563 heap fetches instead of 0**, because the
    // visibility map is unset. Without this line the test would pin a node type whose
    // defining property is absent, which is worse than not asserting it.
    await db.execute(sql`VACUUM (ANALYZE) calendar_events`);

    const parents = await db.execute(sql`
      SELECT e.id FROM calendar_events e
      JOIN calendars c ON c.id = e.calendar_id
      WHERE c.user_id = ${TEST_OWNER.id} AND e.uid LIKE 'bulk-master-%' LIMIT 20
    `);
    const ids = (parents.rows as { id: string }[]).map((row) => row.id);

    // The query `calendar.range` runs: no calendar_id predicate (measured: +42% index
    // size for noise, and the composite FK makes it redundant) and no deleted_at
    // predicate (a soft-deleted override still means the occurrence is not a plain
    // one). Index-side buffers went 1,971 → 15 at 22,400 rows; that number lives in
    // this comment, not in an assertion — a measurement is not an invariant.
    const plan = await db.execute(sql`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT recurrence_parent_id, recurrence_id FROM calendar_events
      WHERE recurrence_parent_id = ANY(${sql.raw(`ARRAY['${ids.join("','")}']::uuid[]`)})
        AND recurrence_id BETWEEN '2026-12-31 00:00:00'::timestamp
                              AND '2027-01-31 00:00:00'::timestamp
    `);
    const text = JSON.stringify(plan.rows ?? plan);
    expect(text).not.toMatch(/"Node Type":"Seq Scan"/);
    expect(text).toMatch(/calendar_events_override_idx/);
    expect(text).toMatch(/"Node Type":"Index Only Scan"/);
    expect(text).toMatch(/"Heap Fetches":0/);
  });
});

describe("the two writer-enforced invariants — detected, never blocked", () => {
  it("names an override whose uid disagrees with its master's", async () => {
    await insertRaw({
      uid: MASTER_UID,
      wall: OCCURRENCE,
      parentId: MASTER_ID,
      recurrenceId: OCCURRENCE,
    });
    // Planted: the exact corruption a split without the uid rewrite leaves behind.
    // Postgres accepts it — it is a cross-row predicate no CHECK can express.
    await insertRaw({
      uid: "divergent-uid",
      wall: "2027-03-29 09:00:00",
      parentId: MASTER_ID,
      recurrenceId: "2027-03-29 09:00:00",
    });

    const drifted = await db.execute(sql`
      SELECT child.uid FROM calendar_events child
      JOIN calendar_events parent ON parent.id = child.recurrence_parent_id
      WHERE child.calendar_id = ${CALENDAR_ID}::uuid AND child.uid <> parent.uid
    `);
    // Reported, not refused. A guard that can make an existing row un-editable is
    // worse than the drift it prevents — the same posture the offset-drift scan takes.
    expect((drifted.rows as { uid: string }[]).map((row) => row.uid)).toEqual(["divergent-uid"]);
  });

  it("names an override whose parent does not repeat", async () => {
    await insertRaw({
      id: "11111111-2222-4333-8444-000000000030",
      uid: "one-off",
      wall: "2027-05-03 09:00:00",
    });
    await insertRaw({
      uid: "one-off",
      wall: "2027-05-10 09:00:00",
      parentId: "11111111-2222-4333-8444-000000000030",
      recurrenceId: "2027-05-10 09:00:00",
    });

    const orphaned = await db.execute(sql`
      SELECT child.uid FROM calendar_events child
      JOIN calendar_events parent ON parent.id = child.recurrence_parent_id
      WHERE child.calendar_id = ${CALENDAR_ID}::uuid AND parent.rrule IS NULL
    `);
    expect((orphaned.rows as { uid: string }[]).map((row) => row.uid)).toEqual(["one-off"]);
  });
});
