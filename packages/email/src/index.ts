// Re-exported so the apps/web webhook route can type the verified event without
// depending on `resend` directly — the SDK stays this package's implementation detail.
export type { WebhookEventPayload } from "resend";
export { getResend } from "./client";
// Event-zone rendering for emails — shared by `apps/web`'s invitation path and the
// `@repo/jobs` reminder sweeper, which cannot reach `apps/web`. See src/format.ts.
export { formatEventWhen } from "./format";
export {
  type EmailAttachment,
  isEmailConfigured,
  sendCalendarEventCancelledEmail,
  sendCalendarEventUpdatedEmail,
  sendCalendarInvitationEmail,
  sendCalendarReminderEmail,
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
