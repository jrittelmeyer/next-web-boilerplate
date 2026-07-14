import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The security-relevant actions the audit log records (B2). Plain `text` union
 * (not a `pgEnum`) so adding an action later is a one-line edit with no
 * `ALTER TYPE` migration — the exact `user.role` precedent (see AUTH.md → RBAC).
 * The helper (`recordAuditEvent`, ../audit-log.ts) types its `action` to this, so a
 * typo won't compile; the column stays open text so an out-of-band writer (raw SQL,
 * a fork's new event) is never rejected at the DB.
 */
export const AUDIT_ACTIONS = [
  "user.role_changed",
  "user.deleted",
  "user.email_changed",
  "user.signed_in",
  // Admin plugin (Tier 4 · Band 4). An admin bans/unbans another user via the
  // banUser/unbanUser Server Actions (which wrap the admin() plugin's ban endpoints).
  "user.banned",
  "user.unbanned",
  // Admin plugin (Tier 4 · Band 4). An admin starts/stops impersonating another user
  // via the impersonateUser/stopImpersonating Server Actions (session-cookie swap).
  "user.impersonated",
  "user.impersonation_stopped",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Persisted, queryable trail for security-relevant events (B2) — the queryable
 * counterpart to the one-off structured log LINES that `setUserRole` /
 * `deleteUser.afterDelete` already emit to the BetterStack sink. Written by the
 * graceful `recordAuditEvent()` helper (../audit-log.ts) from four sites: an admin
 * role change (apps/web server action), and account deletion / email-change
 * completion / sign-in (the @repo/auth callbacks + a session-create databaseHook).
 *
 * `actorId`/`targetId` are plain `text` with **NO foreign key**, on purpose: an
 * audit record must OUTLIVE the users it references. A cascading FK would erase the
 * trail on account deletion (defeating the log), and the `user.deleted` row itself is
 * written in `afterDelete` — AFTER the `user` row is gone — so an FK insert would fail
 * its own constraint. Denormalized ids are the standard audit-table shape. They still
 * hold Better Auth `user.id` values (`text`, not `uuid`) for the common case where the
 * user exists.
 *
 * `metadata` (jsonb) carries the action-specific detail: `{ oldRole, newRole }`,
 * `{ oldEmail, newEmail }`, `{ ip, userAgent }`. Unlike the external log sink (IDs
 * only — no email PII leaves the app), this table lives in the app's OWN Postgres,
 * which already stores `user.email`, so recording an email change here is both safe
 * and the point of the record. See AUTH.md → Audit log + DATABASE.md.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").$type<AuditAction>().notNull(),
    // Denormalized (no FK) so the trail survives user deletion — see the note above.
    actorId: text("actor_id"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The primary read is "recent events, newest-first" (an admin trail / export),
    // so index created_at descending; target_id indexes the "everything that happened
    // to user X" query. actor_id is left unindexed until a by-actor read exists.
    index("audit_log_created_at_idx").on(t.createdAt.desc()),
    index("audit_log_target_id_idx").on(t.targetId),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
