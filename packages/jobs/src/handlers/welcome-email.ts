import { isEmailConfigured, sendWelcomeEmail } from "@repo/email";
import { welcomeEmailPayload } from "../queues";

/**
 * Process one `welcome-email` job. Validates the payload with the SAME schema
 * the enqueuer used, then hands off to the shared `@repo/email` send helper.
 *
 * Return = job complete. Throw = pg-boss retries (at-least-once delivery). We
 * only throw on a REAL provider error: when email is unconfigured (the default)
 * the helper no-ops, so there's nothing to retry and we complete the job.
 */
export async function handleWelcomeEmail(data: unknown): Promise<void> {
  const { to, name } = welcomeEmailPayload.parse(data);
  const result = await sendWelcomeEmail({ to, name });

  if ("data" in result) {
    console.info(`[jobs] welcome-email sent to ${to} (id: ${result.data.id})`);
    return;
  }

  if (!isEmailConfigured()) {
    console.info(`[jobs] welcome-email for ${to} skipped — email not configured`);
    return;
  }

  throw new Error(`welcome-email send failed for ${to}: ${result.error}`);
}
