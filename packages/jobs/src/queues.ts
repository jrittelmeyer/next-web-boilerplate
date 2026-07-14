import { z } from "zod";

/**
 * The job contract — queue names + payload schemas — shared by BOTH sides:
 * the web app enqueues (`enqueue.ts`) and the worker processes (`worker.ts`).
 * Keeping them here means the producer and consumer can't drift: a payload is
 * validated with the same Zod schema when it's sent and again when it's run.
 *
 * pg-boss queues are addressed by string name; these constants are the single
 * source of truth so a typo can't silently route a job into a queue no worker
 * is watching.
 */
export const JOBS = {
  /** Send the post-verification welcome email (D7 example job). */
  welcomeEmail: "welcome-email",
  /** Delete a removed account's files from Uploadthing storage (P2-3). */
  deleteUploads: "delete-uploads",
  /**
   * Prune expired Better Auth `verification` rows (A3 example job). Unlike the two
   * above — which the web app ENQUEUES in response to an event — this one is
   * SCHEDULED: the worker registers it on a cron at boot (see worker.ts). It's the
   * worked example for recurring housekeeping.
   */
  cleanupExpiredVerifications: "cleanup-expired-verifications",
  /** Cancel a removed account's Stripe subscriptions (A13). */
  cancelStripeSubscriptions: "cancel-stripe-subscriptions",
} as const;

/** Every queue name, so the worker can create + register them in one loop. */
export const ALL_QUEUES = Object.values(JOBS);

/** Payload for the {@link JOBS.welcomeEmail} job. */
export const welcomeEmailPayload = z.object({
  to: z.email(),
  name: z.string().optional(),
});
export type WelcomeEmailPayload = z.infer<typeof welcomeEmailPayload>;

/**
 * Payload for the {@link JOBS.deleteUploads} job. `keys` are Uploadthing storage
 * keys, captured from the `uploads` table BEFORE the user row's delete cascades
 * them away; `userId` is only for log lines (the account is already gone when the
 * job runs).
 */
export const deleteUploadsPayload = z.object({
  userId: z.string().min(1),
  keys: z.array(z.string().min(1)).min(1),
});
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type DeleteUploadsPayload = z.infer<typeof deleteUploadsPayload>;

/**
 * Payload for the {@link JOBS.cleanupExpiredVerifications} job. It takes NO input —
 * the handler computes "expired" from the current time — so this is the empty
 * object the scheduler enqueues. Kept for contract symmetry (every job validates
 * its payload with the same schema on both sides) and to reject an accidental
 * stray payload.
 */
export const cleanupExpiredVerificationsPayload = z.object({}).strict();
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type CleanupExpiredVerificationsPayload = z.infer<typeof cleanupExpiredVerificationsPayload>;

/**
 * Payload for the {@link JOBS.cancelStripeSubscriptions} job (A13). `subscriptionIds`
 * are Stripe subscription ids (`sub_…` — the `subscriptions` table's PK), captured
 * from the user's rows BEFORE the delete cascade removes them; `userId` is only for
 * log lines (the account is already gone when the job runs).
 */
export const cancelStripeSubscriptionsPayload = z.object({
  userId: z.string().min(1),
  subscriptionIds: z.array(z.string().min(1)).min(1),
});
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type CancelStripeSubscriptionsPayload = z.infer<typeof cancelStripeSubscriptionsPayload>;
