import {
  calendarEventAttendees,
  calendarEvents,
  calendars,
  db,
  notifications,
  user,
} from "@repo/db";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Attendee integrity, against a REAL Postgres.
 *
 * Same posture as its two siblings: where a rule is enforced by the database, the write
 * goes in **around** the application writer so the constraint is what refuses it, and the
 * assertion names the constraint rather than matching a message. Drizzle keeps the name on
 * `err.cause`, so `rejects.toThrow(/name/)` would pass for any constraint at all.
 *
 * Two of the rules this phase depends on are **writer-enforced**, not database-enforced,
 * and the tests for those are shaped differently on purpose. "Overrides inherit their
 * master's guest list" and "re-submitting an unchanged list resets nobody" are decisions no
 * CHECK can express, so what is asserted here is the *data shape they depend on* plus the
 * specific wrong answer each careless implementation produces — the planted-defect pattern
 * `calendar-events.test.ts` established. The writer-side half (that `updateOccurrence`
 * ignores `values.attendees`, that `diffAttendees` puts an unchanged address in
 * `unchanged`) lives in `apps/web`'s unit suites, which can call those functions; this file
 * proves the database will not save them if they are wrong.
 *
 * Context: docs/context/calendar/attendees.md.
 */

const TEST_OWNER = {
  id: "integration-test-attendees-owner",
  name: "Integration Test Attendees Owner",
  email: "integration-test-attendees-owner@example.com",
  emailVerified: true,
} as const;

/** Invited after they had an account, so their row carries a resolved `user_id`. */
const RESOLVED_GUEST = {
  id: "integration-test-attendees-guest",
  name: "Integration Test Attendees Guest",
  email: "integration-test-attendees-guest@example.com",
  emailVerified: true,
} as const;

/**
 * Signed up with a mixed-case address, which `user.email` permits and
 * `calendar_event_attendees.email` does not. Better Auth lower-cases in its own sign-up
 * route today, so this is the row that would exist after an import, a support script or a
 * provider that does not — the population the `lower($param)` spelling exists for.
 */
const MIXED_CASE_GUEST = {
  id: "integration-test-attendees-mixed",
  name: "Integration Test Attendees Mixed",
  email: "Integration-Test-Attendees-Mixed@Example.com",
  emailVerified: true,
} as const;

const CALENDAR_ID = "cccccccc-1111-4222-8333-000000000001";
const MASTER_ID = "cccccccc-1111-4222-8333-000000000010";
const OTHER_EVENT_ID = "cccccccc-1111-4222-8333-000000000011";
const NEW_MASTER_ID = "cccccccc-1111-4222-8333-000000000020";
const MASTER_UID = "attendees-master-uid";

const FIRST_OCCURRENCE = "2027-03-15 09:00:00";
const SECOND_OCCURRENCE = "2027-03-22 09:00:00";
const THIRD_OCCURRENCE = "2027-03-29 09:00:00";

async function cleanup() {
  // calendars.user_id cascades to calendar_events, which cascades to
  // calendar_event_attendees, so deleting the three users is the whole cleanup — and
  // deleting the guests also exercises nothing, because their rows go with the owner's
  // calendar first.
  for (const id of [TEST_OWNER.id, RESOLVED_GUEST.id, MIXED_CASE_GUEST.id]) {
    await db.delete(user).where(eq(user.id, id));
  }
}

/**
 * A UTC event at offset 0, so `calendar_events_start_at_derived` holds trivially without
 * the application writer. That constraint is `calendar-events.test.ts`'s subject; here it
 * is scaffolding, exactly as in `calendar-recurrence.test.ts`.
 */
