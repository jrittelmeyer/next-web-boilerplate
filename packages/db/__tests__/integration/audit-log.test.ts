import { auditLog, db, recordAuditEvent } from "@repo/db";
import { eq, like, or } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * DB-backed integration test for the audit-log helper (B2). `recordAuditEvent` runs
 * against a REAL Postgres — no mocks — proving the round-trip (record → read back),
 * the jsonb metadata, the null-coalescing of absent fields, and the load-bearing
 * FK-LESS design: an event referencing a user that does NOT exist still inserts.
 * That last property is exactly the `user.deleted` case — the row is written in
 * `deleteUser.afterDelete`, AFTER the `user` row is gone, so a foreign key would make
 * the audit insert fail its own constraint. See packages/db/src/audit-log.ts + AUTH.md.
 *
 * All rows use the `integration-test-audit` id prefix so cleanup removes exactly this
 * test's rows without touching db:seed or other integration suites (audit_log has no
 * FK, so nothing cascades it away for us — we delete by prefix explicitly).
 */
const PREFIX = "integration-test-audit";

async function cleanup() {
  await db
    .delete(auditLog)
    .where(or(like(auditLog.actorId, `${PREFIX}%`), like(auditLog.targetId, `${PREFIX}%`)));
}

describe("audit log (integration)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("records an event and reads it back with its jsonb metadata", async () => {
    await recordAuditEvent({
      action: "user.role_changed",
      actorId: `${PREFIX}-actor`,
      targetId: `${PREFIX}-target`,
      metadata: { oldRole: "user", newRole: "admin" },
    });

    const [row] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, `${PREFIX}-actor`));
    expect(row?.action).toBe("user.role_changed");
    expect(row?.targetId).toBe(`${PREFIX}-target`);
    expect(row?.metadata).toEqual({ oldRole: "user", newRole: "admin" });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it("inserts even when the referenced user does not exist (FK-less — the user.deleted case)", async () => {
    const ghost = `${PREFIX}-ghost-user-that-was-deleted`;
    // No `user` row has this id. A foreign key would reject this insert; the audit
    // table must accept it, or the account-deletion event could never be recorded.
    await recordAuditEvent({ action: "user.deleted", actorId: ghost, targetId: ghost });

    const rows = await db.select().from(auditLog).where(eq(auditLog.targetId, ghost));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("user.deleted");
  });

  it("defaults absent actor and metadata to null", async () => {
    await recordAuditEvent({ action: "user.signed_in", targetId: `${PREFIX}-bare` });

    const [row] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, `${PREFIX}-bare`));
    expect(row?.actorId).toBeNull();
    expect(row?.metadata).toBeNull();
  });
});

describe("data-export's audit or() completeness (predicate-sensor long tail)", () => {
  /**
   * `data-export.ts:73-75`'s read, restated (the action lives in apps/web, which
   * this package cannot depend on). A GDPR export must surface every event the
   * user appears in, whichever side of the event they were on — narrowing to one
   * arm silently drops half a user's export, the F4 bug shape (attendees.md's
   * cancellation fan-out) resurfacing on a different table.
   */
  const ACTOR_ONLY_EVENT = `${PREFIX}-completeness-actor-event`;
  const TARGET_ONLY_EVENT = `${PREFIX}-completeness-target-event`;
  const SUBJECT = `${PREFIX}-completeness-subject`;
  const OTHER_ACTOR = `${PREFIX}-completeness-other-actor`;
  const OTHER_TARGET = `${PREFIX}-completeness-other-target`;

  beforeEach(async () => {
    await cleanup();
    // The subject is only the ACTOR of one event (they changed someone else's role)...
    await recordAuditEvent({
      action: "user.role_changed",
      actorId: SUBJECT,
      targetId: OTHER_TARGET,
      metadata: { event: ACTOR_ONLY_EVENT },
    });
    // ...and only the TARGET of a different event (someone else changed theirs).
    await recordAuditEvent({
      action: "user.role_changed",
      actorId: OTHER_ACTOR,
      targetId: SUBJECT,
      metadata: { event: TARGET_ONLY_EVENT },
    });
  });

  async function exportedEvents(userId: string, scoped: boolean) {
    const rows = await db.query.auditLog.findMany({
      where: scoped
        ? or(eq(auditLog.actorId, userId), eq(auditLog.targetId, userId))
        : eq(auditLog.actorId, userId),
    });
    return rows.map((row) => (row.metadata as { event: string } | null)?.event).sort();
  }

  it("includes events where the subject is only the actor and only the target", async () => {
    expect(await exportedEvents(SUBJECT, true)).toEqual(
      [ACTOR_ONLY_EVENT, TARGET_ONLY_EVENT].sort(),
    );
  });

  it("drops the target-only event under the spelling missing that arm — the defect", async () => {
    expect(await exportedEvents(SUBJECT, false)).toEqual([ACTOR_ONLY_EVENT]);
  });

  afterAll(cleanup);
});
