import "./load-env";
import { createBoss } from "./boss";
import { handleCancelStripeSubscriptions } from "./handlers/cancel-stripe-subscriptions";
import { handleCleanupExpiredVerifications } from "./handlers/cleanup-expired-verifications";
import { handleDeleteUploads } from "./handlers/delete-uploads";
import { handleWelcomeEmail } from "./handlers/welcome-email";
import { startHeartbeat } from "./heartbeat";
import { ALL_QUEUES, JOBS } from "./queues";

/**
 * Cron for the recurring cleanup job — daily at 03:00 UTC (`tz` is set explicitly
 * below so the schedule doesn't drift with the host clock). Standard 5-field cron.
 */
const CLEANUP_CRON = "0 3 * * *";

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
  for (const queue of ALL_QUEUES) await boss.createQueue(queue);

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

  // Register the recurring cleanup on a cron. Only the worker schedules (it runs
  // with supervise:true, so createBoss enabled pg-boss's cron scheduler). pg-boss
  // persists this in the `pgboss.schedule` table and re-registering on every boot
  // is an idempotent upsert (keyed by queue name), so it's safe to call here every
  // start. The schedule survives worker restarts; if the worker is down at 03:00
  // the tick is simply missed until it's back (at-least-once, not exactly-once).
  await boss.schedule(JOBS.cleanupExpiredVerifications, CLEANUP_CRON, {}, { tz: "UTC" });

  console.info(`[jobs] worker started — watching: ${ALL_QUEUES.join(", ")}`);
  console.info(
    `[jobs] scheduled ${JOBS.cleanupExpiredVerifications} — cron "${CLEANUP_CRON}" (UTC)`,
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