async function insertRawEvent(values: {
  id?: string;
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
      ${CALENDAR_ID}::uuid,
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
  await db.insert(user).values([TEST_OWNER, RESOLVED_GUEST, MIXED_CASE_GUEST]);
  await db.insert(calendars).values({
    id: CALENDAR_ID,
    userId: TEST_OWNER.id,
    name: "Attendees",
    color: "chart-1",
    timeZone: "UTC",
  });
  await insertRawEvent({
    id: MASTER_ID,
    uid: MASTER_UID,
    wall: FIRST_OCCURRENCE,
    rrule: "FREQ=WEEKLY;BYDAY=MO",
  });
  await insertRawEvent({ id: OTHER_EVENT_ID, uid: "attendees-other-uid", wall: FIRST_OCCURRENCE });
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

/** An accepted invitation: the pair CHECK requires the two columns to agree. */
const ACCEPTED = { status: "accepted", respondedAt: new Date("2027-03-01T00:00:00Z") } as const;

async function attendeeRows(eventId: string) {
  return await db
    .select({
      id: calendarEventAttendees.id,
      email: calendarEventAttendees.email,
      userId: calendarEventAttendees.userId,
      role: calendarEventAttendees.role,
      status: calendarEventAttendees.status,
      comment: calendarEventAttendees.comment,
      respondedAt: calendarEventAttendees.respondedAt,
    })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId))
    .orderBy(calendarEventAttendees.email);
}

beforeEach(async () => {
  await cleanup();
  await seed();
});

afterAll(cleanup);

describe("the identity is the address", () => {
  it("refuses a second row for the same address on the same event", async () => {
    // The constraint the guest-list diff is written against: it is what makes "leave this
    // one strictly alone" expressible at all, rather than delete-and-re-insert.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email });
    await expect(
      surfaceConstraint(
        db
          .insert(calendarEventAttendees)
          .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email, role: "optional" }),
      ),
    ).rejects.toThrow("calendar_event_attendees_event_id_email_key");
  });

  it("accepts the same address on a different event", async () => {
    // `event_id` leads the unique, so one person's invitations do not collide with each
    // other — and that ordering is also what serves the foreign key.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email });
    await expect(
      db
        .insert(calendarEventAttendees)
        .values({ eventId: OTHER_EVENT_ID, email: RESOLVED_GUEST.email }),
    ).resolves.not.toThrow();
  });

  it("refuses a mixed-case address outright", async () => {
    // The unique above CANNOT catch this: to Postgres `John@Example.com` and
    // `john@example.com` are different strings, so without the CHECK the pair would
    // insert happily and become two guests, two invitations and two RSVP states for one
    // person. The Zod `.toLowerCase()` covers the composer's path and nothing else —
    // Phase 4's ICS import, a seed helper and a support script all write this column.
    await expect(
      surfaceConstraint(
        db.insert(calendarEventAttendees).values({ eventId: MASTER_ID, email: "John@Example.com" }),
      ),
    ).rejects.toThrow("calendar_event_attendees_email_lower");
  });
});

describe("what a deleted event and a deleted user each do to a guest list", () => {
  it("takes the guest list with the event", async () => {
    await db.insert(calendarEventAttendees).values([
      { eventId: MASTER_ID, email: RESOLVED_GUEST.email, userId: RESOLVED_GUEST.id },
      { eventId: MASTER_ID, email: "external@example.com" },
    ]);
    await db.delete(calendarEvents).where(eq(calendarEvents.id, MASTER_ID));
    expect(await attendeeRows(MASTER_ID)).toEqual([]);
  });

  it("degrades a deleted user into an external attendee rather than dropping the row", async () => {
    // `ON DELETE SET NULL`, the `post_revisions.author_id` precedent. The organizer's
    // guest list still names the address it was sent to; only the resolution is gone.
    // Cascading here would silently shrink a guest list because someone else closed
    // their account.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email, userId: RESOLVED_GUEST.id });
    await db.delete(user).where(eq(user.id, RESOLVED_GUEST.id));

    const rows = await attendeeRows(MASTER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: RESOLVED_GUEST.email, userId: null });
  });
});

describe("calendar_event_attendees_responded_pair — bidirectional on purpose", () => {
  it("refuses `accepted` with no responded_at", async () => {
    // The one-directional spelling permits exactly this, and it is what a careless
    // `splitSeries` copy produces: carry the status over, forget the timestamp.
    await expect(
      surfaceConstraint(
        db
          .insert(calendarEventAttendees)
          .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email, status: "accepted" }),
      ),
    ).rejects.toThrow("calendar_event_attendees_responded_pair");
  });

  it("refuses `needs-action` carrying a responded_at", async () => {
    await expect(
      surfaceConstraint(
        db.insert(calendarEventAttendees).values({
          eventId: MASTER_ID,
          email: RESOLVED_GUEST.email,
          status: "needs-action",
          respondedAt: new Date(),
        }),
      ),
    ).rejects.toThrow("calendar_event_attendees_responded_pair");
  });

  it("accepts both consistent pairs", async () => {
    await expect(
      db.insert(calendarEventAttendees).values([
        { eventId: MASTER_ID, email: "unanswered@example.com" },
        { eventId: MASTER_ID, email: "answered@example.com", ...ACCEPTED },
      ]),
    ).resolves.not.toThrow();
  });
});

