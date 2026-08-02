import { beforeEach, describe, expect, it, vi } from "vitest";

// @repo/db is mocked (no Postgres in the verify lane); @repo/validators is NOT, because the
// payload schema it enforces is the point of the last assertion here.
const returning = vi.fn();
const values = vi.fn((_row: unknown) => ({ returning }));
const insert = vi.fn((_table: unknown) => ({ values }));
const notify = vi.fn((_channel: string, _payload: unknown) => Promise.resolve());
vi.mock("@repo/db", () => ({
  db: { insert: (table: unknown) => insert(table) },
  notify: (channel: string, payload: unknown) => notify(channel, payload),
  NOTIFICATIONS_CHANNEL: "notifications",
}));
vi.mock("@repo/db/schema", () => ({ notifications: {} }));

const { handleCalendarReminderNotify } = await import("./calendar-reminder-notify");

const PAYLOAD = {
  deliveryId: "3f1b0a5e-6b0e-4b0f-9a2a-1c2d3e4f5a6b",
  userId: "user_1",
  eventTitle: "Standup",
  eventPath: "/calendar/event/abc",
  startsInMinutes: 15,
};

const ROW = {
  id: "9c8d7e6f-5a4b-4c3d-8e2f-1a0b9c8d7e6f",
  userId: "user_1",
  type: "calendar_reminder",
  body: "15",
  title: "Standup",
  link: "/calendar/event/abc",
  read: false,
  createdAt: new Date("2027-05-10T08:45:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  returning.mockResolvedValue([ROW]);
});

describe("handleCalendarReminderNotify", () => {
  it("writes the minutes as a MACHINE value and the title as the sentence slot", async () => {
    // The bug this shape exists to prevent: a localized phrase in `body` renders an English
    // clause inside a Spanish sentence, and BOTH parity guards stay green because they check
    // key presence, not slot semantics.
    await expect(handleCalendarReminderNotify(PAYLOAD)).resolves.toBeUndefined();
    expect(values).toHaveBeenCalledWith({
      userId: "user_1",
      type: "calendar_reminder",
      body: "15",
      title: "Standup",
      link: "/calendar/event/abc",
    });
  });

  it("publishes after the insert, with the row's own id and an ISO timestamp", async () => {
    await handleCalendarReminderNotify(PAYLOAD);
    expect(notify).toHaveBeenCalledWith("notifications", {
      id: ROW.id,
      userId: "user_1",
      type: "calendar_reminder",
      body: "15",
      title: "Standup",
      link: "/calendar/event/abc",
      read: false,
      createdAt: "2027-05-10T08:45:00.000Z",
    });
  });

  it("refuses an absolute link at the payload boundary", async () => {
    // `notifications_link_same_origin` would reject the insert, the handler would throw, and
    // every reminder would retry to exhaustion into the DLQ. Refusing here turns that into a
    // validation error before any row is attempted.
    await expect(
      handleCalendarReminderNotify({ ...PAYLOAD, eventPath: "https://evil.test/x" }),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a protocol-relative path, which a browser treats as absolute", async () => {
    await expect(
      handleCalendarReminderNotify({ ...PAYLOAD, eventPath: "//evil.test/x" }),
    ).rejects.toThrow();
    await expect(
      handleCalendarReminderNotify({ ...PAYLOAD, eventPath: "/\\evil.test/x" }),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws when the insert returns nothing, rather than publishing a phantom", async () => {
    returning.mockResolvedValue([]);
    await expect(handleCalendarReminderNotify(PAYLOAD)).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });
});
