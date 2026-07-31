import { deriveEventInstants } from "@repo/calendar";
import { calendarEventMasters, calendarEvents, calendars, db, user } from "@repo/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The derived-instant invariant, against a REAL Postgres.
 *
 * **This suite exists because the obvious version of it is a tautology.** A test
 * that recomputes `deriveEventInstants()` for every row and compares it to rows that
 * were written by `deriveEventInstants()` cannot fail — it asserts a function equals
 * itself. This repo has already shipped exactly that shape once (`MAINTENANCE.md`,
 * the `docs:sanity` wiring assertion that failed *open*). So the tests below write
 * through **raw SQL that bypasses the application writer entirely**, with
 * deliberately wrong values, and assert the database refuses them.
 *
 * The acceptance corpus is equally deliberate: it contains the cases that can
 * FALSIFY the design, not only the ones expected to pass. An earlier iteration of
 * this constraint re-derived the instant from `start_tzid` inside Postgres and
 * passed a 16-row corpus of modern dates — it was wrong for pre-1900 local mean
 * time, for two-hour DST transitions, and for fall-back overlaps, and none of those
 * were in the corpus.
 */

const TEST_OWNER = {
  id: "integration-test-calendar-owner",
  name: "Integration Test Calendar Owner",
  email: "integration-test-calendar-owner@example.com",
  emailVerified: true,
} as const;

const CALENDAR_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function cleanup() {
  // calendars.user_id and calendar_events.calendar_id both cascade, so deleting the
  // owner is the only cleanup needed.
  await db.delete(user).where(eq(user.id, TEST_OWNER.id));
}

async function seed() {
  await db.insert(user).values(TEST_OWNER);
  await db.insert(calendars).values({
    id: CALENDAR_ID,
    userId: TEST_OWNER.id,
    name: "Integration",
    color: "chart-1",
    timeZone: "UTC",
  });
}

/** The application write path, in full: derive, then insert what it produced. */
async function insertViaWriter(input: {
  uid: string;
  startWall: string;
  startTzid: string;
  endWall: string;
  endTzid: string;
  allDay?: boolean;
}) {
  const derived = deriveEventInstants(input);
  await surfaceConstraint(
    db.insert(calendarEvents).values({
      calendarId: CALENDAR_ID,
      uid: input.uid,
      title: input.uid,
      allDay: input.allDay ?? false,
      startWall: input.startWall,
      startTzid: input.startTzid,
      startOffsetMinutes: derived.startOffsetMinutes,
      startAt: new Date(derived.startAtMs),
      endWall: input.endWall,
      endTzid: input.endTzid,
      endOffsetMinutes: derived.endOffsetMinutes,
      endAt: new Date(derived.endAtMs),
    }),
  );
  return derived;
}

/**
 * Re-throws a rejected write with the violated constraint's NAME as the message.
 *
 * Drizzle wraps the driver error, so the constraint name is NOT in `err.message` —
 * it is on `err.cause`, the raw `pg` error carrying `.constraint` (and `.column` for
 * a not-null violation). Without this, every assertion below would match the generic
 * "Failed query: …" text and pass no matter WHICH constraint fired, which is the
 * same failed-open shape these tests exist to prevent.
 */
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

