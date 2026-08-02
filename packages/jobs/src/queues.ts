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
  /** Email one calendar guest an invitation, an update or a cancellation (Phase 4). */
  calendarInvitation: "calendar-invitation",
} as const;

/** Every queue name, so the worker can create + register them in one loop. */
export const ALL_QUEUES = Object.values(JOBS);

/**
 * The dead-letter queue (DLQ, A20 → wired 2026-07-16). The worker creates every
 * queue in {@link ALL_QUEUES} with `deadLetter` set to this name, so a job that
 * exhausts its retries is COPIED here (original payload in `data`, final failure
 * in `output`) instead of dying silently in `state = 'failed'`. The worker
 * watches it with `handlers/dead-letter.ts` (log + env-gated Sentry capture).
 * Deliberately NOT in {@link ALL_QUEUES}: it must not dead-letter into itself,
 * and producers never enqueue to it directly. See SERVICES.md → Jobs.
 */
export const DEAD_LETTER_QUEUE = "failed-jobs";

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
 * Payload for the {@link JOBS.cancelStripeSubscriptions} job (A13; org-aware since
 * #11). `subscriptionIds` are Stripe subscription ids (`sub_…` — the `subscriptions`
 * table's PK), captured from the owner's rows BEFORE the delete cascade removes
 * them. `userId` and `organizationId` are only for log lines (the owner is already
 * gone when the job runs): a USER deletion sends the deleted user's id; an ORG
 * deletion (#11) sends the org's id plus the acting deleter as `userId`.
 */
export const cancelStripeSubscriptionsPayload = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1).optional(),
  subscriptionIds: z.array(z.string().min(1)).min(1),
});
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type CancelStripeSubscriptionsPayload = z.infer<typeof cancelStripeSubscriptionsPayload>;

/**
 * Payload for the {@link JOBS.calendarInvitation} job (Phase 4) — **self-contained, not a
 * pair of ids to re-read.** One job per recipient, so one hard-bounced address cannot force
 * forty-nine re-sends on a retry.
 *
 * The general rule, and the reason this payload looks different from
 * {@link deleteUploadsPayload}'s: **ids where the row survives, denormalised where the row
 * is the thing being destroyed.** `removeAttendees` in `apps/web` is a hard `DELETE` inside
 * the write transaction, and enqueueing happens after that commits — so for `kind: "cancel"`
 * there is no attendee row left to read, not even a race window. An id-only payload would
 * hit the handler's "the row is gone, complete normally" branch and silently tell nobody.
 * `welcomeEmailPayload` above already carries `to` for the same reason.
 *
 * It also has to be self-contained for a boundary reason: `@repo/jobs` depends on
 * `@repo/db` and `@repo/email` only. It cannot reach `apps/web`'s token module, and
 * `BETTER_AUTH_SECRET` is validated in the app's env schema alone — a worker holding a
 * different secret would sign a **wrong** RSVP link rather than fail to boot. Minting at
 * enqueue time keeps the signing key in one process.
 *
 * `when` is pre-formatted: the reader's locale and time zone live in `apps/web` (next-intl +
 * `user_preferences`), and neither this package nor `@repo/email` may format a date.
 */
const calendarRecipient = {
  to: z.email(),
  organizerEmail: z.email(),
  eventTitle: z.string().min(1),
  when: z.string().min(1),
};

export const calendarInvitationPayload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("invite"),
    ...calendarRecipient,
    location: z.string().nullable(),
    rsvpUrl: z.string().min(1),
    ics: z.string().min(1),
  }),
  z.object({
    kind: z.literal("update"),
    ...calendarRecipient,
    location: z.string().nullable(),
    rsvpUrl: z.string().min(1),
    ics: z.string().min(1),
    /** True only when the event moved in time; a venue or title edit does not re-ask. */
    reask: z.boolean(),
  }),
  z.object({
    kind: z.literal("cancel"),
    ...calendarRecipient,
    reason: z.enum(["cancelled", "removed"]),
    /**
     * `null` for a **removal**, and that is the decision rather than an omission: the event
     * is still going ahead for everyone else, so a `STATUS:CANCELLED` attachment would tell
     * the client to delete a live event. A cancelled event carries one.
     */
    ics: z.string().min(1).nullable(),
  }),
]);
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type CalendarInvitationPayload = z.infer<typeof calendarInvitationPayload>;
