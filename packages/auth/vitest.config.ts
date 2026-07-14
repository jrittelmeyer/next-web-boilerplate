import { defineConfig } from "vitest/config";

// Unit tests (verify lane, DB-free + fast). They cover the pure, env-driven config
// helpers (config.ts) — provider registration, trusted-origins parsing, and the
// email-change token decode that drives the M7 behaviors. auth.ts itself only
// composes them into betterAuth() alongside DB/email/jobs wiring, so it's exercised
// by the E2E auth flows instead (every signup runs it). See TESTING.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/config.ts"],
      reporter: ["text", "json", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
