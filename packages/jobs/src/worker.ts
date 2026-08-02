import "./load-env";
import { createBoss } from "./boss";
import { handleCalendarInvitation } from "./handlers/calendar-invitation";
import { handleCalendarReminderEmail } from "./handlers/calendar-reminder-email";
import { handleCalendarReminderNotify } from "./handlers/calendar-reminder-notify";
import { handleCalendarReminderSweep } from "./handlers/calendar-reminder-sweep";
import { handleCancelStripeSubscriptions } from "./handlers/cancel-stripe-subscriptions";
import { handleCleanupExpiredVerifications } from "./handlers/cleanup-expired-verifications";
import { handleDeadLetteredJob } from "./handlers/dead-letter";
import { handleDeleteUploads } from "./handlers/delete-uploads";
import { handleWelcomeEmail } from "./handlers/welcome-email";
import { startHeartbeat } from "./heartbeat";
import { ALL_QUEUES, DEAD_LETTER_QUEUE, JOBS } from "./queues";

/**
 * Cron for the recurring cleanup job — daily at 03:00 UTC (`tz` is set explicitly
 * below so the schedule doesn't drift with the host clock). Standard 5-field cron.
 */
const CLEANUP_CRON = "0 3 * * *";

/**
 * Cron for the reminder sweeper — every five minutes. Standard 5-field cron; `tz` is set
 * explicitly at the call site so it cannot drift with the host clock.
 *
 * **Five, not one.** A per-minute cron would write ~1,440 `pgboss.job` rows/day forever in
 * every generated project, including ones with no calendar at all, and pg-boss's own monitor
 * polls at ~60 s so per-minute is the resolution floor anyway. Delivery precision is
 * therefore ±5–6 minutes, which the reminder copy states rather than implies.
 */
const REMINDER_SWEEP_CRON = "*/5 * * * *";

/**
 * The standalone background-jobs worker — the CONSUMER half of D7. Enqueuing
 * happens in the web app (`enqueue.ts`); this process drains the queues.
 *
 *   pnpm --filter @repo/jobs start      # run it (or the `worker` Docker service)
 *
 * It's a separate, long-lived process: if it's down, jobs harmlessly accumulate
 * in `pgboss.job` and are processed when it next starts. Nothing about running
 * the app requires it to be up.
 */
