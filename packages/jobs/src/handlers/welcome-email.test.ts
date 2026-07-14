import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @repo/email so the handler is tested in isolation — no Resend, no
// server-only. vi.mock replaces the module entirely, so its real code (and its
// `import "server-only"`) never runs.
const sendWelcomeEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock("@repo/email", () => ({
  sendWelcomeEmail: (...args: unknown[]) => sendWelcomeEmail(...args),
  isEmailConfigured: () => isEmailConfigured(),
}));

const { handleWelcomeEmail } = await import("./welcome-email");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleWelcomeEmail", () => {
  it("sends the welcome email for a valid payload", async () => {
    sendWelcomeEmail.mockResolvedValue({ data: { id: "email_123" } });

    await expect(
      handleWelcomeEmail({ to: "user@example.com", name: "Ada" }),
    ).resolves.toBeUndefined();
    expect(sendWelcomeEmail).toHaveBeenCalledWith({ to: "user@example.com", name: "Ada" });
  });

  it("completes without throwing when email is unconfigured", async () => {
    sendWelcomeEmail.mockResolvedValue({ error: "not configured" });
    isEmailConfigured.mockReturnValue(false);

    await expect(handleWelcomeEmail({ to: "user@example.com" })).resolves.toBeUndefined();
  });

  it("throws (→ pg-boss retry) when a configured send fails", async () => {
    sendWelcomeEmail.mockResolvedValue({ error: "rate limited" });
    isEmailConfigured.mockReturnValue(true);

    await expect(handleWelcomeEmail({ to: "user@example.com" })).rejects.toThrow(
      /welcome-email send failed/,
    );
  });

  it("rejects an invalid payload before attempting to send", async () => {
    await expect(handleWelcomeEmail({ to: "not-an-email" })).rejects.toThrow();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
