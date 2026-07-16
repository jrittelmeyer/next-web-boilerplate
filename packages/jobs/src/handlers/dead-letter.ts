import * as Sentry from "@sentry/node";
import type { JobWithMetadata } from "pg-boss";

// Lazy one-time Sentry init, only when configured. The worker reuses the app's
// NEXT_PUBLIC_SENTRY_DSN (a DSN is not a secret — it ships in the client bundle;
// reusing it means the DLQ alert lands in the same Sentry project with zero new
// env surface). Unset → console-only, exactly today's graceful-degradation shape.
let sentryReady = false;
function sentryEnabled(): boolean {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;
  if (!sentryReady) {
    Sentry.init({ dsn });
    sentryReady = true;
  }
  return true;
}

/**
 * DLQ consumer (A20 → wired 2026-07-16): a job lands here after exhausting its
 * source queue's retries — the worker creates every queue with
 * `deadLetter: DEAD_LETTER_QUEUE` (worker.ts). pg-boss copies the ORIGINAL
 * payload to `data` and the final failure to `output`; the source queue name is
 * NOT carried (pg-boss's dead-letter insert keeps only payload + output), so
 * triage starts from those two. Console is the always-on sink (the worker's
 * stdout is what BetterStack/Docker tail); Sentry rides along when configured.
 */
export function handleDeadLetteredJob(job: JobWithMetadata<unknown>): void {
  console.error(
    `[jobs] DEAD-LETTERED job ${job.id} — payload + last failure:`,
    JSON.stringify({ data: job.data, output: job.output }),
  );
  if (sentryEnabled()) {
    Sentry.captureMessage("Background job dead-lettered", {
      level: "error",
      extra: { jobId: job.id, data: job.data, output: job.output },
    });
  }
}
