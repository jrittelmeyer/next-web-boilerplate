import { resolve } from "node:path";
import { config } from "dotenv";

// Load the monorepo-root `.env` so DATABASE_URL is present before the test file
// imports `@repo/db` (the pg Pool captures the connection string at construction).
// Runs as a Vitest `setupFile`, i.e. before the test module's imports evaluate.
// dotenv doesn't override existing env, so in CI (DATABASE_URL already exported)
// this is a no-op. Mirrors the loading dance in `src/seed.ts` / `drizzle.config.ts`.
config({ path: resolve(process.cwd(), "../../.env") });
