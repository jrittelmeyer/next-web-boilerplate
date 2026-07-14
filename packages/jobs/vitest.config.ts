import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests (verify lane, DB-free + fast). They cover the pure, deterministic
// units — the job contract (queues.ts) and the handler logic (with @repo/email
// mocked). The I/O bootstrap (boss/enqueue/worker/scripts/load-env) needs a real
// Postgres, so it's exercised by the DB-backed integration test instead
// (vitest.integration.config.ts, run in the e2e CI lane). See TESTING.md.
export default defineConfig({
  resolve: {
    alias: {
      // The real `server-only` throws on import outside a React Server bundler;
      // map it to the empty stub for node-env tests (mirrors apps/web).
      "server-only": fileURLToPath(new URL("./src/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/handlers/**/*.ts", "src/queues.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
