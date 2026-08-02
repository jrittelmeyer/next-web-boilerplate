import { beforeEach, describe, expect, it, vi } from "vitest";

// The sweep's real work is proven in two other places: `reminders/sweep.test.ts` covers the
// pure selection maths, and the DB-backed integration suite covers the claim/enqueue/prune
// path against a real Postgres. What is left to assert HERE is exactly what this file is —
// a shell that validates its payload and hands `boss` on. If this test ever needs a
// database, the handler has grown logic that belongs in `reminders/`.
const runSweep = vi.fn();
vi.mock("../reminders/run", () => ({ runSweep: (...args: unknown[]) => runSweep(...args) }));

const { handleCalendarReminderSweep } = await import("./calendar-reminder-sweep");

const boss = { send: vi.fn() } as never;

beforeEach(() => {
  vi.clearAllMocks();
  runSweep.mockResolvedValue(0);
});

describe("handleCalendarReminderSweep", () => {
  it("passes the live boss through — the sweeper is the one handler that enqueues", () => {
    return expect(handleCalendarReminderSweep(boss, {}))
      .resolves.toBeUndefined()
      .then(() => {
        expect(runSweep).toHaveBeenCalledWith(boss);
      });
  });

  it("rejects a stray payload rather than sweeping with it", async () => {
    // The schema is `.strict()` for the same reason `cleanupExpiredVerificationsPayload` is:
    // a scheduled job takes no input, so anything arriving with one is a wiring mistake and
    // should be loud.
    await expect(handleCalendarReminderSweep(boss, { userId: "u1" })).rejects.toThrow();
    expect(runSweep).not.toHaveBeenCalled();
  });

  it("logs only when it actually claimed something", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await handleCalendarReminderSweep(boss, {});
      expect(info).not.toHaveBeenCalled();

      runSweep.mockResolvedValue(3);
      await handleCalendarReminderSweep(boss, {});
      expect(info).toHaveBeenCalledWith(expect.stringContaining("claimed 3"));
    } finally {
      info.mockRestore();
    }
  });

  it("lets a sweep failure throw, so pg-boss retries the tick", async () => {
    runSweep.mockRejectedValue(new Error("connection lost"));
    await expect(handleCalendarReminderSweep(boss, {})).rejects.toThrow("connection lost");
  });
});
