import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Better Auth `twoFactor()`-plugin schema (Tier 4 · Band 2), hand-maintained to match
 * the plugin's expected model — the SAME ownership convention as the core auth tables
 * (auth.ts) and the org tables (organization.ts): schema lives in `@repo/db` (one
 * migration history), `@better-auth/cli` is NOT used, and correctness is guaranteed by
 * the 2FA flow exercising the table (see DECISIONS.md → auth-schema ownership). Singular
 * table name + camelCase Drizzle keys are Better Auth's required defaults (the documented
 * snake_case-plural exception); SQL column names stay snake_case.
 *
 * The plugin ALSO adds `user.twoFactorEnabled` (a plugin-managed boolean, `input: false`)
 * — that column lives on the `user` table in auth.ts, next to the RBAC `role`, for the
 * same reason: it's not something any client sets directly.
 *
 * `secret` and `backupCodes` are stored `returned: false` by the plugin (never serialized
 * to the client); `verified` (default true, `input: false`) tracks whether the factor was
 * confirmed with a code. `updatedAt` is added per the repo's "every table has created_at/
 * updated_at" convention even though the plugin's model is minimal — the DEFAULT means the
 * plugin's inserts never need to set it.
 */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    // The TOTP shared secret (base32). `returned: false` on the plugin side — never
    // crosses to the client except inside the one-time enroll `totpURI`.
    secret: text("secret").notNull(),
    // Encrypted, newline-joined single-use recovery codes (plugin-managed format).
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Postgres does NOT auto-index FK referencing columns (P1-1). The plugin resolves the
  // row by user_id on every verify/disable/regenerate, and the user-delete cascade scans
  // it — so this one index is load-bearing. (The plugin also declares an index on
  // `secret`, but no query looks the row up by secret, so we omit it.)
  (t) => [index("two_factor_user_id_idx").on(t.userId)],
);

export type TwoFactor = typeof twoFactor.$inferSelect;
export type NewTwoFactor = typeof twoFactor.$inferInsert;
