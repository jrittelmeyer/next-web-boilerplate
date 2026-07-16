import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Why a suppression landed. Plain `text` union (not a `pgEnum`) so adding a reason
 * later is a one-line edit with no `ALTER TYPE` migration — the `audit_log.action`
 * precedent. The helper (`recordEmailSuppression`, ../email-suppressions.ts) types
 * its `reason` to this so a typo won't compile; the column stays open text so an
 * out-of-band writer is never rejected at the DB.
 *
 * - `bounce`     — a PERMANENT delivery failure (hard bounce); transient bounces are
 *                  log-only and never recorded.
 * - `complaint`  — the recipient marked a message as spam.
 * - `provider`   — Resend suppressed the send account-side (`email.suppressed`);
 *                  recording it keeps our list in sync with theirs.
 */
export const SUPPRESSION_REASONS = ["bounce", "complaint", "provider"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/**
 * Do-not-send list fed by the Resend webhook (path-to-100 #8) and consulted by the
 * `@repo/email` send helper before every configured send. One row per address —
 * `email` is stored LOWERCASE (the helper normalizes) and its unique constraint is
 * both the upsert conflict target and the lookup index, so `isEmailSuppressed` is a
 * single indexed read.
 *
 * Deliberately NO user FK: suppressions are about the ADDRESS, not the account — a
 * bounced address stays undeliverable after the account is deleted (or before one
 * exists, e.g. an org invitation to an outside address), and most suppressed
 * addresses never had a `user` row at all. Denormalized like `audit_log`.
 *
 * `createdAt` is when the address was FIRST suppressed; `reason`/`detail`/`emailId`/
 * `lastEventAt` track the LATEST provider event (the upsert refreshes them).
 * Un-suppress by deleting the row (see SERVICES.md → Resend).
 */
export const emailSuppressions = pgTable("email_suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  reason: text("reason").$type<SuppressionReason>().notNull(),
  // Provider detail for a human reading the row (the bounce/suppression message).
  detail: text("detail"),
  // The Resend email id of the send that triggered the event — joins the row back
  // to the provider dashboard's log.
  emailId: text("email_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;