describe("calendar_events — the acceptance corpus", () => {
  // Each row is a zone whose behaviour breaks a DIFFERENT naive implementation. The
  // expectation is only that the database accepts what the writer produced; the
  // arithmetic itself is pinned in packages/calendar/src/derive.test.ts.
  it.each([
    ["plain, America/New_York", "2027-06-01 09:30:00", "America/New_York"],
    ["+13:45, Pacific/Chatham", "2027-06-01 09:30:00", "Pacific/Chatham"],
    ["+14:00, Pacific/Kiritimati", "2027-06-01 09:30:00", "Pacific/Kiritimati"],
    ["+05:30, Asia/Kolkata", "2027-06-01 09:30:00", "Asia/Kolkata"],
    // Fall-back overlaps at three different transition sizes. A guard with a fixed
    // ±1h tolerance accepted the first, sat exactly on the boundary for the second,
    // and REJECTED the third — a correct row refused by its own constraint.
    ["overlap 30m, Australia/Lord_Howe", "2027-04-04 01:45:00", "Australia/Lord_Howe"],
    ["overlap 60m, America/New_York", "2027-11-07 01:30:00", "America/New_York"],
    ["overlap 120m, Antarctica/Troll", "2027-10-31 01:30:00", "Antarctica/Troll"],
    // Spring-forward gaps, likewise at three sizes — Samoa skipped a whole day.
    ["gap 60m, America/New_York", "2027-03-14 02:30:00", "America/New_York"],
    ["gap 120m, Antarctica/Troll", "2027-03-28 01:30:00", "Antarctica/Troll"],
    ["gap 24h, Pacific/Apia", "2011-12-30 12:00:00", "Pacific/Apia"],
    // Pre-1900 local mean time. Kolkata's true offset is +05:21:10 and the engine
    // rounds the 10-second residue away by design, so a constraint that re-derived
    // from the zone id inside Postgres — which keeps the seconds — refused this row.
    ["LMT seconds, Asia/Kolkata 1885", "1885-06-01 09:30:00", "Asia/Kolkata"],
    // Zones whose transition lands ON midnight, so an all-day event's own start is
    // the ambiguous reading. America/New_York transitions at 02:00 and can never
    // exercise this.
    ["midnight transition, America/Santiago", "2027-09-05 00:00:00", "America/Santiago"],
    ["midnight transition, Asia/Beirut", "2027-03-28 00:00:00", "Asia/Beirut"],
    ["negative DST, Europe/Dublin", "2027-01-15 09:30:00", "Europe/Dublin"],
  ])("accepts %s", async (label, wall, tzid) => {
    await expect(
      insertViaWriter({
        uid: label,
        startWall: wall,
        startTzid: tzid,
        endWall: wall,
        endTzid: tzid,
      }),
    ).resolves.toBeDefined();
  });

  it("accepts an event whose ends are in different zones", async () => {
    await insertViaWriter({
      uid: "cross-zone flight",
      startWall: "2027-06-01 09:00:00",
      startTzid: "America/New_York",
      endWall: "2027-06-01 11:30:00",
      endTzid: "America/Los_Angeles",
    });
    const [row] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.uid, "cross-zone flight"));
    expect(row?.startOffsetMinutes).toBe(-240);
    expect(row?.endOffsetMinutes).toBe(-420);
  });
});