describe("notifications_link_same_origin — the link column an invitation carries", () => {
  async function insertLink(link: string | null) {
    return await surfaceConstraint(
      db.insert(notifications).values({
        userId: TEST_OWNER.id,
        type: "calendar_invite",
        body: TEST_OWNER.email,
        title: "Standup",
        link,
      }),
    );
  }

  it.each([
    ["protocol-relative with two slashes", "//evil.com"],
    ["protocol-relative with a backslash", "/\\evil.com"],
    ["an absolute URL", "https://evil.com/x"],
  ])("refuses %s", async (_label, link) => {
    // Both slash forms begin with `/` and are protocol-relative to a browser, so a guard
    // that only rejected `http://` would miss them. The backslash one is why this CHECK
    // is spelled with `left()`: backslash is LIKE's default ESCAPE character, so
    // `NOT LIKE '/\%'` means "slash then a literal %" and would have accepted it.
    await expect(insertLink(link)).rejects.toThrow("notifications_link_same_origin");
  });

  it("accepts a same-origin path, and NULL", async () => {
    // NULL is the `calendar_cancelled` case: its event is soft-deleted, so any link
    // would 404.
    await expect(insertLink(`/calendar/event/${MASTER_ID}`)).resolves.not.toThrow();
    await expect(insertLink(null)).resolves.not.toThrow();
  });
});

describe("splitSeries — the one writer that copies, and it copies verbatim", () => {
  /** The literal `INSERT … SELECT` from `splitSeries`, run against the real table. */
  async function copyAttendees(fromEventId: string, toEventId: string) {
    await surfaceConstraint(
      db.execute(sql`
        INSERT INTO calendar_event_attendees
          (event_id, user_id, email, role, status, comment, responded_at)
        SELECT ${toEventId}::uuid, user_id, email, role, status, comment, responded_at
          FROM calendar_event_attendees
         WHERE event_id = ${fromEventId}::uuid
      `),
    );
  }

  beforeEach(async () => {
    await db.insert(calendarEventAttendees).values([
      {
        eventId: MASTER_ID,
        email: RESOLVED_GUEST.email,
        userId: RESOLVED_GUEST.id,
        role: "organizer",
        comment: "see you there",
        ...ACCEPTED,
      },
      { eventId: MASTER_ID, email: "external@example.com" },
    ]);
    await insertRawEvent({
      id: NEW_MASTER_ID,
      uid: "attendees-new-master-uid",
      wall: SECOND_OCCURRENCE,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });
  });

  it("puts the source's list on the new master and leaves the originals where they were", async () => {
    await copyAttendees(MASTER_ID, NEW_MASTER_ID);

    const copied = await attendeeRows(NEW_MASTER_ID);
    const original = await attendeeRows(MASTER_ID);
    expect(copied.map((row) => row.email)).toEqual(original.map((row) => row.email));

    // Verbatim: role, status, comment and responded_at all carry over. The consequence
    // is recorded rather than hidden (attendees.md) — a "this and following" edit that
    // moves the time leaves everyone still `accepted` for a meeting whose time changed.
    // Resetting them here would pre-decide Phase 4's significant-change rules and would
    // re-ask every guest after a pure title edit.
    expect(copied[1]).toMatchObject({
      email: RESOLVED_GUEST.email,
      userId: RESOLVED_GUEST.id,
      role: "organizer",
      status: "accepted",
      comment: "see you there",
    });
    expect(copied[1]?.respondedAt).toEqual(ACCEPTED.respondedAt);

    // New rows, not moved ones: the second half is a separate event with its own id, and
    // the first half keeps the guest list it already had.
    expect(copied.map((row) => row.id)).not.toEqual(
      expect.arrayContaining(original.map((row) => row.id)),
    );
  });

  it("refuses the careless copy that keeps the status and drops the timestamp", async () => {
    // The planted defect, and the reason the pair CHECK is bidirectional. Someone
    // "tidying" this INSERT by dropping `responded_at` from the column list gets a copy
    // that is `accepted` with nothing to say when — which reads as an answer nobody gave.
    await expect(
      surfaceConstraint(
        db.execute(sql`
          INSERT INTO calendar_event_attendees (event_id, user_id, email, role, status, comment)
          SELECT ${NEW_MASTER_ID}::uuid, user_id, email, role, status, comment
            FROM calendar_event_attendees
           WHERE event_id = ${MASTER_ID}::uuid
        `),
      ),
    ).rejects.toThrow("calendar_event_attendees_responded_pair");
  });

  it("moves no attendee row when the overrides are re-parented", async () => {
    // The re-parent is an UPDATE of `calendar_events`, and attendees hang off the master
    // by `event_id`. An override that carried rows of its own would take them along and
    // the two halves would disagree about who is invited — which is the second reason
    // decision 3 inherits rather than copies.
    await insertRawEvent({
      uid: MASTER_UID,
      wall: THIRD_OCCURRENCE,
      parentId: MASTER_ID,
      recurrenceId: THIRD_OCCURRENCE,
    });
    await copyAttendees(MASTER_ID, NEW_MASTER_ID);
    await db
      .update(calendarEvents)
      .set({ recurrenceParentId: NEW_MASTER_ID, uid: "attendees-new-master-uid" })
      .where(eq(calendarEvents.recurrenceParentId, MASTER_ID));

    expect(await attendeeRows(MASTER_ID)).toHaveLength(2);
    expect(await attendeeRows(NEW_MASTER_ID)).toHaveLength(2);
  });
});

