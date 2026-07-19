import { defineConfig } from "vitest/config";

// DB-backed integration tests — they hit a REAL Postgres (no mocks), so they run
// ONLY via `test:integration` (locally with the Docker container up, or the e2e CI
// lane which provisions a postgres:18 service). They prove pg-boss can create its
// schema, enqueue, process a job, and dead-letter an exhausted one against this
// Postgres. There is deliberately no `test` overlap: `pnpm test` / the verify lane
// stay DB-free. See TESTING.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    setupFiles: ["./__tests__/integration/setup.ts"],
    // Each file runs one pg-boss instance in its own schema; serialize and allow
    // headroom over the 5s default for schema creation + polling.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
