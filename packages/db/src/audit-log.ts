import { db } from "./client";
import { type AuditAction, auditLog } from "./schema/audit-log";

/**
 * One security-relevant event to persist in `audit_log` (B2). `action` is typed to
 * the `AuditAction` union so callers can't record a typo; `actorId` is who performed
 * it and `targetId` who it happened to (often the same user), both optional because a
 * system/unauthenticated event may have neither. `metadata` carries the
 * action-specific detail (`{ oldRole, newRole }`, `{ oldEmail, newEmail }`,
 * `{ ip, userAgent }`, …).
 */
export type AuditEvent = {
  action: AuditAction;
  actorId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Persist a security-relevant event to the `audit_log` table (B2) — the queryable
 * trail behind the one-off structured log lines the privileged mutations already emit.
 * Shared across packages: called from the `apps/web` server actions (role change) AND
 * the `@repo/auth` callbacks (deletion / email-change / sign-in), which is why it lives
 * in `@repo/db` rather than the app — `@repo/auth` can't import from `apps/web`.
 *
 * BEST-EFFORT BY CONTRACT: the audit write must never break the operation it records,
 * so every failure is swallowed to stderr and the caller continues. A dropped audit row
 * is strictly better than a failed role change / blocked sign-in. Callers therefore do
 * NOT need to wrap the call — but should still `void`/await it deliberately.
 *
 * See AUTH.md → Audit log + DATABASE.md → audit_log.
 */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLog).values({
      action: event.action,
      actorId: event.actorId ?? null,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? null,
    });
  } catch (error) {
    // Never let an audit-write failure surface into the recorded operation.
    console.error("[audit] failed to record event", event.action, error);
  }
}
