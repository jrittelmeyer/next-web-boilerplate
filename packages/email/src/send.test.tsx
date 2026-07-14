import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendChangeEmailConfirmationEmail,
  sendDeleteAccountVerificationEmail,
  sendEmailChangedNoticeEmail,
  sendNewEmailVerificationEmail,
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./send";

/**
 * Every send helper funnels through the same env gate: with RESEND_API_KEY /
 * EMAIL_FROM unset a send NEVER throws — it returns a typed `{ error }` result (and,
 * outside production, logs the action link) so the whole app builds and runs with
 * email off. This locks that graceful-degradation contract across all eight helpers.
 * (The configured send path is exercised live against real Resend creds in
 * VERIFICATION.md Phase 4 — not re-mocked here.)
 */
type SendResult = { error: string } | { data: { id: string } };

const TO = "recipient@example.com";
const URL = "https://app.test/action?token=abc123";

const helpers: Array<{ label: string; call: () => Promise<SendResult> }> = [
  {
    label: "sendVerificationEmail",
    call: () => sendVerificationEmail({ to: TO, url: URL, name: "Ada" }),
  },
  {
    label: "sendPasswordResetEmail",
    call: () => sendPasswordResetEmail({ to: TO, url: URL, name: "Ada" }),
  },
  {
    label: "sendChangeEmailConfirmationEmail",
    call: () =>
      sendChangeEmailConfirmationEmail({
        to: TO,
        newEmail: "new@example.com",
        url: URL,
        name: "Ada",
      }),
  },
  {
    label: "sendNewEmailVerificationEmail",
    call: () => sendNewEmailVerificationEmail({ to: TO, url: URL, name: "Ada" }),
  },
  {
    label: "sendEmailChangedNoticeEmail",
    call: () => sendEmailChangedNoticeEmail({ to: TO, newEmail: "new@example.com", name: "Ada" }),
  },
  {
    label: "sendDeleteAccountVerificationEmail",
    call: () => sendDeleteAccountVerificationEmail({ to: TO, url: URL, name: "Ada" }),
  },
  {
    label: "sendOrganizationInvitationEmail",
    call: () =>
      sendOrganizationInvitationEmail({
        to: TO,
        organizationName: "Acme",
        inviterName: "Grace",
        role: "admin",
        url: URL,
      }),
  },
  { label: "sendWelcomeEmail", call: () => sendWelcomeEmail({ to: TO, name: "Ada" }) },
];

describe("send helpers — graceful degradation (email unconfigured)", () => {
  beforeEach(() => {
    // Force "unconfigured" deterministically regardless of the ambient env, and
    // silence the intentional info/warn logs the unconfigured path emits.
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("covers every send helper", () => {
    expect(helpers).toHaveLength(8);
  });

  it.each(helpers)("$label resolves to a typed error instead of throwing", async ({ call }) => {
    const result = await call();
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/not configured/i);
  });
});
