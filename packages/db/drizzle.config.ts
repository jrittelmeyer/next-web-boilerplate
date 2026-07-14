import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the monorepo-root .env. db commands run via `pnpm --filter @repo/db ...`,
// so cwd is this package; the repo root is two levels up.
config({ path: resolve(process.cwd(), "../../.env") });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
