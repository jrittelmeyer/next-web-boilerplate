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
  /**
   * Find every reminder due in this tick and hand each one to a delivery queue (Phase 5).
   * SCHEDULED, like {@link cleanupExpiredVerifications} — the worker registers it on a
   * five-minute cron at boot. It is the only handler in this package that ENQUEUES.
   */
  calendarReminderSweep: "calendar-reminder-sweep",
  /** Email one due reminder to its owner (Phase 5). Enqueued by the sweeper. */
  calendarReminderEmail: "calendar-reminder-email",
  /** Deliver one due reminder to the in-app feed (Phase 5). Enqueued by the sweeper. */
  calendarReminderNotify: "calendar-reminder-notify",
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
 * `when` is pre-formatted, by `formatEventWhen` — which lives in `@repo/email` as of Phase 5,
 * because the reminder sweeper is a second caller that cannot reach `apps/web`. The rule it
 * obeys is narrower than "no dates here": `@repo/email` renders **event-zone** time (the
 * event's own time, in its own zone, named); **reader-relative** rendering stays in
 * `apps/web`, where next-intl and `user_preferences` are, and is unimplemented for email.
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

/**
 * Payload for the {@link JOBS.calendarReminderSweep} job (Phase 5). Takes NO input — the
 * sweeper reads its window from Postgres's own clock — so this is the empty object the
 * scheduler enqueues, kept for contract symmetry and to reject a stray payload. Same shape
 * and same reason as {@link cleanupExpiredVerificationsPayload}.
 */
export const calendarReminderSweepPayload = z.object({}).strict();
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type CalendarReminderSweepPayload = z.infer<typeof calendarReminderSweepPayload>;

/**
 * Shared by both delivery payloads below.
 *
 * **Self-contained, for a different reason than Phase 4's.** `calendarInvitationPayload` is
 * denormalised because the attendee row is already deleted when a cancellation runs. Here
 * the row still exists — but the SWEEPER holds the expansion result, and no later reader can
 * reconstruct which occurrence this delivery was for without redoing the expansion against
 * rows that may have moved in between. Re-reading would quietly deliver a reminder for the
 * wrong occurrence.
 *
 * `deliveryId` is the claimed `calendar_reminder_deliveries` row. It rides along for log
 * lines only and is deliberately NOT re-read: the claim already happened, and a handler that
 * re-checked it would be asking a question whose answer cannot change the outcome.
 *
 * `startsInMinutes` is computed by the sweeper from the Postgres clock and **rounded to the
 * nearest 5** — delivery is ±5–6 minutes and the copy must not imply precision it lacks.
 */
const reminderDelivery = {
  deliveryId: z.uuid(),
  eventTitle: z.string().min(1),
  startsInMinutes: z.number().int(),
};

export const calendarReminderEmailPayload = z.object({
  ...reminderDelivery,
  to: z.email(),
  /** Pre-formatted by `formatEventWhen` in `@repo/email` — event zone, zone named. */
  when: z.string().min(1),
  location: z.string().nullable(),
  /**
   * Absolute, or `null` when the worker has no `SITE_URL`/`BETTER_AUTH_URL`. Nullable
   * rather than optional on purpose: the alternative to omitting the button is putting the
   * literal string "undefined/calendar/event/…" into a real person's inbox.
   */
  eventUrl: z.url().nullable(),
});
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type CalendarReminderEmailPayload = z.infer<typeof calendarReminderEmailPayload>;

export const calendarReminderNotifyPayload = z.object({
  ...reminderDelivery,
  userId: z.string().min(1),
  /**
   * A **relative** path, and the schema enforces it because the database does too.
   * `notifications_link_same_origin` CHECKs `left(link,1) = '/'`, so an absolute URL here
   * would be rejected by Postgres, throw inside the handler, and retry to exhaustion into
   * the DLQ — every reminder, silently, until someone read the dead-letter log. Refusing it
   * at the payload boundary turns that into a validation error at enqueue time instead.
   */
  // Same expression as `notificationLinkSchema` in `@repo/validators`: `//evil.com` and
  // `/\evil.com` both begin with `/` and are both protocol-relative to a browser.
  eventPath: z.string().regex(/^\/(?![/\\])[^\s]*$/, "Must be a same-origin path"),
});
/** @public — the inferred payload type, exported for producers/handlers in consuming code. */
export type CalendarReminderNotifyPayload = z.infer<typeof calendarReminderNotifyPayload>;