describe("calendar_events — the planted-defect tests", () => {
  /**
   * Every insert here goes through `db.execute(sql...)`, NOT through
   * `deriveEventInstants`. That is the whole point: these simulate the writers the
   * constraint exists to catch — a hand-written backfill, `db:seed`, a future admin
   * tool, a psql session.
   *
   * Only the START triple is corrupted; the end triple is always internally
   * consistent (UTC, offset 0). Corrupting both would make each row violate two
   * constraints at once, and Postgres reports whichever it evaluates first — so
   * every assertion below would be pinned to an implementation detail of constraint
   * ordering rather than to the defect it names.
   */
  async function plant(values: {
    uid: string;
    startWall: string;
    tzid: string;
    startOffsetMinutes: number | null;
    startAt: string;
  }) {
    const off =
      values.startOffsetMinutes === null ? sql`NULL` : sql`${values.startOffsetMinutes}::smallint`;
    return surfaceConstraint(
      db.execute(sql`
      INSERT INTO calendar_events
        (calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
         end_wall, end_tzid, end_offset_minutes, end_at)
      VALUES
        (${CALENDAR_ID}::uuid, ${values.uid}, ${values.uid},
         ${values.startWall}::timestamp, ${values.tzid}, ${off}, ${values.startAt}::timestamptz,
         '2027-11-08 00:00:00'::timestamp, 'UTC', 0, '2027-11-08 00:00:00+00'::timestamptz)
    `),
    );
  }

  it("rejects a naive instant — the wall clock pasted in as if it were UTC", async () => {
    await expect(
      plant({
        uid: "naive",
        startWall: "2027-06-01 09:30:00",
        tzid: "America/New_York",
        startOffsetMinutes: -240,
        startAt: "2027-06-01 09:30:00+00",
      }),
    ).rejects.toThrow(/calendar_events_start_at_derived/);
  });

  it("rejects a naive instant in a +1h zone — only 3600s wrong, which a tolerance window would have let through", async () => {
    await expect(
      plant({
        uid: "naive-london",
        startWall: "2027-06-01 09:30:00",
        tzid: "Europe/London",
        startOffsetMinutes: 60,
        startAt: "2027-06-01 09:30:00+00",
      }),
    ).rejects.toThrow(/calendar_events_start_at_derived/);
  });

  it("rejects a fall-back overlap resolved to the WRONG branch", async () => {
    // 01:30 on this date happens twice in New York. The policy is `compatible` —
    // the EARLIER instant, 05:30Z at offset -240. This row claims that offset but
    // stores the later instant. Only the stored offset can tell the two apart: a
    // constraint that re-derived from the zone id would accept it, because both
    // instants are legitimate readings of that civil time.
    await expect(
      plant({
        uid: "wrong-overlap-branch",
        startWall: "2027-11-07 01:30:00",
        tzid: "America/New_York",
        startOffsetMinutes: -240,
        startAt: "2027-11-07 06:30:00+00",
      }),
    ).rejects.toThrow(/calendar_events_start_at_derived/);
  });

  it("rejects a stale instant — the wall clock was edited, the cache was not", async () => {
    await expect(
      plant({
        uid: "stale",
        startWall: "2027-06-01 10:30:00",
        tzid: "America/New_York",
        startOffsetMinutes: -240,
        startAt: "2027-06-01 13:30:00+00",
      }),
    ).rejects.toThrow(/calendar_events_start_at_derived/);
  });

  it("rejects an instant that is off by a single second", async () => {
    await expect(
      plant({
        uid: "off-by-one-second",
        startWall: "2027-06-01 09:30:00",
        tzid: "America/New_York",
        startOffsetMinutes: -240,
        startAt: "2027-06-01 13:30:01+00",
      }),
    ).rejects.toThrow(/calendar_events_start_at_derived/);
  });

  it("rejects the classic post-transition one-hour shift", async () => {
    await expect(
      plant({
        uid: "dst-shifted",
        startWall: "2027-06-01 09:30:00",
        tzid: "America/New_York",
        startOffsetMinutes: -240,
        startAt: "2027-06-01 14:30:00+00",
      }),
    ).rejects.toThrow(/calendar_events_start_at_derived/);
  });

  it("rejects a writer that does not know the offset column exists", async () => {
    // NOT NULL with no DEFAULT is what makes this fail loudly. With a default, this
    // writer would have produced a plausible-looking row nobody ever questions.
    await expect(
      plant({
        uid: "no-offset",
        startWall: "2027-06-01 09:30:00",
        tzid: "America/New_York",
        startOffsetMinutes: null,
        startAt: "2027-06-01 13:30:00+00",
      }),
    ).rejects.toThrow(/start_offset_minutes/);
  });

  it("fires on UPDATE, not only INSERT", async () => {
    await insertViaWriter({
      uid: "update-target",
      startWall: "2027-06-01 09:30:00",
      startTzid: "America/New_York",
      endWall: "2027-06-01 10:30:00",
      endTzid: "America/New_York",
    });
    await expect(
      surfaceConstraint(
        db.execute(
          sql`UPDATE calendar_events SET start_wall = '2027-06-01 11:30:00'::timestamp WHERE uid = 'update-target'`,
        ),
      ),
    ).rejects.toThrow(/calendar_events_start_at_derived/);
  });
});

