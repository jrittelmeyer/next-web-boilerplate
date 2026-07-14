import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Organization (multi-tenancy) roles — the Better Auth `organization()` plugin's
 * access-control defaults. Distinct from the PLATFORM role on `user.role`
 * (user/admin, see auth.ts): that one gates the operator `/admin` console; THESE are
 * per-membership roles scoped to a single organization (owner/admin/member), carried
 * on `member.role`. The two layers are orthogonal and never collide — a platform
 * admin and an org admin are different authorities.
 *
 * Exported so validators/UI can keep their literal lists in sync (`packages/db` stays
 * import-pure, so the union is duplicated there with a sync comment, exactly like
 * ROLES in auth.ts). Better Auth stores the role as a plain string (it also supports
 * comma-joined multi-roles and, opt-in, dynamic roles), so the column is untyped text
 * rather than a `$type<OrgRole>()` union.
 */
export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * Better Auth organization()-plugin schema, hand-maintained to match the plugin's
 * expected model — the SAME ownership convention as the core auth tables in auth.ts:
 * schema lives in `@repo/db` (one migration history), `@better-auth/cli` is NOT used
 * (it lags core), and correctness is guaranteed by the org flow exercising every table
 * (see DECISIONS.md → auth-schema ownership). Singular table names + camelCase Drizzle
 * keys are Better Auth's required defaults (the documented snake_case-plural exception);
 * SQL column names stay snake_case.
 *
 * `updatedAt` is added to each table (the repo's "every table has created_at/updated_at"
 * convention) even though the plugin's model is created_at-only — the DEFAULT means
 * Better Auth's inserts never need to set it.
 *
 * Teams (team / team_member + session.active_team_id) and dynamic runtime roles
 * (organization_role) are the plugin's optional features — intentionally OFF for v1
 * (documented one-flag upgrades in AUTH.md), so their tables are not defined here.
 */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  // Better Auth serializes organization metadata to a JSON string.
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One membership per (org, user): the correct data invariant AND the index the
    // authz hot path uses — findMemberByOrgId filters (organization_id, user_id), and
    // listMembers filters organization_id (served by the leading column). Postgres
    // doesn't auto-index FK columns (P1-1), so this also covers the org-delete cascade.
    uniqueIndex("member_org_id_user_id_idx").on(t.organizationId, t.userId),
    // listOrganizations resolves a user's memberships by user_id (not org_id-first), so
    // it needs an index leading with user_id; this also covers the user-delete cascade.
    index("member_user_id_idx").on(t.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // Nullable to match the plugin (required: false); in practice always set on invite.
    role: text("role"),
    status: text("status").notNull().default("pending"),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // FK columns aren't auto-indexed (P1-1): organization_id (listInvitations + the
    // org-delete cascade) and inviter_id (the user-delete cascade). email is the
    // list-by-address / accept lookup (listUserInvitations).
    index("invitation_organization_id_idx").on(t.organizationId),
    index("invitation_email_idx").on(t.email),
    index("invitation_inviter_id_idx").on(t.inviterId),
  ],
);

export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;