describe("overrides inherit — an occurrence edit creates no attendee rows", () => {
  it("leaves the whole guest list on the master when an occurrence materialises", async () => {
    // Asserted POSITIVELY so a future copy-based "fix" fails here rather than shipping.
    // `updateOccurrence` is a single `onConflictDoUpdate`, so an `INSERT … SELECT` of
    // attendees beside it would raise 23505 on the second edit of the same occurrence and
    // surface as the generic write error — and the rows would be unreadable anyway,
    // because every attendee read goes through the master.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email, userId: RESOLVED_GUEST.id });

    await insertRawEvent({
      uid: MASTER_UID,
      wall: SECOND_OCCURRENCE,
      parentId: MASTER_ID,
      recurrenceId: SECOND_OCCURRENCE,
    });
    const [override] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(eq(calendarEvents.recurrenceParentId, MASTER_ID));
    if (!override) throw new Error("the override was not written");

    expect(await attendeeRows(override.id)).toEqual([]);
    expect(await attendeeRows(MASTER_ID)).toHaveLength(1);
  });

  it("answers with the master's list for the override id too, via `recurrence_parent_id ?? id`", async () => {
    // The resolution every attendee read and write performs first. Both ids reach the
    // same list, which is what makes "an attendee row on an override means a deliberate
    // per-occurrence response" true for Phase 6 to build on.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email });
    await insertRawEvent({
      uid: MASTER_UID,
      wall: SECOND_OCCURRENCE,
      parentId: MASTER_ID,
      recurrenceId: SECOND_OCCURRENCE,
    });

    const resolved = await db.execute(sql`
      SELECT a.email
        FROM calendar_events e
        JOIN calendar_event_attendees a ON a.event_id = COALESCE(e.recurrence_parent_id, e.id)
       WHERE e.calendar_id = ${CALENDAR_ID}::uuid AND e.uid = ${MASTER_UID}
    `);
    expect((resolved.rows as { email: string }[]).map((row) => row.email)).toEqual([
      RESOLVED_GUEST.email,
      RESOLVED_GUEST.email,
    ]);
  });
});

describe("dropModifiers takes any override's attendee rows with it", () => {
  it("hard-deletes the override rows and leaves the master's guest list alone", async () => {
    // `updateWholeEvent`'s dropModifiers branch deletes the overrides outright. Phase 3
    // never puts an attendee row on one, but Phase 6's per-occurrence RSVP will, and the
    // FK is `ON DELETE CASCADE` precisely so that branch does not have to learn about a
    // table it predates.
    await insertRawEvent({
      uid: MASTER_UID,
      wall: SECOND_OCCURRENCE,
      parentId: MASTER_ID,
      recurrenceId: SECOND_OCCURRENCE,
    });
    const [override] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(eq(calendarEvents.recurrenceParentId, MASTER_ID));
    if (!override) throw new Error("the override was not written");

    await db.insert(calendarEventAttendees).values([
      { eventId: MASTER_ID, email: RESOLVED_GUEST.email },
      { eventId: override.id, email: RESOLVED_GUEST.email, ...ACCEPTED },
    ]);

    await db.delete(calendarEvents).where(eq(calendarEvents.recurrenceParentId, MASTER_ID));

    expect(await attendeeRows(override.id)).toEqual([]);
    expect(await attendeeRows(MASTER_ID)).toHaveLength(1);
  });
});