describe("calendar_events — the remaining constraints", () => {
  const base = {
    startWall: "2027-06-01 09:30:00",
    startTzid: "UTC",
    endWall: "2027-06-01 10:30:00",
    endTzid: "UTC",
  };

  it("rejects an end before the start", async () => {
    await expect(
      insertViaWriter({ ...base, uid: "backwards", endWall: "2027-06-01 08:30:00" }),
    ).rejects.toThrow(/calendar_events_end_not_before_start/);
  });

  it("bounds a span at 366 days, which is what licenses the window query's lower bound", async () => {
    await expect(
      insertViaWriter({ ...base, uid: "365d", endWall: "2028-05-31 09:30:00" }),
    ).resolves.toBeDefined();
    await expect(
      insertViaWriter({ ...base, uid: "too-long", endWall: "2028-07-01 09:30:00" }),
    ).rejects.toThrow(/calendar_events_span_bounded/);
  });

  it("requires an all-day event to sit on midnight at both ends", async () => {
    await expect(
      insertViaWriter({
        uid: "all-day ok",
        startWall: "2027-06-01 00:00:00",
        startTzid: "America/New_York",
        endWall: "2027-06-02 00:00:00",
        endTzid: "America/New_York",
        allDay: true,
      }),
    ).resolves.toBeDefined();
    await expect(insertViaWriter({ ...base, uid: "all-day bad", allDay: true })).rejects.toThrow(
      /calendar_events_all_day_midnight/,
    );
  });

  it("treats a NULL recurrence_id as equal for the UID unique — NULLS NOT DISTINCT", async () => {
    await insertViaWriter({ ...base, uid: "shared-uid" });
    await expect(insertViaWriter({ ...base, uid: "shared-uid" })).rejects.toThrow(
      /calendar_events_calendar_id_uid_recurrence_id_key/,
    );
  });

  it("requires recurrence_parent_id and recurrence_id to be set together", async () => {
    await expect(
      surfaceConstraint(
        db.execute(sql`
        INSERT INTO calendar_events
          (calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
           end_wall, end_tzid, end_offset_minutes, end_at, recurrence_parent_id)
        VALUES
          (${CALENDAR_ID}::uuid, 'half-pair', 'half-pair',
           '2027-06-01 09:30:00'::timestamp, 'UTC', 0, '2027-06-01 09:30:00+00'::timestamptz,
           '2027-06-01 10:30:00'::timestamp, 'UTC', 0, '2027-06-01 10:30:00+00'::timestamptz,
           gen_random_uuid())
      `),
      ),
    ).rejects.toThrow(/calendar_events_recurrence_pair/);
  });

  it("cascades events when their calendar is deleted", async () => {
    await insertViaWriter({ ...base, uid: "cascade-me" });
    await db.delete(calendars).where(eq(calendars.id, CALENDAR_ID));
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.calendarId, CALENDAR_ID));
    expect(rows).toHaveLength(0);
  });

  it("allows at most one primary calendar per personal workspace", async () => {
    await db.update(calendars).set({ isPrimary: true }).where(eq(calendars.id, CALENDAR_ID));
    await expect(
      surfaceConstraint(
        db.insert(calendars).values({
          userId: TEST_OWNER.id,
          name: "Second primary",
          color: "chart-2",
          timeZone: "UTC",
          isPrimary: true,
        }),
      ),
    ).rejects.toThrow(/calendars_one_primary_idx/);
  });
});

describe("calendar_event_masters — the list/detail read surface", () => {
  it("hides soft-deleted rows and per-occurrence overrides", async () => {
    const master = await insertViaWriter({
      uid: "master",
      startWall: "2027-06-01 09:30:00",
      startTzid: "UTC",
      endWall: "2027-06-01 10:30:00",
      endTzid: "UTC",
    });
    expect(master).toBeDefined();
    const [masterRow] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(eq(calendarEvents.uid, "master"));

    // A Phase-2-shaped override row, written directly since Phase 1 has no writer.
    await db.execute(sql`
      INSERT INTO calendar_events
        (calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
         end_wall, end_tzid, end_offset_minutes, end_at, recurrence_parent_id, recurrence_id)
      VALUES
        (${CALENDAR_ID}::uuid, 'master', 'moved occurrence',
         '2027-06-08 11:00:00'::timestamp, 'UTC', 0, '2027-06-08 11:00:00+00'::timestamptz,
         '2027-06-08 12:00:00'::timestamp, 'UTC', 0, '2027-06-08 12:00:00+00'::timestamptz,
         ${masterRow?.id}::uuid, '2027-06-08 09:30:00'::timestamp)
    `);

    await insertViaWriter({
      uid: "soft-deleted",
      startWall: "2027-06-02 09:30:00",
      startTzid: "UTC",
      endWall: "2027-06-02 10:30:00",
      endTzid: "UTC",
    });
    await db
      .update(calendarEvents)
      .set({ deletedAt: new Date() })
      .where(eq(calendarEvents.uid, "soft-deleted"));

    const raw = await db.select().from(calendarEvents);
    const masters = await db.select().from(calendarEventMasters);
    expect(raw).toHaveLength(3);
    expect(masters).toHaveLength(1);
    expect(masters[0]?.uid).toBe("master");
  });
});

