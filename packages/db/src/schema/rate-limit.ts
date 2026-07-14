import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Better Auth rate-limit storage table (Tier 4 · Band 3 — multi-instance rate limiting),
 * hand-maintained to match Better Auth's built-in `rateLimit` model — the SAME ownership
 * convention as the core auth tables (auth.ts), the org tables (organization.ts), 2FA
 * (two-factor.ts), and passkeys (passkey.ts): schema lives in `@repo/db` (one migration
 * history), `@better-auth/cli` is NOT used, and correctness is guaranteed by the limiter
 * exercising the table (see DECISIONS.md → auth-schema ownership). Singular table name +
 * camelCase Drizzle keys (`key`/`count`/`lastRequest`) are Better Auth's required field names;
 * SQL column names stay snake_case.
 *
 * This table exists ONLY because `rateLimit.storage: "database"` is set in
 * packages/auth/src/auth.ts — that backs Better Auth's limiter with the app Postgres instead
 * of per-instance memory, so the counters survive horizontal scaling / a process restart (see
 * AUTH.md → Rate limiting). Better Auth owns every read/write (an atomic check-and-increment
 * `consume` keyed by `key`; it also prunes expired rows in the background).
 *
 * Field set mirrors Better Auth's model EXACTLY (`@better-auth/core` get-tables): `key`
 * (the `ip:path` bucket, unique — the limiter's create-on-first-hit path relies on the unique
 * constraint to detect a race), `count` (requests in the current window), `lastRequest` (epoch
 * MILLISECONDS, so `bigint` — the plugin declares `bigint: true` and reads it back as a JS
 * number). Deliberately NO `created_at`/`updated_at` (the one documented exception to the
 * repo's timestamp convention): these are ephemeral, auto-pruned counter rows, not domain
 * records, and `last_request` already IS this table's only meaningful time column.
 */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  // The rate-limit bucket key — Better Auth composes it from client IP + request path. Unique
  // so the limiter's "create the row on the first hit" path can detect a concurrent insert and
  // fall back to increment; also the only column it ever looks a row up by (so it's indexed).
  key: text("key").notNull().unique(),
  // Requests seen in the current rolling window; compared against the rule's `max`.
  count: integer("count").notNull(),
  // Timestamp of the last counted request, epoch MILLISECONDS. `bigint` because ms since epoch
  // overflows a 32-bit int; `mode: "number"` returns a JS number (Better Auth reads it as one).
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export type RateLimit = typeof rateLimit.$inferSelect;
export type NewRateLimit = typeof rateLimit.$inferInsert;