describe("re-submitting an unchanged guest list must not reset anyone's RSVP", () => {
  beforeEach(async () => {
    await db.insert(calendarEventAttendees).values({
      eventId: MASTER_ID,
      email: RESOLVED_GUEST.email,
      userId: RESOLVED_GUEST.id,
      comment: "see you there",
      ...ACCEPTED,
    });
  });

  it("loses the answer if the list is deleted and re-inserted", async () => {
    // The hazard, planted. The composer posts the WHOLE guest list on every save, so the
    // naive writer — clear the rows, insert what was submitted — silently returns every
    // guest to `needs-action` when the organizer fixes a typo in the title. Nothing in
    // the database can refuse this; it is a legal pair of writes.
    await db.delete(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, MASTER_ID));
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email });

    const rows = await attendeeRows(MASTER_ID);
    expect(rows[0]).toMatchObject({ status: "needs-action", respondedAt: null, comment: null });
  });

  it("loses it just as quietly through an upsert whose conflict branch sets status", async () => {
    // The tidier-looking wrong answer, and the one that survives review: it is a single
    // statement and it reads like an idempotent write.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email })
      .onConflictDoUpdate({
        target: [calendarEventAttendees.eventId, calendarEventAttendees.email],
        set: { status: "needs-action", respondedAt: null },
      });

    expect((await attendeeRows(MASTER_ID))[0]).toMatchObject({ status: "needs-action" });
  });

  it("keeps it when the unchanged address is left strictly alone", async () => {
    // What `diffAttendees` produces: an address in both sets lands in `unchanged`, which
    // no writer touches — not updated, not re-inserted, not re-notified. `ON CONFLICT DO
    // NOTHING` is the same shape expressed in one statement, and the unique constraint is
    // what makes either of them possible.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email })
      .onConflictDoNothing();

    const rows = await attendeeRows(MASTER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "accepted", comment: "see you there" });
    expect(rows[0]?.respondedAt).toEqual(ACCEPTED.respondedAt);
  });
});

describe("the claim predicate — `attendees.email = lower($param)`", () => {
  /** Decision 14's scope, exactly as `listInvites` and `getEventAccess` spell it. */
  async function invitationsFor(userId: string, normalise: boolean) {
    const emailArm = normalise ? sql`a.email = lower(u.email)` : sql`a.email = u.email`;
    const rows = await db.execute(sql`
      SELECT a.email FROM calendar_event_attendees a
      JOIN "user" u ON u.id = a.user_id OR (${emailArm} AND u.email_verified)
      WHERE u.id = ${userId} AND a.event_id = ${MASTER_ID}::uuid
    `);
    return (rows.rows as { email: string }[]).map((row) => row.email);
  }

  it("finds the invitation of someone whose stored address is mixed-case", async () => {
    // The row is CHECK-lowercased; `user.email` is not, so the comparison has to
    // normalise somewhere. On the parameter side it still uses
    // `calendar_event_attendees_email_idx`; on the column side it would not.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: MIXED_CASE_GUEST.email.toLowerCase() });
    expect(await invitationsFor(MIXED_CASE_GUEST.id, true)).toEqual([
      MIXED_CASE_GUEST.email.toLowerCase(),
    ]);
  });

  it("misses it entirely without the normalisation", async () => {
    // The defect, planted. It fails CLOSED — the invitation is simply not there — which
    // is why nobody would report it as a bug, and why the rule is in packages/db/AGENTS.md
    // rather than left to whoever writes the next query.
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: MIXED_CASE_GUEST.email.toLowerCase() });
    expect(await invitationsFor(MIXED_CASE_GUEST.id, false)).toEqual([]);
  });

  it("refuses an unverified claimant", async () => {
    // Without the `emailVerified` conjunct, signing up as someone else's address and
    // never verifying would list that person's invitations.
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, MIXED_CASE_GUEST.id));
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: MIXED_CASE_GUEST.email.toLowerCase() });
    expect(await invitationsFor(MIXED_CASE_GUEST.id, true)).toEqual([]);
  });
});

