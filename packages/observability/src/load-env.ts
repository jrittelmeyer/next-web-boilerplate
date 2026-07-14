import { resolve } from "node:path";
import { config } from "dotenv";

// Load the monorepo-root .env for `sync` (which reads BETTER_STACK_API_TOKEN +
// SITE_URL/BETTER_AUTH_URL). Scripts run with cwd = this package
// (`pnpm --filter @repo/observability ...`), so the root .env is two levels up.
// dotenv never overrides an already-set var, so in CI/Docker — where env is
// provided directly and no .env exists — this is a harmless no-op. Imported
// first by sync.ts, before config.ts reads env.
config({ path: resolve(process.cwd(), "../../.env") });
