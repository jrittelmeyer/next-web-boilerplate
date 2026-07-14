import "server-only";
import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { type Role, user } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

/**
 * RBAC helpers (Step 21). The authoritative role check.
 *
 * Why a DB read instead of trusting `session.user.role`: the Step-19 session
 * `cookieCache` (5-min) means a role carried on the session can be stale for up
 * to that long. So we treat the (cookie-cached) session as proof of *identity*
 * and read the role *fresh from Postgres* for *authority*. A demotion therefore
 * takes effect on the next request, not up to 5 minutes later. This is also why
 * `role` is NOT in Better Auth's `additionalFields`: nothing in the auth API can
 * read or write it, so the only role writers are direct DB access (manual SQL /
 * db:seed) and the admin-gated `setUserRole` action.
 *
 * Roles are an exact match here (`user` | `admin`). For a multi-level hierarchy,
 * replace the `=== role` comparison with a rank lookup.
 */

/** Authoritative role straight from the DB. `null` if the user no longer exists. */
export async function getUserRole(userId: string): Promise<Role | null> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { role: true },
  });
  return row?.role ?? null;
}

/**
 * For Server Components / Server Actions. Resolves the session (cookie cache is
 * fine for identity), then authoritatively reads the role. Returns `null` when
 * there is no session, the user is gone, or the role isn't `admin` — callers
 * decide how to fail (a page `notFound()`, an action `{ error }`).
 */
export async function requireAdmin(): Promise<{
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  role: Role;
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const role = await getUserRole(session.user.id);
  if (role !== "admin") return null;

  return { session, role };
}
