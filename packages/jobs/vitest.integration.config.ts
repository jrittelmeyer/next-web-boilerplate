import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// DB-backed integration tests — they hit a REAL Postgres (no mocks), so they run
// ONLY via `test:integration` (locally with the Docker container up, or the e2e CI
// lane which provisions a postgres:18 service). They prove pg-boss can create its
// schema, enqueue, process a job, and dead-letter an exhausted one against this
// Postgres. There is deliberately no `test` overlap: `pnpm test` / the verify lane
// stay DB-free. See TESTING.md.
export default defineConfig({
  resolve: {
    alias: {
      // Same neutralization the unit config applies, and needed here from Phase 5: the
      // reminder sweeper reaches @repo/email for `formatEventWhen`, whose module graph
      // includes `send.tsx` and its `import "server-only"`. The real marker THROWS outside a
      // React Server bundler, so without this the suite fails at import with an error that
      // names a Client Component and explains nothing about jobs. The worker itself is
      // unaffected — tsconfig `paths` and build.mjs's alias already map it there.
      "server-only": fileURLToPath(new URL("./src/server-only.ts", import.meta.url)),
    },
  },
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