describe("the derived cache survives a hostile process timezone", () => {
  // This box runs America/New_York. A naive `timestamp without time zone` regression
  // — a driver or a column type that quietly localises — shows up here and nowhere
  // else, because under TZ=UTC the wrong answer and the right one coincide.
  it.each([
    "UTC",
    "America/New_York",
    "Pacific/Kiritimati",
  ])("round-trips a civil reading byte-identically under TZ=%s", async (tz) => {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
      await insertViaWriter({
        uid: `tz-${tz}`,
        startWall: "2027-03-14 02:30:00",
        startTzid: "America/New_York",
        endWall: "2027-03-14 03:30:00",
        endTzid: "America/New_York",
      });
      const [row] = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.uid, `tz-${tz}`));
      expect(row?.startWall).toBe("2027-03-14 02:30:00");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("the window query's index", () => {
  it("uses calendar_events_concrete_idx and never a Seq Scan", async () => {
    // Seed a realistic shape: 5,000 events spread over 20 calendars. Both halves
    // matter. Too few rows and Postgres correctly prefers a sequential scan, so the
    // assertion would pass or fail for reasons unrelated to the schema; and if every
    // row shared one calendar_id, the index's leading column would have no
    // selectivity and a scan would win no matter how the query was written.
    // offset 0 + UTC makes `start_at = start_wall AT TIME ZONE 'UTC'` hold trivially,
    // so this bulk insert satisfies the derived-instant constraint without the writer.
    await db.execute(sql`
      INSERT INTO calendars (user_id, name, color, time_zone)
      SELECT ${TEST_OWNER.id}, 'bulk-cal-' || g, 'chart-1', 'UTC' FROM generate_series(1, 19) g
    `);
    await db.execute(sql`
      WITH cals AS (
        SELECT id, (row_number() OVER (ORDER BY name)) - 1 AS n
        FROM calendars WHERE user_id = ${TEST_OWNER.id}
      )
      INSERT INTO calendar_events
        (calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
         end_wall, end_tzid, end_offset_minutes, end_at, rrule)
      SELECT c.id, 'bulk-' || g, 'bulk',
             '2027-01-01 00:00:00'::timestamp + (g || ' minutes')::interval, 'UTC', 0,
             '2027-01-01 00:00:00+00'::timestamptz + (g || ' minutes')::interval,
             '2027-01-01 01:00:00'::timestamp + (g || ' minutes')::interval, 'UTC', 0,
             '2027-01-01 01:00:00+00'::timestamptz + (g || ' minutes')::interval,
             CASE WHEN g % 11 = 0 THEN 'FREQ=WEEKLY' ELSE NULL END
      FROM generate_series(1, 5000) g
      JOIN cals c ON c.n = g % 20
    `);
    await db.execute(sql`ANALYZE calendar_events`);

    // The range query reads the RAW TABLE, not calendar_event_masters, and spells
    // out the index's own predicate. Measured: through the view this degrades to a
    // Seq Scan, because the view's `recurrence_parent_id IS NULL` does not imply
    // `rrule IS NULL` and Postgres cannot prove the partial index applicable. This
    // assertion is what stops a well-meaning refactor routing it through the view.
    const plan = await db.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT id FROM calendar_events
      WHERE calendar_id = ${CALENDAR_ID}::uuid
        AND rrule IS NULL AND deleted_at IS NULL
        AND start_at < '2027-01-02+00'::timestamptz
        AND end_at   > '2027-01-01+00'::timestamptz
    `);
    const text = JSON.stringify(plan.rows ?? plan);
    expect(text).not.toMatch(/"Node Type":"Seq Scan"/);
    expect(text).toMatch(/calendar_events_concrete_idx/);
  });
});

describe("offset drift — detected and surfaced, never blocked", () => {
  /**
   * The residual the arithmetic CHECK deliberately does not close.
   *
   * `CHECK (start_at = (start_wall - make_interval(mins => start_offset_minutes)) AT
   * TIME ZONE 'UTC')` consults no timezone database, which is the entire point: a
   * tzdata update can never make an existing row un-editable, and PG's `later`
   * overlap resolution can never disagree with our `compatible` one. The price is
   * that a writer which lies *consistently* — a naive instant carrying offset 0 —
   * satisfies the arithmetic.
   *
   * That gap is covered by DETECTION, here, not by DDL. Re-deriving each row's
   * offset from the live tz database and comparing is exactly the check the CHECK
   * refuses to perform, and it belongs in a test rather than in a constraint for one
   * reason: when Node's ICU and the row disagree after a political tz change, the
   * right response is a report someone reads, not an `UPDATE` that starts failing —
   * including the `UPDATE` that soft-deletes the row.
   *
   * Note this is NOT the tautology the file header warns about. The comparison is
   * against the CURRENT tz database rather than against the value the same function
   * produced at write time, so a row whose zone's rules changed since it was written
   * is reported — which is the whole reason to run it.
   */
  it("recomputes every stored offset from the live tz database and reports mismatches", async () => {
    for (const [uid, wall, tzid] of [
      ["drift-ny", "2027-06-01 09:30:00", "America/New_York"],
      ["drift-chatham", "2027-06-01 09:30:00", "Pacific/Chatham"],
      ["drift-troll", "2027-10-31 01:30:00", "Antarctica/Troll"],
    ] as const) {
      await insertViaWriter({
        uid,
        startWall: wall,
        startTzid: tzid,
        endWall: wall,
        endTzid: tzid,
      });
    }
    // Planted: a consistent liar. Offset 0 with an instant that matches it — the
    // arithmetic holds, so the constraint accepted it, and only re-derivation can
    // see that New York is not UTC.
    await db.execute(sql`
      INSERT INTO calendar_events
        (calendar_id, uid, title, start_wall, start_tzid, start_offset_minutes, start_at,
         end_wall, end_tzid, end_offset_minutes, end_at)
      VALUES (${CALENDAR_ID}::uuid, 'drift-liar', 'liar',
              '2027-06-01 09:30:00', 'America/New_York', 0, '2027-06-01 09:30:00+00',
              '2027-06-01 09:30:00', 'America/New_York', 0, '2027-06-01 09:30:00+00')
    `);

    const rows = await db
      .select({
        uid: calendarEvents.uid,
        startWall: calendarEvents.startWall,
        startTzid: calendarEvents.startTzid,
        startOffsetMinutes: calendarEvents.startOffsetMinutes,
        endWall: calendarEvents.endWall,
        endTzid: calendarEvents.endTzid,
        endOffsetMinutes: calendarEvents.endOffsetMinutes,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.calendarId, CALENDAR_ID));

    const drifted = rows
      .filter((row) => {
        const derived = deriveEventInstants({
          startWall: row.startWall,
          startTzid: row.startTzid,
          endWall: row.endWall,
          endTzid: row.endTzid,
        });
        return (
          derived.startOffsetMinutes !== row.startOffsetMinutes ||
          derived.endOffsetMinutes !== row.endOffsetMinutes
        );
      })
      .map((row) => row.uid);

    // The three honest rows are silent; the liar is named. If a tzdata update ever
    // makes a legitimate row drift, THIS is where it surfaces — as a failing test
    // someone triages, never as a row the application can no longer write to.
    expect(drifted).toEqual(["drift-liar"]);
  });
});
