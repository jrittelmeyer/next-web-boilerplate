// Test stub for `@/env`. The real module (src/env.ts) runs `createEnv()`, which
// validates process.env at import and throws without DATABASE_URL /
// BETTER_AUTH_SECRET — the reason `apps/web` had no Vitest project. Vitest aliases
// `@/env` to this plain object (see vitest.config.ts) so any app module can be
// unit-tested without real secrets.
//
// The C2 server-module tests don't read `env` directly (they mock `@repo/db` /
// `@repo/auth`), so the values below are placeholders; extend this object as new
// app-module tests need specific vars.
export const env = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-32",
  BETTER_AUTH_URL: "http://localhost:3000",
} as Record<string, string | undefined>;
