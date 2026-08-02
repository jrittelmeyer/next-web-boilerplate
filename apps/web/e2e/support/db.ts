import { deriveEventInstants } from "@repo/calendar";
import { db } from "@repo/db";
import {
  type AttendeeRole,
  type AttendeeStatus,
  type AuditAction,
  auditLog,
  type CalendarColor,
  calendarEventAttendees,
  calendarEvents,
  calendars,
  notifications,
  rateLimit,
  user,
  userPreferences,
} from "@repo/db/schema";
import { and, eq, like, sql } from "drizzle-orm";

/**
 * Promote a signed-up user to admin by a DIRECT DB write — the sanctioned
 * out-of-band path (roles are never self-service; see AUTH.md). The admin E2E
 * needs a logged-in admin to drive the /admin UI, and there is no UI or seed admin,
 * so it bootstraps one this way.
 *
 * Writes the same database the app reads: DATABASE_URL is provided by the DB-backed
 * `e2e` CI lane (job env) and, for local runs, by `test:e2e` loading the root .env
 * via dotenv-cli (mirroring dev/build/start). We do NOT close @repo/db's shared pool
 * — it's a module-level singleton and Playwright terminates the worker when the run
 * ends; ending it here would break a reused connection.
 */
export async function promoteToAdmin(email: string): Promise<void> {
  await db.update(user).set({ role: "admin" }).where(eq(user.email, email));
}

/**
 * Seed inert "bait" users by DIRECT insert — the same sanctioned out-of-band path as
 * promoteToAdmin. Better Auth never sees these rows (no account/session/password);
 * they exist only to give /admin something to paginate (P3-5). Only id/name/email
 * lack defaults in the schema, but createdAt/updatedAt are pinned explicitly —
 * staggered into the past so the freshly signed-up admin stays the newest row and
 * the bait segment orders deterministically under (createdAt desc, id desc).
 */
export async function seedBaitUsers(idPrefix: string, count: number): Promise<void> {
  const base = Date.now() - 60 * 60 * 1000; // 1h ago — older than any signup this run
  await db.insert(user).values(
    Array.from({ length: count }, (_, i) => ({
      id: `${idPrefix}-${String(i).padStart(2, "0")}`,
      name: `Bait User ${i}`,
      email: `${idPrefix}-${i}@example.com`,
      createdAt: new Date(base - i * 1000),
      updatedAt: new Date(base - i * 1000),
    })),
  );
}

/**
 * Delete seeded bait users by id prefix. Called both BEFORE seeding (clears leftovers
 * from an aborted local run, so re-runs never hit the unique-email constraint) and in
 * afterAll cleanup. Bait ids are namespaced (`e2e-…-bait-NN`), so the LIKE prefix
 * can't touch real rows; user-FK rows would cascade, but bait users never get any.
 */
export async function deleteBaitUsers(idPrefix: string): Promise<void> {
  await db.delete(user).where(like(user.id, `${idPrefix}-%`));
}

/**
 * Seed `audit_log` rows by DIRECT insert — the same sanctioned out-of-band path — so
 * /admin/audit (B2 read UI) has deterministic content without driving the real write
 * sites (those are covered by admin.test.ts + the @repo/db integration lane). Each row's
 * `targetId` MUST carry the prefix so deleteAuditRows can clean it. Rows are stamped 1h
 * in the FUTURE (staggered) so they stay the newest events — page 1, first — despite the
 * `user.signed_in` rows every other suite's signup keeps inserting into the shared DB.
 * Pass a resolvable `actorId`/`targetId` (a seeded user id) to exercise the email JOIN.
 */
