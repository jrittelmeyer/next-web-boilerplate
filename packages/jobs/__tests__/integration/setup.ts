import { resolve } from "node:path";
import { config } from "dotenv";

// Load the monorepo-root .env BEFORE the test connects to Postgres. dotenv never
// overrides an already-set var, so in CI — where DATABASE_URL is exported by the
// e2e job — this is a harmless no-op.
config({ path: resolve(process.cwd(), "../../.env") });
