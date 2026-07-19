import { defineConfig } from "vitest/config";

// DB-backed integration tests (Step 29). These hit a REAL Postgres — no mocks —
// so they live in `__tests__/integration/` and run ONLY via the `test:integration`
// script (locally with the Docker container up, or the push-to-main E2E CI lane
// which provisions a `postgres:18` service). There is deliberately no `test`
// script here, so the default `pnpm test` / `verify` CI lane stays DB-free and
// fast — see TESTING.md.
//
// `setupFiles` loads the monorepo-root `.env` BEFORE the test imports `@repo/db`
// (the pg Pool reads DATABASE_URL when the client module is first imported). dotenv
// never overrides an already-set var, so in CI — where DATABASE_URL is exported by
// the job — this is a harmless no-op.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    setupFiles: ["./__tests__/integration/setup.ts"],
    // One Postgres connection pool is shared across files; run serially so tests
    // that clean the same tables can't interleave.
    fileParallelism: false,
  },
});
