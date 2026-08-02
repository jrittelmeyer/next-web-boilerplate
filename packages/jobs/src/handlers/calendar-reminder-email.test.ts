import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @repo/email so the handler is tested in isolation — no Resend, and its real
// `import "server-only"` never runs. What matters here is the retry posture: which outcomes
// complete the job and which burn a retry.
const sendCalendarReminderEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock("@repo/email", () => ({
  sendCalendarReminderEmail: (...args: unknown[]) => sendCalendarReminderEmail(...args),
  isEmailConfigured: () => isEmailConfigured(),
}));

const { handleCalendarReminderEmail } = await import("./calendar-reminder-email");

const PAYLOAD = {
  deliveryId: "3f1b0a5e-6b0e-4b0f-9a2a-1c2d3e4f5a6b",
  to: "ada@example.com",
  eventTitle: "Standup",
  when: "Monday, 10 May 2027 at 09:00 (UTC)",
  location: "Room 2",
  eventUrl: "https://app.test/calendar/event/abc",
  startsInMinutes: 15,
};

beforeEach(() => {
  vi.clearAllMocks();
  sendCalendarReminderEmail.mockResolvedValue({ data: { id: "email_1" } });
  isEmailConfigured.mockReturnValue(true);
});

describe("handleCalendarReminderEmail", () => {
  it("sends the payload through untouched", async () => {
    await expect(handleCalendarReminderEmail(PAYLOAD)).resolves.toBeUndefined();
    expect(sendCalendarReminderEmail).toHaveBeenCalledWith({
      to: PAYLOAD.to,
      eventTitle: PAYLOAD.eventTitle,
      when: PAYLOAD.when,
      location: PAYLOAD.location,
      eventUrl: PAYLOAD.eventUrl,
      startsInMinutes: PAYLOAD.startsInMinutes,
    });
  });

  it("carries a null event URL rather than inventing one", async () => {
    // A worker with no SITE_URL must ship an email with no button, never one containing
    // "undefined/calendar/event/…".
    await handleCalendarReminderEmail({ ...PAYLOAD, eventUrl: null });
    expect(sendCalendarReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ eventUrl: null }),
    );
  });

  it("completes normally for a suppressed address — no retry can fix it", async () => {
    sendCalendarReminderEmail.mockResolvedValue({ suppressed: true, error: "suppressed" });
    await expect(handleCalendarReminderEmail(PAYLOAD)).resolves.toBeUndefined();
  });

  it("completes normally when email is unconfigured — the in-app channel still delivers", async () => {
    isEmailConfigured.mockReturnValue(false);
    sendCalendarReminderEmail.mockResolvedValue({ error: "not configured" });
    await expect(handleCalendarReminderEmail(PAYLOAD)).resolves.toBeUndefined();
  });

  it("throws on a real provider failure, so pg-boss retries", async () => {
    isEmailConfigured.mockReturnValue(true);
    sendCalendarReminderEmail.mockResolvedValue({ error: "502 from provider" });
    await expect(handleCalendarReminderEmail(PAYLOAD)).rejects.toThrow("502 from provider");
  });

  it("does not throw when the event was deleted between sweep and dispatch", async () => {
    // The self-contained payload means this handler cannot tell, and that is the accepted
    // trade — re-reading would reintroduce the "row is gone, tell nobody" branch Phase 4
    // removed. The requirement is only that it never dead-letters for it.
    await expect(handleCalendarReminderEmail(PAYLOAD)).resolves.toBeUndefined();
  });

  it("rejects a malformed payload before touching the provider", async () => {
    await expect(handleCalendarReminderEmail({ ...PAYLOAD, to: "not-an-email" })).rejects.toThrow();
    expect(sendCalendarReminderEmail).not.toHaveBeenCalled();
  });
});
