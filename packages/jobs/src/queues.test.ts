import { describe, expect, it } from "vitest";
import { ALL_QUEUES, DEAD_LETTER_QUEUE, JOBS, welcomeEmailPayload } from "./queues";

describe("job contract", () => {
  it("lists the welcome-email queue in ALL_QUEUES", () => {
    expect(ALL_QUEUES).toContain(JOBS.welcomeEmail);
  });

  it("keeps the DLQ out of ALL_QUEUES (it must not dead-letter into itself)", () => {
    expect(ALL_QUEUES).not.toContain(DEAD_LETTER_QUEUE);
  });

  it("accepts a valid welcome-email payload", () => {
    expect(welcomeEmailPayload.parse({ to: "a@b.com", name: "X" })).toEqual({
      to: "a@b.com",
      name: "X",
    });
  });

  it("allows an optional name", () => {
    expect(welcomeEmailPayload.parse({ to: "a@b.com" })).toEqual({ to: "a@b.com" });
  });

  it("rejects a non-email `to`", () => {
    expect(welcomeEmailPayload.safeParse({ to: "nope" }).success).toBe(false);
  });
});
