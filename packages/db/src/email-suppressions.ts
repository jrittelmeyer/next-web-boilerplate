import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import { emailSuppressions, type SuppressionReason } from "./schema/email-suppressions";

/**
 * One provider suppression event to persist (path-to-100 #8). `reason` is typed to
 * the `SuppressionReason` union so callers can't record a typo; `detail` carries the
 * provider's human-readable message and `emailId` the Resend send id that triggered
 * the event. Shared like `recordAuditEvent`: written by the apps/web webhook route,
 * read by `@repo/email` — which is why both helpers live in `@repo/db`.
 */
export type EmailSuppressionEvent = {
  email: string;
  reason: SuppressionReason;
  detail?: string | null;
  emailId?: string | null;
};

/**
 * Upsert an address into the do-not-send list. The address is normalized to
 * lowercase (SMTP addresses are case-insensitive in practice; storing one casing
 * makes the unique constraint the lookup index). Idempotent on redelivery: a
 * conflict refreshes `reason`/`detail`/`emailId`/`lastEventAt` to the latest event
 * and keeps `createdAt` as the first suppression.
 *
 * Unlike `recordAuditEvent` this is NOT best-effort — a failed write must surface
 * (throw) so the webhook route 500s and the provider redelivers the event;
 * swallowing it would silently drop the suppression.
 */
export async function recordEmailSuppression(event: EmailSuppressionEvent): Promise<void> {
  const email = event.email.trim().toLowerCase();
  await db
    .insert(emailSuppressions)
    .values({
      email,
      reason: event.reason,
      detail: event.detail ?? null,
      emailId: event.emailId ?? null,
    })
    .onConflictDoUpdate({
      target: emailSuppressions.email,
      set: {
        reason: event.reason,
        detail: event.detail ?? null,
        emailId: event.emailId ?? null,
        // DB clock, like the column's defaultNow() — mixing in the app clock here
        // lets lastEventAt run BACKWARDS when the two clocks are skewed (observed
        // ~700ms against the Docker Postgres).
        lastEventAt: sql`now()`,
      },
    });
}

/**
 * Is this address on the do-not-send list? A single indexed read on the normalized
 * (lowercased) address. Throws on a DB failure — the caller decides the posture
 * (`@repo/email`'s send helper fails OPEN with a logged warning, so a flaky lookup
 * can never block legitimate sends; see packages/email/src/send.tsx).
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, email.trim().toLowerCase()))
    .limit(1);
  return row !== undefined;
}
