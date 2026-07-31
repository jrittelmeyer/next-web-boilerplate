import { notificationPayloadSchema } from "@repo/validators";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the publish leg needs mocking: the insert leg takes its writer as a PARAMETER,
// which is the whole point of the split — a caller inside `db.transaction` passes `tx`,
// a caller outside passes `db`, and the test passes a stub.
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }));

vi.mock("@repo/db", () => ({
  notify: notifyMock,
  NOTIFICATIONS_CHANNEL: "notifications",
}));

import { createNotifications, type NewNotificationInput, publishNotifications } from "./create";

type Writer = Parameters<typeof createNotifications>[0];

const ROW = {
  id: "n1",
  userId: "u1",
  type: "calendar_invite" as const,
  body: "alice@example.com",
  title: "Standup",
  link: "/calendar/event/e1",
  read: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** A stub `Writer` whose `insert().values().returning()` resolves to `rows`. */
function stubWriter(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  return { writer: { insert } as unknown as Writer, insert, values, returning };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createNotifications", () => {
  it("returns nothing and never touches the writer for an empty list", async () => {
    // Callers legitimately diff their way to nothing to do (an unchanged attendee
    // list), and Drizzle rejects an INSERT with no VALUES.
    const { writer, insert } = stubWriter([]);
    await expect(createNotifications(writer, [])).resolves.toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("maps inserted rows to wire payloads, with createdAt as an ISO string", async () => {
    const { writer } = stubWriter([ROW]);

    const payloads = await createNotifications(writer, [
      { userId: "u1", type: "calendar_invite", body: "alice@example.com" },
    ]);

    expect(payloads).toEqual([
      {
        id: "n1",
        userId: "u1",
        type: "calendar_invite",
        body: "alice@example.com",
        title: "Standup",
        link: "/calendar/event/e1",
        read: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    // Every payload it returns must survive the bus, or the publish is a silent no-op.
    expect(notificationPayloadSchema.safeParse(payloads[0]).success).toBe(true);
  });

  it("defaults omitted title and link to null rather than leaving them undefined", async () => {
    // `undefined` would serialize away entirely through JSON.stringify on the NOTIFY
    // leg, landing at the bus as an absent key.
    const { writer, values } = stubWriter([ROW]);

    await createNotifications(writer, [{ userId: "u1", type: "system", body: "Hello" }]);

    expect(values).toHaveBeenCalledWith([
      { userId: "u1", type: "system", body: "Hello", title: null, link: null },
    ]);
  });

  it("inserts a whole batch in one statement", async () => {
    const { writer, insert, values } = stubWriter([ROW, { ...ROW, id: "n2", userId: "u2" }]);
    const rows: NewNotificationInput[] = [
      { userId: "u1", type: "calendar_cancelled", body: "a@example.com", title: "Standup" },
      { userId: "u2", type: "calendar_cancelled", body: "a@example.com", title: "Standup" },
    ];

    const payloads = await createNotifications(writer, rows);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
    expect(payloads).toHaveLength(2);
  });
});

describe("publishNotifications", () => {
  it("broadcasts every payload on the notifications channel", async () => {
    const payload = { ...ROW, createdAt: ROW.createdAt.toISOString() };

    await publishNotifications([payload, { ...payload, id: "n2" }]);

    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(notifyMock).toHaveBeenNthCalledWith(1, "notifications", payload);
  });

  it("does nothing for an empty list", async () => {
    await publishNotifications([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("the rolling-deploy contract", () => {
  it("parses a legacy payload that predates title and link", () => {
    // THE regression this phase exists to prevent. `title`/`link` are
    // `.nullable().default(null)`, not a bare `.nullable()`: mid-deploy an OLD
    // instance's notify() publishes a payload with neither key, and a bare
    // `.nullable()` would require them to be PRESENT. The new instance's bus
    // `safeParse`s and fails closed — no log, no error, no Sentry event — so the
    // notification vanishes. A bare `.nullable()` makes this test fail.
    const legacy = {
      id: "n1",
      userId: "u1",
      type: "test",
      body: "Test notification · 12:00:00 AM",
      read: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const parsed = notificationPayloadSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.title).toBeNull();
    expect(parsed.data?.link).toBeNull();
  });

  it("rejects a link that is not a same-origin path", () => {
    // The Zod half of decision 9. `//evil.com` and `/\evil.com` both start with `/`
    // and are both protocol-relative to a browser; the DB CHECK is the backstop.
    for (const link of ["//evil.com", "/\\evil.com", "http://evil.com", "javascript:x"]) {
      const parsed = notificationPayloadSchema.safeParse({
        id: "n1",
        userId: "u1",
        type: "system",
        body: "b",
        read: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        link,
      });
      expect(parsed.success, `${link} must be rejected`).toBe(false);
    }
  });
});