describe("the claim is stamped, so an accepted invitation survives an email change", () => {
  /**
   * Someone invited before they had an account: the row names their address and carries
   * no `user_id`, so only the email arm of decision 14's predicate can reach it.
   */
  async function seedUnclaimedInvitation() {
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email: RESOLVED_GUEST.email });
  }

  /** `listInvites`' scope, with `me.email` already read from Postgres. */
  async function listInvites(userId: string) {
    const [me] = await db
      .select({ email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId));
    if (!me) throw new Error("no user");
    const rows = await db
      .select({ email: calendarEventAttendees.email })
      .from(calendarEventAttendees)
      .where(
        and(
          eq(calendarEventAttendees.eventId, MASTER_ID),
          me.emailVerified
            ? sql`(${calendarEventAttendees.userId} = ${userId} OR ${calendarEventAttendees.email} = lower(${me.email}))`
            : eq(calendarEventAttendees.userId, userId),
        ),
      );
    return rows.map((row) => row.email);
  }

  it("still lists it after the claimant changes address", async () => {
    await seedUnclaimedInvitation();
    expect(await listInvites(RESOLVED_GUEST.id)).toEqual([RESOLVED_GUEST.email]);

    // `respondToEvent`'s UPDATE, verbatim: the answer and the stamp in one statement, so
    // the email arm answers exactly once and the durable arm answers forever after.
    await db
      .update(calendarEventAttendees)
      .set({ ...ACCEPTED, userId: RESOLVED_GUEST.id })
      .where(
        and(
          eq(calendarEventAttendees.eventId, MASTER_ID),
          eq(calendarEventAttendees.email, RESOLVED_GUEST.email),
        ),
      );
    await db
      .update(user)
      .set({ email: "moved-on@example.com" })
      .where(eq(user.id, RESOLVED_GUEST.id));

    expect(await listInvites(RESOLVED_GUEST.id)).toEqual([RESOLVED_GUEST.email]);
  });

  it("silently loses it when the stamp is skipped", async () => {
    // The defect K4 named, planted. It fails closed, so it reads as data loss rather than
    // as a leak — an invitation this person had ALREADY ACCEPTED disappears from their
    // list the day they change their address, and nothing logs it.
    await seedUnclaimedInvitation();
    await db
      .update(calendarEventAttendees)
      .set(ACCEPTED)
      .where(
        and(
          eq(calendarEventAttendees.eventId, MASTER_ID),
          eq(calendarEventAttendees.email, RESOLVED_GUEST.email),
        ),
      );
    await db
      .update(user)
      .set({ email: "moved-on@example.com" })
      .where(eq(user.id, RESOLVED_GUEST.id));

    expect(await listInvites(RESOLVED_GUEST.id)).toEqual([]);
  });
});

describe("invite-time resolution counts only verified accounts", () => {
  /**
   * `resolveAttendeeUserIds`' SELECT, restated (the action lives in apps/web, which this
   * package cannot depend on) — in both spellings, so the conjunct's effect is the only
   * difference between them.
   */
  async function resolve(emails: readonly string[], verifiedOnly: boolean) {
    const rows = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(
        verifiedOnly
          ? and(inArray(user.email, [...emails]), eq(user.emailVerified, true))
          : inArray(user.email, [...emails]),
      );
    return new Map(rows.map((row) => [row.email.toLowerCase(), row.id]));
  }

  /** What `addAttendees` does with that map: the resolution becomes a durable stamp. */
  async function insertResolved(email: string, resolved: Map<string, string>) {
    await db
      .insert(calendarEventAttendees)
      .values({ eventId: MASTER_ID, email, userId: resolved.get(email) ?? null });
    return (await attendeeRows(MASTER_ID))[0];
  }

  beforeEach(async () => {
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, RESOLVED_GUEST.id));
  });

  it("leaves an unverified account's invitation external", async () => {
    const map = await resolve([RESOLVED_GUEST.email], true);
    expect(map.size).toBe(0);
    expect(await insertResolved(RESOLVED_GUEST.email, map)).toMatchObject({ userId: null });
  });

  it("stamps the unproved address under the spelling without the conjunct", async () => {
    // The defect, planted (audit F6, seam a). It fails OPEN, which is why nothing would
    // report it: the invitation works, the notification arrives, the loop looks healthy.
    // What it costs is the claim itself — the stamp is the durable arm every later read
    // answers by, and no read re-checks `email_verified`, so squatting an address before
    // the invitation is sent captures it permanently on a deploy where verification is
    // off. The token path states the rule this breaks: being sent something is not
    // proof of owning the address it was sent to.
    const map = await resolve([RESOLVED_GUEST.email], false);
    expect(map.get(RESOLVED_GUEST.email)).toBe(RESOLVED_GUEST.id);
    expect(await insertResolved(RESOLVED_GUEST.email, map)).toMatchObject({
      userId: RESOLVED_GUEST.id,
    });
  });

  it("still resolves a verified account, which is the whole point of resolving", async () => {
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, RESOLVED_GUEST.id));
    const map = await resolve([RESOLVED_GUEST.email], true);
    expect(await insertResolved(RESOLVED_GUEST.email, map)).toMatchObject({
      userId: RESOLVED_GUEST.id,
    });
  });
});