export async function seedAuditRows(
  rows: Array<{
    action: AuditAction;
    actorId?: string | null;
    targetId: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  const base = Date.now() + 60 * 60 * 1000; // 1h ahead — newest despite concurrent sign-ins
  await db.insert(auditLog).values(
    rows.map((r, i) => ({
      action: r.action,
      actorId: r.actorId ?? null,
      targetId: r.targetId,
      metadata: r.metadata ?? null,
      createdAt: new Date(base - i * 1000),
    })),
  );
}

/** Delete seeded audit rows by their namespaced `targetId` prefix (leftover-safe re-runs). */
export async function deleteAuditRows(idPrefix: string): Promise<void> {
  await db.delete(auditLog).where(like(auditLog.targetId, `${idPrefix}-%`));
}

/**
 * Clear the magic-link endpoints' persisted limiter counters (the `rate_limit` table —
 * Better Auth `storage: "database"`) by DIRECT delete, the same sanctioned out-of-band
 * path as the other helpers. The 3/min send cap is deliberately tight (AUTH.md → Magic
 * link) and the DB-backed window SLIDES (every allowed request refreshes lastRequest),
 * so a back-to-back local run — or a serial retry, which re-sends — inherits the
 * previous run's count and would trip 429 without this reset. Keys are `<ip>|<path>`,
 * so the LIKE suffix match only ever touches these two endpoints' counters.
 */
export async function resetMagicLinkRateLimit(): Promise<void> {
  await db.delete(rateLimit).where(like(rateLimit.key, "%/sign-in/magic-link"));
  await db.delete(rateLimit).where(like(rateLimit.key, "%/magic-link/verify"));
}

/**
 * Seed `notifications` rows for a user (looked up by email) by DIRECT insert — the same
 * sanctioned out-of-band path as the other seed helpers. Gives the /notifications feed
 * enough rows (> NOTIFICATIONS_PAGE_SIZE) to exercise the keyset "Load more" (A25)
 * without firing dozens of live sends. Bodies are `Seeded notification NN` (zero-padded)
 * and createdAt is staggered into the past so #00 is newest … #(count-1) oldest, ordering
 * deterministically under the feed's (created_at desc, id desc). Notifications are
 * user-scoped (unlike /admin's shared list), so a unique per-run user needs no cleanup.
 */
export async function seedNotifications(email: string, count: number): Promise<void> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) throw new Error(`seedNotifications: no user for ${email}`);
  const base = Date.now();
  await db.insert(notifications).values(
    Array.from({ length: count }, (_, i) => ({
      userId: u.id,
      type: "test" as const,
      body: `Seeded notification ${String(i).padStart(2, "0")}`,
      createdAt: new Date(base - i * 1000),
    })),
  );
}

/**
 * Pin a user's display time zone by DIRECT upsert — the same sanctioned out-of-band
 * path as the other seed helpers.
 *
 * The calendar specs need the VIEWER's zone to differ from the event's, because that
 * is the only configuration in which placing an all-day event by its instant instead
 * of its wall date shows up as a wrong answer. Driving the /account preferences form
 * for that would cost a form round-trip per spec and couple the calendar suite to the
 * account UI.
 */
export async function setUserTimeZone(email: string, timeZone: string): Promise<void> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) throw new Error(`setUserTimeZone: no user for ${email}`);
  await db
    .insert(userPreferences)
    .values({ userId: u.id, timeZone })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { timeZone } });
}

/** Seed a calendar for a user (looked up by email) and return its id. */
export async function seedCalendar(
  email: string,
  options: { name: string; timeZone: string; color?: CalendarColor; isPrimary?: boolean },
): Promise<string> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) throw new Error(`seedCalendar: no user for ${email}`);
  const [row] = await db
    .insert(calendars)
    .values({
      userId: u.id,
      name: options.name,
      color: options.color ?? "chart-1",
      timeZone: options.timeZone,
      isPrimary: options.isPrimary ?? false,
    })
    .returning({ id: calendars.id });
  if (!row) throw new Error("seedCalendar: insert returned no row");
  return row.id;
}

/**
 * Seed events on a calendar.
 *
 * The instants and offsets come from the real `deriveEventInstants`, not from
 * hand-written literals — `calendar_events_start_at_derived` rejects anything else,
 * so a fixture with a plausible-looking instant would fail at insert time rather than
 * at assert time, and the failure would look like a schema bug rather than a fixture
 * bug. (The *planted-defect* test in `packages/db` deliberately does the opposite: it
 * bypasses this function with raw SQL to prove the constraint bites.)
 */
export async function seedEvents(
  calendarId: string,
  events: ReadonlyArray<{
    title: string;
    startWall: string;
    endWall: string;
    timeZone: string;
    allDay?: boolean;
    /** A canonical `RRULE` value. Unbounded rules need no `series_end_at`. */
    rrule?: string;
  }>,
): Promise<void> {
  await db.insert(calendarEvents).values(
    events.map((event) => {
      const derived = deriveEventInstants({
        startWall: event.startWall,
        startTzid: event.timeZone,
        endWall: event.endWall,
        endTzid: event.timeZone,
      });
      return {
        calendarId,
        uid: crypto.randomUUID(),
        title: event.title,
        allDay: event.allDay ?? false,
        startWall: event.startWall,
        startTzid: event.timeZone,
        endWall: event.endWall,
        endTzid: event.timeZone,
        startOffsetMinutes: derived.startOffsetMinutes,
        endOffsetMinutes: derived.endOffsetMinutes,
        startAt: new Date(derived.startAtMs),
        endAt: new Date(derived.endAtMs),
        rrule: event.rrule ?? null,
      };
    }),
  );
}

