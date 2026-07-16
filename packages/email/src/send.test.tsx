import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
  { label: "sendMagicLinkEmail", call: () => sendMagicLinkEmail({ to: TO, url: URL }) },
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
    expect(helpers).toHaveLength(9);
  });

  it.each(helpers)("$label resolves to a typed error instead of throwing", async ({ call }) => {
    const result = await call();
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/not configured/i);
  });
});

describe("send helpers — EMAIL_TEST_CAPTURE_DIR seam (path-to-100 #6)", () => {
  let captureDir: string;

  beforeEach(async () => {
    captureDir = await mkdtemp(path.join(tmpdir(), "email-capture-"));
    // The seam sits BEHIND the configured gate: fake creds make isEmailConfigured()
    // true (mirroring the E2E second-webServer env), then the capture dir diverts
    // delivery before any Resend call — no network in this test.
    vi.stubEnv("RESEND_API_KEY", "re_test_capture");
    vi.stubEnv("EMAIL_FROM", "Test <test@example.com>");
    vi.stubEnv("EMAIL_TEST_CAPTURE_DIR", captureDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(captureDir, { recursive: true, force: true });
  });

  it("writes the send as a JSON file (with the action URL) instead of calling Resend", async () => {
    const result = await sendMagicLinkEmail({ to: TO, url: URL });
    expect(result).toHaveProperty("data");

    const files = await readdir(captureDir);
    expect(files).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above.
    const entry = JSON.parse(await readFile(path.join(captureDir, files[0]!), "utf8"));
    expect(entry).toEqual({
      action: "magic-link sign-in",
      to: TO,
      subject: "Your sign-in link",
      url: URL,
    });
  });

  it("stays unconfigured-graceful when only the capture dir is set (no creds)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendMagicLinkEmail({ to: TO, url: URL });
    expect(result).toHaveProperty("error");
    expect(await readdir(captureDir)).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
