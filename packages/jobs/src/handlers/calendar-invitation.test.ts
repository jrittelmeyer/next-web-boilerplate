import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @repo/email so the handler is tested in isolation — no Resend, and its real
// `import "server-only"` never runs. The .ics CONTENT is asserted where it is produced
// (packages/calendar/src/ics.test.ts) and where it is assembled from real rows
// (apps/web's calendar action test); what matters here is that each kind reaches the right
// helper with the payload intact, and that no failure mode burns a retry it cannot fix.
const sendCalendarInvitationEmail = vi.fn();
const sendCalendarEventUpdatedEmail = vi.fn();
const sendCalendarEventCancelledEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock("@repo/email", () => ({
  sendCalendarInvitationEmail: (...args: unknown[]) => sendCalendarInvitationEmail(...args),
  sendCalendarEventUpdatedEmail: (...args: unknown[]) => sendCalendarEventUpdatedEmail(...args),
  sendCalendarEventCancelledEmail: (...args: unknown[]) => sendCalendarEventCancelledEmail(...args),
  isEmailConfigured: () => isEmailConfigured(),
}));

const { handleCalendarInvitation } = await import("./calendar-invitation");

const ICS = "BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n";
const RECIPIENT = {
  to: "guest@example.com",
  organizerEmail: "ada@example.com",
  eventTitle: "Standup",
  when: "Monday 10 August 2026 at 09:00",
};
const INVITE = {
  kind: "invite" as const,
  ...RECIPIENT,
  location: "Room 2",
  rsvpUrl: "https://app.test/rsvp/abc",
  ics: ICS,
};

beforeEach(() => {
  vi.clearAllMocks();
  sendCalendarInvitationEmail.mockResolvedValue({ data: { id: "email_1" } });
  sendCalendarEventUpdatedEmail.mockResolvedValue({ data: { id: "email_2" } });
  sendCalendarEventCancelledEmail.mockResolvedValue({ data: { id: "email_3" } });
});

describe("handleCalendarInvitation — one kind, one helper", () => {
  it("routes an invite, passing the .ics and the RSVP link through untouched", async () => {
    await expect(handleCalendarInvitation(INVITE)).resolves.toBeUndefined();
    expect(sendCalendarInvitationEmail).toHaveBeenCalledWith({
      ...RECIPIENT,
      location: "Room 2",
      rsvpUrl: "https://app.test/rsvp/abc",
      ics: ICS,
    });
    expect(sendCalendarEventUpdatedEmail).not.toHaveBeenCalled();
    expect(sendCalendarEventCancelledEmail).not.toHaveBeenCalled();
  });

  it("routes an update, carrying whether the guest is being re-asked", async () => {
    await handleCalendarInvitation({
      kind: "update",
      ...RECIPIENT,
      location: null,
      rsvpUrl: "https://app.test/rsvp/abc",
      ics: ICS,
      reask: true,
    });
    expect(sendCalendarEventUpdatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reask: true, location: null, ics: ICS }),
    );
  });

  it("routes a cancellation WITH an attachment", async () => {
    await handleCalendarInvitation({
      kind: "cancel",
      ...RECIPIENT,
      reason: "cancelled",
      ics: ICS,
    });
    expect(sendCalendarEventCancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "cancelled", ics: ICS }),
    );
  });

  it("routes a removal with NO attachment — the event still exists for everyone else", async () => {
    await handleCalendarInvitation({ kind: "cancel", ...RECIPIENT, reason: "removed", ics: null });
    expect(sendCalendarEventCancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "removed", ics: null }),
    );
  });
});

describe("handleCalendarInvitation — what retries and what does not", () => {
  it("throws (→ pg-boss retry) when a configured send fails", async () => {
    sendCalendarInvitationEmail.mockResolvedValue({ error: "rate limited" });
    isEmailConfigured.mockReturnValue(true);
    await expect(handleCalendarInvitation(INVITE)).rejects.toThrow(
      /calendar-invitation send failed for guest@example.com/,
    );
  });

  it("completes when email is unconfigured — the organizer's UI carries the link instead", async () => {
    sendCalendarInvitationEmail.mockResolvedValue({ error: "not configured" });
    isEmailConfigured.mockReturnValue(false);
    await expect(handleCalendarInvitation(INVITE)).resolves.toBeUndefined();
  });

  it("completes for a SUPPRESSED recipient — no retries, no DLQ", async () => {
    sendCalendarInvitationEmail.mockResolvedValue({
      error: "Recipient address is suppressed",
      suppressed: true,
    });
    // Configured, so suppression must terminate the job on its own.
    isEmailConfigured.mockReturnValue(true);
    await expect(handleCalendarInvitation(INVITE)).resolves.toBeUndefined();
  });
});

describe("handleCalendarInvitation — payload validation", () => {
  it("rejects an unknown kind before attempting to send", async () => {
    await expect(handleCalendarInvitation({ ...INVITE, kind: "nudge" })).rejects.toThrow();
    expect(sendCalendarInvitationEmail).not.toHaveBeenCalled();
  });

  it("rejects an invite with no .ics — the attachment is the point of the email", async () => {
    await expect(handleCalendarInvitation({ ...INVITE, ics: "" })).rejects.toThrow();
    await expect(handleCalendarInvitation({ ...INVITE, ics: null })).rejects.toThrow();
    expect(sendCalendarInvitationEmail).not.toHaveBeenCalled();
  });

  it("rejects a malformed recipient address", async () => {
    await expect(handleCalendarInvitation({ ...INVITE, to: "not-an-email" })).rejects.toThrow();
    expect(sendCalendarInvitationEmail).not.toHaveBeenCalled();
  });
});