describe("the respond UPDATE cannot capture a co-invitee's row", () => {
  /**
   * Two guests on one event: the actor, invited after they had an account (durable
   * stamp), and a victim invited at an address that has none — `user_id NULL`, reachable
   * only by the email arm.
   */
  const VICTIM_EMAIL = "victim@example.com";

  /** `respondToEvent`'s UPDATE, restated, in both spellings of its email arm. */
  async function respond(userId: string, verifiedArm: boolean) {
    const emailArm = verifiedArm
      ? sql`EXISTS (SELECT 1 FROM "user" u
                     WHERE u.id = ${userId}
                       AND u.email_verified
                       AND ${calendarEventAttendees.email} = lower(u.email))`
      : sql`${calendarEventAttendees.email} = lower((SELECT email FROM "user" WHERE id = ${userId}))`;
    const rows = await db
      .update(calendarEventAttendees)
      .set({ status: "accepted", comment: "actor's answer", respondedAt: sql`now()`, userId })
      .where(
        and(
          eq(calendarEventAttendees.eventId, MASTER_ID),
          sql`(${calendarEventAttendees.userId} = ${userId} OR ${emailArm})`,
        ),
      )
      .returning({ email: calendarEventAttendees.email });
    return rows.map((row) => row.email).sort();
  }

  beforeEach(async () => {
    await db.insert(calendarEventAttendees).values([
      { eventId: MASTER_ID, email: RESOLVED_GUEST.email, userId: RESOLVED_GUEST.id },
      { eventId: MASTER_ID, email: VICTIM_EMAIL },
    ]);
    // The actor moves their account onto the victim's address without proving it. On an
    // email-unconfigured deploy that is a supported, unremarkable account edit.
    await db
      .update(user)
      .set({ email: VICTIM_EMAIL, emailVerified: false })
      .where(eq(user.id, RESOLVED_GUEST.id));
  });

  it("updates only the actor's own row", async () => {
    expect(await respond(RESOLVED_GUEST.id, true)).toEqual([RESOLVED_GUEST.email]);
    const victim = (await attendeeRows(MASTER_ID)).find((row) => row.email === VICTIM_EMAIL);
    expect(victim).toMatchObject({ status: "needs-action", userId: null, comment: null });
    expect(victim?.respondedAt).toBeNull();
  });

  it("captures the co-invitee's row under the spelling without the conjunct", async () => {
    // The defect, planted (audit F6, seam b). The UPDATE is not bounded to one row — the
    // action destructures the first of RETURNING and never learns a second was written —
    // so the victim's answer, their comment and their `user_id` are all overwritten by
    // someone who merely typed their address into an account settings form.
    expect(await respond(RESOLVED_GUEST.id, false)).toEqual(
      [RESOLVED_GUEST.email, VICTIM_EMAIL].sort(),
    );
    const victim = (await attendeeRows(MASTER_ID)).find((row) => row.email === VICTIM_EMAIL);
    expect(victim).toMatchObject({ status: "accepted", userId: RESOLVED_GUEST.id });
  });

  it("claims the unstamped row when the address IS proved, which is the legitimate path", async () => {
    // The claim arm doing its job: someone invited before they had an account answers
    // once from a verified address, and the stamp makes the durable arm answer forever
    // after. Both rows update here, so this person now holds TWO rows on one event —
    // legal, because the unique is `(event_id, email)`, and pre-existing: `listInvites`
    // shows the event twice and `attendeeResponse` resolves by `limit(1)`. The fix
    // neither creates nor closes that; it is written down here because this is the one
    // test that makes it visible.
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, RESOLVED_GUEST.id));
    expect(await respond(RESOLVED_GUEST.id, true)).toEqual(
      [RESOLVED_GUEST.email, VICTIM_EMAIL].sort(),
    );
  });
});