/**
 * Invite someone to an event by DIRECT insert — the same sanctioned out-of-band path as
 * the other seed helpers.
 *
 * It exists for the **signup and read budgets**, not for convenience. A second invitation
 * driven through the composer costs another dialog round-trip and another
 * `calendar.range` refetch against the 20/min per-user limiter, and the invite spec
 * deliberately spends its UI on the ONE invitation whose live delivery it is proving.
 *
 * **`user_id` is resolved here rather than left NULL, and that is load-bearing.** E2E users
 * sign up with a password, and with email unconfigured Better Auth leaves them
 * `email_verified = false` — while decision 14's claim arm requires a *verified* address.
 * A row with a NULL `user_id` would therefore be invisible to `calendar.listInvites`, and
 * the spec would fail looking exactly like a product bug. (The claim arm itself is proved
 * against real Postgres in `@repo/db`'s `calendar-attendees.test.ts`, where a verified
 * user can be seeded outright.)
 *
 * Attendees hang off the **series master**, so `eventId` must be a master's id — which is
 * what the grid chips carry (`data-event-id`).
 */
export async function seedAttendee(
  eventId: string,
  email: string,
  options: { role?: AttendeeRole; status?: AttendeeStatus } = {},
): Promise<void> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const status = options.status ?? "needs-action";
  await db.insert(calendarEventAttendees).values({
    eventId,
    // `calendar_event_attendees_email_lower` rejects anything else, and this helper is
    // one of the writers that CHECK exists for — it never passes through Zod.
    email: email.toLowerCase(),
    userId: u?.id ?? null,
    role: options.role ?? "required",
    status,
    // The pair CHECK is bidirectional: an answered row must carry a timestamp and an
    // unanswered one must not.
    respondedAt: status === "needs-action" ? null : new Date(),
  });
}

/**
 * One guest's stored RSVP, or `null` when they hold no row.
 *
 * The database-side half of the RSVP assertion. The toast and the pressed button prove the
 * UI believes the answer landed; this proves Postgres does — and it is the only way to
 * assert that responding to one invitation left the caller's *other* invitations alone,
 * which is what narrowing `respondToEvent`'s UPDATE to a single event is for.
 */
export async function getAttendeeStatus(
  eventId: string,
  email: string,
): Promise<AttendeeStatus | null> {
  const [row] = await db
    .select({ status: calendarEventAttendees.status })
    .from(calendarEventAttendees)
    .where(
      and(
        eq(calendarEventAttendees.eventId, eventId),
        eq(calendarEventAttendees.email, email.toLowerCase()),
      ),
    );
  return row?.status ?? null;
}

/**
 * The id of a series master by title, for a spec that created its event through the UI and
 * needs the `/calendar/event/[id]` route (clicking a chip opens the editor, not the detail
 * page). Scoped to the owner so parallel workers cannot read each other's fixtures.
 */
export async function getEventIdByTitle(ownerEmail: string, title: string): Promise<string | null> {
  const [row] = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
    .innerJoin(user, eq(user.id, calendars.userId))
    .where(and(eq(user.email, ownerEmail), eq(calendarEvents.title, title)));
  return row?.id ?? null;
}

/**
 * The `calendar-invitation` jobs enqueued for one address, newest first.
 *
 * **This is how the `.ics` gets asserted without running a worker.** The Playwright
 * `webServer` array runs two Next servers and nothing that drains `pgboss.job`, so an
 * assertion waiting on a captured email would simply hang. Reading the queue row instead
 * proves the thing that actually matters — that the writer assembled the right calendar and
 * addressed it to the right person — one step before delivery, which the live-verify pass
 * covers against a real inbox.
 *
 * Raw SQL because pg-boss owns its schema and `packages/db/AGENTS.md` forbids modelling it
 * in Drizzle.
 */
export async function getInvitationJobs(email: string): Promise<
  {
    kind: string;
    to: string;
    ics: string | null;
    rsvpUrl?: string;
    reask?: boolean;
    reason?: string;
    eventTitle: string;
    when: string;
  }[]
> {
  const rows = await db.execute<{ data: Record<string, unknown> }>(sql`
    SELECT data FROM pgboss.job
     WHERE name = 'calendar-invitation'
       AND data->>'to' = ${email.toLowerCase()}
     ORDER BY created_on DESC
  `);
  return rows.rows.map((row) => row.data as never);
}

/** Clear the queue so one spec's assertions cannot read another's jobs. */
export async function deleteInvitationJobs(email: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM pgboss.job
     WHERE name = 'calendar-invitation' AND data->>'to' = ${email.toLowerCase()}
  `);
}

/**
 * Delete a user's calendars, and with them their events.
 *
 * One statement: `calendar_events.calendar_id` cascades — and from Phase 3 so does
 * `calendar_event_attendees.event_id`, which is why that FK is `ON DELETE CASCADE` and not
 * `SET NULL`: a guest list outliving its event is not a thing, and this helper needed no
 * change to keep working. Events are SOFT-deleted by the app, so cleaning up by event would
 * leave rows behind; cleaning up by calendar removes them for real, which is what a test
 * database wants.
 */
export async function deleteCalendarFixtures(email: string): Promise<void> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) return;
  await db.delete(calendars).where(eq(calendars.userId, u.id));
}
