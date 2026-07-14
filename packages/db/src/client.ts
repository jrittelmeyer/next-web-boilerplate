import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

// node-postgres Pool does not connect on construction — it connects lazily on
// the first query — so importing this module for types stays cheap and safe.
// DATABASE_URL is validated at the app boundary (apps/web/src/env.ts). Exported
// so short-lived scripts (e.g. db:seed) can `await pool.end()` and exit cleanly;
// the long-running app never closes it.
const poolConfig: PoolConfig = { connectionString: process.env.DATABASE_URL };

// DB_POOL_MAX — optional deploy knob for the pool's max connection count. Unset or
// empty leaves pg's built-in default (max: 10), so the starter runs with zero
// required config; set a positive integer to cap it per your connection budget (see
// DATABASE.md → Connection pooling). Read raw here — @repo/db owns no env schema —
// and, matching the app-boundary env discipline, an explicitly-set-but-invalid value
// fails loud rather than silently reverting to the default. Sizes this app pool only;
// the pg-boss worker keeps its own pool.
const maxRaw = process.env.DB_POOL_MAX;
if (maxRaw !== undefined && maxRaw !== "") {
  const max = Number(maxRaw);
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error(`DB_POOL_MAX must be a positive integer; received ${JSON.stringify(maxRaw)}`);
  }
  poolConfig.max = max;
}

export const pool = new Pool(poolConfig);

export const db = drizzle(pool, { schema });

export type Database = typeof db;
