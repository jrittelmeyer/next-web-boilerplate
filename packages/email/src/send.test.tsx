import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the suppression lookup seam (path-to-100 #8) — these are unit tests, so no
// Postgres: the real round-trip lives in packages/db's integration suite. The mock
// resolves false by default so every pre-#8 test in this file behaves exactly as
// before (and the consult is gated off anyway while RESEND_WEBHOOK_SECRET is unset).
const { isEmailSuppressedMock } = vi.hoisted(() => ({
  isEmailSuppressedMock: vi.fn().mockResolvedValue(false),
}));
vi.mock("@repo/db", () => ({ isEmailSuppressed: isEmailSuppressedMock }));

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

describe("send helpers — suppression consult (path-to-100 #8)", () => {
  let captureDir: string;

  // Configured + capture-diverted (so "the send happened" is observable as a file,
  // with no Resend/network), with the webhook secret set to arm the consult — the
  // exact posture of the E2E's :3001 server.
  beforeEach(async () => {
    captureDir = await mkdtemp(path.join(tmpdir(), "email-suppress-"));
    vi.stubEnv("RESEND_API_KEY", "re_test_capture");
    vi.stubEnv("EMAIL_FROM", "Test <test@example.com>");
    vi.stubEnv("EMAIL_TEST_CAPTURE_DIR", captureDir);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
    isEmailSuppressedMock.mockReset().mockResolvedValue(false);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(captureDir, { recursive: true, force: true });
  });

  it("returns the typed suppressed result and does NOT send when the address is listed", async () => {
    isEmailSuppressedMock.mockResolvedValue(true);
    const result = await sendWelcomeEmail({ to: TO, name: "Ada" });
    expect(result).toEqual({ error: `Recipient address is suppressed: ${TO}`, suppressed: true });
    expect(isEmailSuppressedMock).toHaveBeenCalledWith(TO);
    expect(await readdir(captureDir)).toHaveLength(0); // the send never happened
  });

  it("sends normally when the address is not listed", async () => {
    const result = await sendWelcomeEmail({ to: TO, name: "Ada" });
    expect(result).toHaveProperty("data");
    expect(isEmailSuppressedMock).toHaveBeenCalledTimes(1);
    expect(await readdir(captureDir)).toHaveLength(1);
  });

  it("never queries the list while RESEND_WEBHOOK_SECRET is unset (the default)", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const result = await sendWelcomeEmail({ to: TO, name: "Ada" });
    expect(result).toHaveProperty("data");
    expect(isEmailSuppressedMock).not.toHaveBeenCalled();
    expect(await readdir(captureDir)).toHaveLength(1);
  });

  it("fails OPEN when the lookup errors — the send proceeds with a logged warning", async () => {
    isEmailSuppressedMock.mockRejectedValue(new Error("connection refused"));
    const result = await sendWelcomeEmail({ to: TO, name: "Ada" });
    expect(result).toHaveProperty("data");
    expect(await readdir(captureDir)).toHaveLength(1);
    // The address must be a format ARG (%s), never interpolated into the format
    // string itself — a %s-bearing address would otherwise consume the error arg
    // (js/tainted-format-string, fixed 2026-07-17).
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("suppression lookup failed for %s"),
      TO,
      "connection refused",
    );
  });
});
