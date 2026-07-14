import { resolve } from "node:path";
import { config } from "dotenv";

// Load the monorepo-root .env for the standalone worker / scripts, which run
// with cwd = this package (`pnpm --filter @repo/jobs ...`), so the root .env is
// two levels up. dotenv never overrides an already-set var, so in Docker — where
// the process env is provided directly and no .env file exists — this is a
// harmless no-op. Imported first by worker.ts / scripts before they read env.
config({ path: resolve(process.cwd(), "../../.env") });
