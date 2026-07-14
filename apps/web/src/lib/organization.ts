import "server-only";
import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { member } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Organization (multi-tenancy) server helpers — the org-scoped analogue of
 * lib/rbac.ts (Tier 4 · Band 4). Same authoritative posture: treat the session as
 * proof of *identity* but read *authority* (which org is active, what role the caller
 * holds in it) from a source that can't be stale.
 *
 * The catch these helpers exist to handle: `session.activeOrganizationId` rides the
 * Step-19 session cookie cache (5-min maxAge, see auth.ts), so right after a
 * createOrganization / setActiveOrganization the cookie-cached value lags for up to
 * 5 minutes. Any WRITE or AUTHZ decision that depends on the active org must therefore
 * bypass the cache (`disableCookieCache`) and read the `member` row fresh from Postgres
 * — otherwise a just-created org's first post could land in the wrong workspace, or a
 * just-removed member could still pass an org-admin check. Reads that only affect what
 * a user *sees* (post.list scoping) tolerate the cache and read `ctx.session` directly.
 *
 * The org `member.role` (owner/admin/member) is orthogonal to the platform `user.role`
 * (user/admin) that lib/rbac.ts guards — see DECISIONS.md → Organizations.
 */

/**
 * The caller's active organization id, read authoritatively for a set of request
 * headers (cookie cache bypassed). `null` = no session, or signed in with no active
 * org (the personal workspace). Callers in a Server Action pass `await headers()`;
 * the tRPC `orgProcedure` passes `ctx.headers`.
 */
export async function getActiveOrganizationId(reqHeaders: Headers): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: reqHeaders,
    query: { disableCookieCache: true },
  });
  return session?.session?.activeOrganizationId ?? null;
}

/**
 * The caller's membership role in an organization, read fresh from Postgres (the
 * authoritative source — never the cookie-cached session). `null` when the user is
 * not a member of that org. Better Auth stores `member.role` as a plain string, so
 * the return type is `string`, not the `OrgRole` union (a comma-joined multi-role is
 * a valid value the plugin can write; `isOrgAdminRole` handles that shape).
 */
export async function getOrgRole(organizationId: string, userId: string): Promise<string | null> {
  const row = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    columns: { role: true },
  });
  return row?.role ?? null;
}

/**
 * Whether an org role carries admin authority (owner or admin — never a plain
 * member). Splits on comma so a Better Auth comma-joined multi-role (e.g.
 * "admin,member") is still recognized; `null` (not a member) is never an admin.
 * Used to authorize managing another member's org-scoped content (see
 * server/actions/post.ts — author OR org admin/owner).
 */
export function isOrgAdminRole(role: string | null): boolean {
  if (!role) return false;
  return role.split(",").some((r) => {
    const trimmed = r.trim();
    return trimmed === "owner" || trimmed === "admin";
  });
}
