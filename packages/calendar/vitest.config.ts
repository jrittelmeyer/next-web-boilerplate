import { defineConfig } from "vitest/config";

// The calendar domain core is pure (no DB, no React, no Next, no fs), so the node
// environment is enough. Unit tests are co-located as `*.test.ts`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Same posture as @repo/validators, and for the same reason: this package is
    // pure logic whose failure modes are silent (an event renders an hour off, a
    // recurrence skips a day). `all: true` counts every source file, so a new
    // untested module drags the % down honestly instead of hiding behind the
    // tested ones. The bar is the maximum — a new module ships with tests or the
    // gate fails, which is the point.
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json", "lcov"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
