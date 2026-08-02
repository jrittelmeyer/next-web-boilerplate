import type { ReminderInput } from "@repo/validators/calendar";
import { describe, expect, it } from "vitest";
import { diffReminders, reminderKey } from "./calendar-reminders";

const row = (id: string, offsetMinutes: number, channel = "email", anchor = "start") => ({
  id,
  channel,
  anchor,
  offsetMinutes,
});

const input = (offsetMinutes: number, channel: "email" | "in-app" = "email"): ReminderInput => ({
  channel,
  anchor: "start",
  offsetMinutes,
});

describe("diffReminders", () => {
  it("leaves an unchanged reminder strictly alone", () => {
    // THE rule. A re-inserted reminder gets a new id, and `calendar_reminder_deliveries`
    // cascades on `reminder_id` — so its ledger would vanish and the next sweep would
    // re-deliver everything still inside the grace window. A title edit would spam the user.
    const diff = diffReminders([row("r1", -15)], [input(-15)]);
    expect(diff).toEqual({ added: [], removed: [], unchanged: ["r1"] });
  });

  it("treats an offset change as remove-then-add, because the moment changed", () => {
    // Deliberately unlike `diffAttendees`, where a role change stays `unchanged` to protect
    // someone's RSVP. Here the row carries only a ledger, and the user asked for a different
    // moment — so it should re-arm.
    const diff = diffReminders([row("r1", -15)], [input(-30)]);
    expect(diff.removed).toEqual(["r1"]);
    expect(diff.added).toEqual([input(-30)]);
    expect(diff.unchanged).toEqual([]);
  });

  it("treats a channel change as remove-then-add", () => {
    const diff = diffReminders([row("r1", -15, "email")], [input(-15, "in-app")]);
    expect(diff.removed).toEqual(["r1"]);
    expect(diff.added).toEqual([input(-15, "in-app")]);
  });

  it("keeps one and adds one when a second reminder joins", () => {
    const diff = diffReminders([row("r1", -15)], [input(-15), input(-1440)]);
    expect(diff.unchanged).toEqual(["r1"]);
    expect(diff.added).toEqual([input(-1440)]);
    expect(diff.removed).toEqual([]);
  });

  it("removes everything when the list is emptied", () => {
    const diff = diffReminders([row("r1", -15), row("r2", -60)], []);
    expect(diff.removed).toEqual(["r1", "r2"]);
    expect(diff.added).toEqual([]);
  });

  it("collapses a duplicate inside one submission rather than hitting the unique", () => {
    // Otherwise `calendar_event_reminders_rule_key` raises a 23505 that surfaces as the
    // generic write error, for a form the user could reach by clicking "add" twice.
    const diff = diffReminders([], [input(-15), input(-15)]);
    expect(diff.added).toHaveLength(1);
  });

  it("does not re-add a duplicate of an existing reminder", () => {
    const diff = diffReminders([row("r1", -15)], [input(-15), input(-15)]);
    expect(diff.added).toEqual([]);
    expect(diff.unchanged).toEqual(["r1"]);
  });

  it("distinguishes every component of the unique key", () => {
    expect(reminderKey(row("x", -15, "email", "start"))).not.toBe(
      reminderKey(row("x", -15, "in-app", "start")),
    );
    expect(reminderKey(row("x", -15, "email", "start"))).not.toBe(
      reminderKey(row("x", -30, "email", "start")),
    );
    expect(reminderKey(row("x", -15, "email", "start"))).not.toBe(
      reminderKey(row("x", -15, "email", "end")),
    );
  });
});
