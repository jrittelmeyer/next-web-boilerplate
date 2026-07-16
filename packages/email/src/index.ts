// Re-exported so the apps/web webhook route can type the verified event without
// depending on `resend` directly — the SDK stays this package's implementation detail.
export type { WebhookEventPayload } from "resend";
export { getResend } from "./client";
export {
  isEmailConfigured,
  sendChangeEmailConfirmationEmail,
  sendDeleteAccountVerificationEmail,
  sendEmailChangedNoticeEmail,
  sendMagicLinkEmail,
  sendNewEmailVerificationEmail,
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./send";
