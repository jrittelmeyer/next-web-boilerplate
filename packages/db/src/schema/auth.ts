import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * RBAC roles (Step 21). The canonical source of truth for the role set lives
 * here — `packages/db` stays import-pure (no other `@repo/*`), so anything that
 * needs the role union (the app, validators' input schema) keeps its list in
 * sync with this one. Adding a role is a one-line edit here (plus a migration is
 * NOT needed — the column is plain `text`, so no `ALTER TYPE`).
 */
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Better Auth core schema (hand-maintained to match Better Auth's expected
 * model — verified end-to-end by the auth flow hitting these tables).
 *
 * Three naming layers intentionally diverge here:
 *  - Table names are singular (`user`, `session`, ...) — Better Auth's default,
 *    a deliberate exception to this repo's snake_case-plural table convention.
 *  - Drizzle property keys are camelCase (`emailVerified`, `userId`) — required;
 *    Better Auth addresses columns by these keys, never by SQL name.
 *  - SQL column names are snake_case — the repo convention, invisible to Better
 *    Auth because Drizzle maps key -> column for it.
 */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // RBAC (Step 21; extended by the admin() plugin, Tier 4 · Band 4). Plain `text` (not a
    // pg enum) typed to `Role`, defaulting to "user" NOT NULL so Better Auth's adapter
    // inserts new users without ever setting it. Roles are NEVER self-service. Writers:
    // direct DB access (manual SQL / db:seed), the admin-gated setUserRole action (the
    // fresh-DB-gated + audited path the /admin UI uses), and — since the admin() plugin —
    // its own admin-gated /admin/set-role endpoint. Still no `additionalFields` entry: the
    // plugin declares `role` as a managed field (input: false) itself, and AUTHORIZATION
    // reads it FRESH from the DB (lib/rbac.ts), never from the cookie-cached session. See
    // AUTH.md → Admin plugin for why the fresh-DB gate is kept over the plugin's session read.
    role: text("role").$type<Role>().notNull().default("user"),
    // Two-factor auth (Tier 4 · Band 2). Plugin-managed boolean flipped by the Better
    // Auth twoFactor() plugin when a user enrolls/disables TOTP — `input: false` on the
    // plugin side, so no client sets it directly (same posture as `role`). The per-user
    // secret + backup codes live in the `two_factor` table (schema/two-factor.ts).
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    // Admin plugin (Tier 4 · Band 4). Ban state. `input: false` on the plugin side, so no
    // client sets it directly (same posture as `role`/`twoFactorEnabled`). Written by the
    // fresh-gated banUser/unbanUser Server Actions (apps/web; a direct write, not the
    // plugin's session-role-gated endpoint — see AUTH.md → Admin plugin); the plugin's
    // `session.create` hook READS `banned` fresh on every sign-in to block a banned user
    // (bannedUserMessage) and auto-lift once `banExpires` passes (NULL = permanent).
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Keyset pagination needs an index matching its ORDER BY exactly (P3-5): /admin and
  // admin.listUsers order by (created_at DESC, id DESC). Same form and rationale as
  // posts_created_at_id_idx (see posts.ts) — `.nullsFirst()` is load-bearing there too:
  // bare `.desc()` emits DESC NULLS LAST, but plain `ORDER BY … DESC` means NULLS FIRST
  // in Postgres, and the planner treats that as a different sort order.
  (t) => [
    index("user_created_at_id_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // (Organizations) The user's currently-active organization, managed by the Better
    // Auth organization() plugin (createOrganization/setActiveOrganization write it).
    // NULL = personal workspace (no active org), so the app runs exactly as before with
    // zero orgs. The plugin marks the field `input: false` — no client can set it
    // directly; only the plugin's endpoints do. See schema/organization.ts + AUTH.md.
    activeOrganizationId: text("active_organization_id"),
    // Admin plugin (Tier 4 · Band 4). Set on an impersonation session by Better Auth's
    // admin() plugin (/admin/impersonate-user) to the impersonating admin's user id; NULL
    // on a normal session. `input: false` — only the plugin's endpoints write it. The
    // impersonation session is time-boxed (impersonationSessionDuration, 1h default) and
    // ended by /admin/stop-impersonating. See AUTH.md → Admin plugin.
    impersonatedBy: text("impersonated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Postgres doesn't auto-index FK referencing columns — the user-delete cascade
  // and per-user session lookups (list/revoke) scan without this.
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Same FK-index rationale as session.user_id — Better Auth resolves a user's
  // credential/OAuth accounts by user_id on every sign-in.
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
