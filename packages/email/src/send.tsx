import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { render } from "@react-email/render";
import { isEmailSuppressed } from "@repo/db";
import type { ReactElement } from "react";
import { getResend } from "./client";
import { ChangeEmail } from "./templates/change-email";
import { DeleteAccount } from "./templates/delete-account";
import { EmailChangedNotice } from "./templates/email-changed-notice";
import { MagicLinkEmail } from "./templates/magic-link";
import { OrganizationInvitation } from "./templates/organization-invitation";
import { ResetPasswordEmail } from "./templates/reset-password";
import { VerifyEmail } from "./templates/verify-email";
import { VerifyNewEmail } from "./templates/verify-new-email";
import { WelcomeEmail } from "./templates/welcome";

/**
 * Send helpers — the single place that turns a template + recipient into a Resend
 * call. Better Auth (`@repo/auth`) and app Server Actions both call these instead
 * of reaching for `resend` directly, so the env gate and graceful-degradation
 * behavior live in exactly one place.
 *
 * Graceful when unconfigured: email is optional infra, so a send NEVER throws when
 * RESEND_API_KEY / EMAIL_FROM are absent — the helpers return a typed error result
 * (and, outside production, log the action link so flows like verify/reset can be
 * completed locally without an email provider). This keeps the whole app building
 * and running with email env unset.
 *
 * `suppressed` (path-to-100 #8) marks the error as a do-not-send skip — the address
 * hard-bounced or complained (see the `email_suppressions` table) — so callers that
 * retry on error (the jobs worker) can tell "provider failed, retry" from "recipient
 * unreachable, stop". Optional discriminant: existing `"data" in result` checks are
 * unaffected.
 */
type SendResult = { error: string; suppressed?: true } | { data: { id: string } };

/** True when both Resend env vars are present (so a real send can happen). */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

const NOT_CONFIGURED = "Email is not configured (set RESEND_API_KEY and EMAIL_FROM).";

/**
 * Log an action link when email is unconfigured. Outside production this prints the
 * full URL so a developer can complete verify/reset flows without an email provider;
 * in production it stays quiet about the token (logging reset links is a leak).
 */
function logUnconfigured(action: string, to: string, url?: string): void {
  if (url && process.env.NODE_ENV !== "production") {
    console.info(`[email] ${action} for ${to} — email not configured, link: ${url}`);
  } else {
    console.warn(`[email] ${action} for ${to} skipped — ${NOT_CONFIGURED}`);
  }
}

/**
 * TEST-ONLY capture seam (path-to-100 #6). When EMAIL_TEST_CAPTURE_DIR is set (and
 * email is otherwise configured), sends are written as one JSON file each —
 * `{ action, to, subject, url }` — instead of calling Resend, so E2E can drive
 * email-delivered flows (the magic-link spec) with no provider, no network, and no
 * real key. Engaged only by the E2E config (fake creds + this dir on a second
 * webServer); never set it in a real deployment — it silently diverts delivery.
 * Unset (the default everywhere) this function is byte-identical to before.
 */
async function captureSend(
  captureDir: string,
  entry: { action: string; to: string; subject: string; url?: string },
): Promise<SendResult> {
  await mkdir(captureDir, { recursive: true });
  const file = path.join(captureDir, `${Date.now()}-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify(entry), "utf8");
  return { data: { id: `captured:${path.basename(file)}` } };
}

async function send(
  options: {
    to: string;
    subject: string;
    react: ReactElement;
  },
  // For the unconfigured-dev log only.
  meta: { action: string; url?: string },
): Promise<SendResult> {
  if (!isEmailConfigured()) {
    logUnconfigured(meta.action, options.to, meta.url);
    return { error: NOT_CONFIGURED };
  }

  // Suppression consult (path-to-100 #8), gated on the SAME env var that enables the
  // webhook feeding the list (RESEND_WEBHOOK_SECRET): unset — the default — means no
  // suppression events can ever arrive, so we skip the lookup entirely (zero DB
  // queries; behavior byte-identical to before #8). Sits BEFORE the capture seam so
  // E2E observes it: a suppressed recipient produces no capture file. Fails OPEN — a
  // broken lookup must never block legitimate sends; the provider's own account-side
  // suppression is the backstop.
  if (process.env.RESEND_WEBHOOK_SECRET) {
    try {
      if (await isEmailSuppressed(options.to)) {
        console.warn(
          `[email] ${meta.action} for ${options.to} skipped — address is suppressed (bounced/complained; see email_suppressions).`,
        );
        return { error: `Recipient address is suppressed: ${options.to}`, suppressed: true };
      }
    } catch (err) {
      console.warn(
        `[email] suppression lookup failed for ${options.to} — sending anyway:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const captureDir = process.env.EMAIL_TEST_CAPTURE_DIR;
  if (captureDir) {
    return captureSend(captureDir, {
      action: meta.action,
      to: options.to,
      subject: options.subject,
      url: meta.url,
    });
  }

  // Plain-text alternative part (P1-3): render the same tree with html-to-text so
  // every send is multipart (deliverability/spam scoring + text-only clients).
  // Best-effort — a plain-text rendering failure must not kill the send; the HTML
  // part (rendered by Resend from `react`) is unaffected.
  let text: string | undefined;
  try {
    text = await render(options.react, { plainText: true });
  } catch (err) {
    console.warn(
      `[email] plain-text render failed for ${meta.action}, sending HTML-only:`,
      err instanceof Error ? err.message : err,
    );
  }

  const { data, error } = await getResend().emails.send({
    // biome-ignore lint/style/noNonNullAssertion: isEmailConfigured() guarantees EMAIL_FROM is set.
    from: process.env.EMAIL_FROM!,
    to: options.to,
    subject: options.subject,
    react: options.react,
    text,
  });

  if (error) return { error: error.message };
  return { data: { id: data?.id ?? "" } };
}

/** Email-address verification (wired to Better Auth `sendVerificationEmail`). */
export function sendVerificationEmail(params: {
  to: string;
  url: string;
  name?: string;
}): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Verify your email",
      react: <VerifyEmail name={params.name} url={params.url} />,
    },
    { action: "verification email", url: params.url },
  );
}

