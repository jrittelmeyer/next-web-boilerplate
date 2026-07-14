import { db, verification } from "@repo/db";
import { lt } from "drizzle-orm";
import { cleanupExpiredVerificationsPayload } from "../queues";

/**
 * Process one `cleanup-expired-verifications` job (A3): delete Better Auth
 * `verification` rows whose `expiresAt` has passed. These are short-lived
 * email-verify / password-reset tokens — once expired they're dead weight, and
 * never-completed verifications would otherwise accumulate forever.
 *
 * SCHEDULED, not event-driven: the worker registers this on a cron at boot (see
 * worker.ts), so there's no enqueuer and the payload is empty.
 *
 * Return = job complete. A DB error throws → pg-boss retries (at-least-once
 * delivery); the delete is idempotent (re-running just matches fewer/no rows),
 * so a retry after a partial failure is safe. With no expired rows it deletes 0
 * and completes — the graceful no-op case.
 */
export async function handleCleanupExpiredVerifications(data: unknown): Promise<void> {
  cleanupExpiredVerificationsPayload.parse(data);

  const deleted = await db
    .delete(verification)
    .where(lt(verification.expiresAt, new Date()))
    .returning({ id: verification.id });

  console.info(`[jobs] cleanup-expired-verifications: pruned ${deleted.length} expired row(s)`);
}
