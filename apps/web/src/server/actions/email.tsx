"use server";

import { sendWelcomeEmail as sendWelcomeEmailViaResend } from "@repo/email";

type ActionResult = { error: string } | { data: { id: string } };

/**
 * Example Server Action that sends the welcome email. The render + send + env gate
 * now live in @repo/email's `sendWelcomeEmail` helper (the same one Better Auth's
 * `afterEmailVerification` calls), so this action is just the server boundary.
 * Email is optional infra, so it degrades gracefully when RESEND_API_KEY /
 * EMAIL_FROM are absent rather than throwing.
 */
export async function sendWelcomeEmail(to: string, name?: string): Promise<ActionResult> {
  return sendWelcomeEmailViaResend({ to, name });
}