/** Password reset (wired to Better Auth `sendResetPassword`). */
export function sendPasswordResetEmail(params: {
  to: string;
  url: string;
  name?: string;
}): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Reset your password",
      react: <ResetPasswordEmail name={params.name} url={params.url} />,
    },
    { action: "password reset email", url: params.url },
  );
}

/**
 * Email-change confirmation (M6, two-hop). Wired to Better Auth
 * `user.changeEmail.sendChangeEmailConfirmation`, which fires for a VERIFIED user
 * and sends to the CURRENT/old address — so `to` is the old email and `newEmail`
 * is the address the account would move to (shown in the body). Approving this is
 * hop 1; Better Auth then emails the new address its own verification (hop 2,
 * reuses `sendVerificationEmail` → `VerifyEmail`).
 */
export function sendChangeEmailConfirmationEmail(params: {
  to: string;
  newEmail: string;
  url: string;
  name?: string;
}): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Confirm your email change",
      react: <ChangeEmail name={params.name} newEmail={params.newEmail} url={params.url} />,
    },
    { action: "change-email confirmation", url: params.url },
  );
}

/**
 * New-address verification (M7, hop-2 of the two-hop change). Wired to Better Auth
 * `emailVerification.sendVerificationEmail`, but only when the verification token is
 * a *change-email* one — `@repo/auth` branches on the token so the sign-up flow keeps
 * `VerifyEmail` and an email change gets this "confirm your new address" copy. Sent to
 * the NEW address (`to`).
 */
export function sendNewEmailVerificationEmail(params: {
  to: string;
  url: string;
  name?: string;
}): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Confirm your new email address",
      react: <VerifyNewEmail name={params.name} url={params.url} />,
    },
    { action: "new-email verification", url: params.url },
  );
}

/**
 * Courtesy "your email was changed" notice (M7). Sent to the user's OLD address once a
 * verified email change COMPLETES (from `@repo/auth`'s `afterEmailVerification`) — an
 * out-of-band security alert. Informational (no link); `newEmail` is shown so the
 * recipient knows what the account moved to.
 */
export function sendEmailChangedNoticeEmail(params: {
  to: string;
  newEmail: string;
  name?: string;
}): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Your email address was changed",
      react: <EmailChangedNotice name={params.name} newEmail={params.newEmail} />,
    },
    { action: "email-changed notice" },
  );
}

/**
 * Account-deletion confirmation (P2-2). Wired to Better Auth
 * `user.deleteUser.sendDeleteAccountVerification`, which `@repo/auth` registers ONLY
 * when email is configured — so this helper's unconfigured fallback should never be
 * hit from the real flow (with email unset, deletion takes the immediate path
 * instead; a link that can't be delivered must never be the only way to delete).
 * Sent to the account's own address; opening the link (signed in) completes the
 * deletion.
 */
export function sendDeleteAccountVerificationEmail(params: {
  to: string;
  url: string;
  name?: string;
}): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Confirm account deletion",
      react: <DeleteAccount name={params.name} url={params.url} />,
    },
    { action: "delete-account confirmation", url: params.url },
  );
}

/**
 * Organization invitation (wired to the Better Auth `organization()` plugin's
 * `sendInvitationEmail`). Sent to the invited address with a link to the app's
 * accept-invitation route. Graceful like every other send: when email is unconfigured
 * the invitation row still exists, so the org-members UI surfaces a copyable accept
 * link instead — the invite flow works without an email provider.
 */
export function sendOrganizationInvitationEmail(params: {
  to: string;
  organizationName: string;
  inviterName?: string;
  role?: string;
  url: string;
}): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: `You've been invited to join ${params.organizationName}`,
      react: (
        <OrganizationInvitation
          inviterName={params.inviterName}
          organizationName={params.organizationName}
          role={params.role}
          url={params.url}
        />
      ),
    },
    { action: "organization invitation", url: params.url },
  );
}

/**
 * Magic-link sign-in (path-to-100 #6). Wired to the Better Auth `magicLink()`
 * plugin's `sendMagicLink`, which `@repo/auth` registers ONLY when email is
 * configured — a sign-in link that can never be delivered must never be offered, so
 * with email unset the plugin (and the login-page affordance) is absent entirely and
 * this helper's unconfigured fallback should never be hit from the real flow. No
 * `name`: the recipient may not have an account yet (sign-up-via-link).
 */
export function sendMagicLinkEmail(params: { to: string; url: string }): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Your sign-in link",
      react: <MagicLinkEmail url={params.url} />,
    },
    { action: "magic-link sign-in", url: params.url },
  );
}

/** Welcome email (wired to Better Auth `afterEmailVerification`). */
export function sendWelcomeEmail(params: { to: string; name?: string }): Promise<SendResult> {
  return send(
    {
      to: params.to,
      subject: "Welcome!",
      react: <WelcomeEmail name={params.name} />,
    },
    { action: "welcome email" },
  );
}