async function main(): Promise<void> {
  const boss = createBoss({ supervise: true });

  // pg-boss emits 'error' for background/maintenance failures; log, don't crash.
  boss.on("error", (err) => console.error("[jobs] pg-boss error:", err));

  await boss.start();
  // The DLQ must exist before any queue references it. Every job queue then gets
  // `deadLetter` so an exhausted job is copied there instead of dying silently in
  // `state = 'failed'`. createQueue is create-if-absent (ON CONFLICT DO NOTHING —
  // verified in the installed 12.20.0), so the updateQueue converges queues that
  // already existed before the DLQ wiring (every pre-existing database); on a
  // fresh DB it's an idempotent no-op re-set of the same value.
  await boss.createQueue(DEAD_LETTER_QUEUE);
  for (const queue of ALL_QUEUES) {
    await boss.createQueue(queue, { deadLetter: DEAD_LETTER_QUEUE });
    await boss.updateQueue(queue, { deadLetter: DEAD_LETTER_QUEUE });
  }

  // Optional liveness signal to BetterStack — no-op unless BETTER_STACK_HEARTBEAT_URL
  // is set (see heartbeat.ts + @repo/observability). Start it after boss.start() so
  // we only report healthy once the worker can actually reach Postgres.
  const stopHeartbeat = startHeartbeat();

  // batchSize defaults to 1, so `jobs` holds a single job — but the handler
  // signature is an array, so iterate to stay correct if batching is enabled.
  await boss.work(JOBS.welcomeEmail, async (jobs) => {
    for (const job of jobs) await handleWelcomeEmail(job.data);
  });
  await boss.work(JOBS.deleteUploads, async (jobs) => {
    for (const job of jobs) await handleDeleteUploads(job.data);
  });
  await boss.work(JOBS.cancelStripeSubscriptions, async (jobs) => {
    for (const job of jobs) await handleCancelStripeSubscriptions(job.data);
  });
  await boss.work(JOBS.cleanupExpiredVerifications, async (jobs) => {
    for (const job of jobs) await handleCleanupExpiredVerifications(job.data);
  });
  await boss.work(JOBS.calendarInvitation, async (jobs) => {
    for (const job of jobs) await handleCalendarInvitation(job.data);
  });
  // The sweeper is handed `boss` because it ENQUEUES the deliveries it claims — the only
  // handler here that does. It must not use `enqueue.ts`: that builds a second pg-boss
  // instance inside this process and swallows every error, which is exactly the error the
  // sweeper needs in order to compensate its already-committed claim.
  await boss.work(JOBS.calendarReminderSweep, async (jobs) => {
    for (const job of jobs) await handleCalendarReminderSweep(boss, job.data);
  });
  await boss.work(JOBS.calendarReminderEmail, async (jobs) => {
    for (const job of jobs) await handleCalendarReminderEmail(job.data);
  });
  await boss.work(JOBS.calendarReminderNotify, async (jobs) => {
    for (const job of jobs) await handleCalendarReminderNotify(job.data);
  });
  // Watch the DLQ itself: log + env-gated Sentry capture per exhausted job.
  // includeMetadata exposes `output` (the final failure) alongside the payload.
  await boss.work(DEAD_LETTER_QUEUE, { includeMetadata: true }, async (jobs) => {
    for (const job of jobs) handleDeadLetteredJob(job);
  });

  // Register the recurring cleanup on a cron. Only the worker schedules (it runs
  // with supervise:true, so createBoss enabled pg-boss's cron scheduler). pg-boss
  // persists this in the `pgboss.schedule` table and re-registering on every boot
  // is an idempotent upsert (keyed by queue name), so it's safe to call here every
  // start. The schedule survives worker restarts; if the worker is down at 03:00
  // the tick is simply missed until it's back (at-least-once, not exactly-once).
  await boss.schedule(JOBS.cleanupExpiredVerifications, CLEANUP_CRON, {}, { tz: "UTC" });

  // Registered UNCONDITIONALLY, and that is a deliberate departure from the design note that
  // said to register it "only when the deployment actually has reminders". There is no
  // mechanism behind that: this is the only `boss.schedule` call and it runs once, at boot,
  // with no re-registration path anywhere. A conditional register would therefore mean the
  // FIRST reminder a deployment ever creates never fires until someone restarts the worker —
  // silently, with nothing reporting it. The cost avoided was ~288 `pgboss.job` rows/day,
  // which pg-boss archives on its own; the sweep's first statement is an EXISTS check that
  // returns immediately when no reminder rows exist, so an unused install pays a trivial
  // query, not a correctness hole.
  //
  // ⚠️ REMOVAL: this row persists in `pgboss.schedule` keyed by queue name, so deleting this
  // code is NOT enough — removal must call `boss.unschedule(JOBS.calendarReminderSweep)`
  // first, or the schedule keeps enqueueing into a queue nobody watches, forever. See
  // docs/context/calendar/remove-it.md.
  await boss.schedule(JOBS.calendarReminderSweep, REMINDER_SWEEP_CRON, {}, { tz: "UTC" });

  console.info(
    `[jobs] worker started — watching: ${ALL_QUEUES.join(", ")} (+ DLQ ${DEAD_LETTER_QUEUE})`,
  );
  console.info(
    `[jobs] scheduled ${JOBS.cleanupExpiredVerifications} — cron "${CLEANUP_CRON}" (UTC)`,
  );
  console.info(
    `[jobs] scheduled ${JOBS.calendarReminderSweep} — cron "${REMINDER_SWEEP_CRON}" (UTC)`,
  );

  // Graceful shutdown so in-flight jobs finish and connections close cleanly.
  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[jobs] ${signal} received — stopping worker…`);
    stopHeartbeat();
    await boss.stop({ graceful: true }).catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[jobs] worker failed to start:", err);
  process.exit(1);
});
