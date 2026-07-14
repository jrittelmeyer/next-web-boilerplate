import { describe, expect, it, vi } from "vitest";

// Only the cursor schema is under test — a pure Zod object — but importing it
// executes the whole router module, whose `../trpc` import pulls the real app
// context at module load (@repo/auth, @repo/db, Sentry, @logtail/next,
// next/server). Stub the procedure builders instead of mocking that entire
// dependency fan-out: the chain only needs to survive `.input(...).query(...)`.
vi.mock("../trpc", () => {
  const procedure = { input: () => ({ query: () => ({}) }) };
  return {
    createTRPCRouter: (routes: Record<string, unknown>) => routes,
    rateLimitedProcedure: procedure,
    userRateLimitedProcedure: procedure,
  };
});

import { cursorSchema } from "./post";

// Pins the B2 uuid-cursor hardening: posts.id is a uuid column, so a non-uuid
// cursor id must fail HERE (the Zod input boundary → tRPC BAD_REQUEST/400) and
// never reach Postgres, where `id < $1` would throw `invalid input syntax for
// type uuid` — a 500 whose error body leaks the query text (live-reproduced
// before the fix). Same guard as notification.list's cursor (A25); both list
// and listMine share this one schema object.
describe("post cursor schema (uuid hardening)", () => {
  it("accepts a server-originated (createdAt, uuid) cursor", () => {
    const parsed = cursorSchema.safeParse({
      createdAt: new Date("2026-07-12T00:00:00.000Z"),
      id: "5f0c9d0a-3b1e-4a5d-9c6f-2e8b7a1d4c3e",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid id at the Zod boundary instead of reaching Postgres", () => {
    const parsed = cursorSchema.safeParse({
      createdAt: new Date("2026-07-12T00:00:00.000Z"),
      id: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join("."))).toContain("id");
    }
  });
});
