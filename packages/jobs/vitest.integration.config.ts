import { defineConfig } from "vitest/config";

// DB-backed integration test — hits a REAL Postgres (no mocks), so it runs ONLY
// via `test:integration` (locally with the Docker container up, or the e2e CI
// lane which provisions a postgres:16 service). It proves pg-boss can create its
// schema, enqueue, and process a job against this Postgres. There is deliberately
// no `test` overlap: `pnpm test` / the verify lane stay DB-free. See TESTING.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    setupFiles: ["./__tests__/integration/setup.ts"],
    // One pg-boss instance + a job round-trip; serialize and allow headroom over
    // the 5s default for schema creation + polling.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