describe("calendar_event_attendees_email_idx — which spelling can use it", () => {
  it("plans `email = lower($1)` as an index scan and `lower(email) = $1` as a seq scan", async () => {
    // The measurement behind the AGENTS.md rule, made falsifiable. Both spellings return
    // the same row, so no correctness test above can tell them apart — this is the only
    // assertion that fails if someone "simplifies" the predicate onto the column side.
    // 10,000 rows on one event: too few and Postgres correctly prefers a sequential scan
    // for both, and the assertion would pass for the wrong reason.
    await db.execute(sql`
      INSERT INTO calendar_event_attendees (event_id, email)
      SELECT ${MASTER_ID}::uuid, 'bulk-' || g || '@example.com' FROM generate_series(1, 10000) g
    `);
    await db.execute(sql`VACUUM (ANALYZE) calendar_event_attendees`);

    const indexed = await db.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT id FROM calendar_event_attendees WHERE email = lower('Bulk-5000@Example.com')
    `);
    expect(JSON.stringify(indexed.rows)).toMatch(/calendar_event_attendees_email_idx/);
    expect(JSON.stringify(indexed.rows)).not.toMatch(/"Node Type": ?"Seq Scan"/);

    const unindexed = await db.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT id FROM calendar_event_attendees WHERE lower(email) = 'bulk-5000@example.com'
    `);
    expect(JSON.stringify(unindexed.rows)).toMatch(/"Node Type": ?"Seq Scan"/);
  });
});

describe("the cancellation fan-out — who is emailed when an event is deleted", () => {
  // `softDeleteEvent`'s recipient predicate, restated rather than imported: the action
  // lives in apps/web, which this package cannot depend on. What is proven here is the
  // NULL semantics no apps/web mock can see — the unit test's fixture models this
  // query's OUTPUT; this is the only place its WHERE meets real rows.
  beforeEach(async () => {
    await db.insert(calendarEventAttendees).values([
      { eventId: MASTER_ID, email: TEST_OWNER.email, userId: TEST_OWNER.id, role: "organizer" },
      { eventId: MASTER_ID, email: RESOLVED_GUEST.email, userId: RESOLVED_GUEST.id },
      { eventId: MASTER_ID, email: "external@example.com" },
    ]);
  });

  it("includes the external guest and excludes the deleting actor", async () => {
    const rows = await db
      .select({ email: calendarEventAttendees.email })
      .from(calendarEventAttendees)
      .where(
        and(
          eq(calendarEventAttendees.eventId, MASTER_ID),
          or(
            isNull(calendarEventAttendees.userId),
            ne(calendarEventAttendees.userId, TEST_OWNER.id),
          ),
        ),
      )
      .orderBy(calendarEventAttendees.email);
    expect(rows.map((row) => row.email)).toEqual(["external@example.com", RESOLVED_GUEST.email]);
  });

  it("silently drops the external under the bare `ne()` spelling", async () => {
    // The defect, planted (audit F4). `NULL <> $actor` evaluates NULL, so the bare
    // spelling filtered out exactly the guests whose ONLY notice a cancellation email
    // is — an external holds a live `.ics` and no in-app feed, and nothing logged the
    // drop. It fails closed, which is why nobody reported it.
    const rows = await db
      .select({ email: calendarEventAttendees.email })
      .from(calendarEventAttendees)
      .where(
        and(
          eq(calendarEventAttendees.eventId, MASTER_ID),
          ne(calendarEventAttendees.userId, TEST_OWNER.id),
        ),
      );
    expect(rows.map((row) => row.email)).toEqual([RESOLVED_GUEST.email]);
  });
});
