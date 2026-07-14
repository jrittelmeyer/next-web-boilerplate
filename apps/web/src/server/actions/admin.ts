"use server";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { db, recordAuditEvent } from "@repo/db";
import { session, user } from "@repo/db/schema";
import {
  type BanUserInput,
  banUserSchema,
  type ImpersonateUserInput,
  impersonateUserSchema,
  type SetUserRoleInput,
  setUserRoleSchema,
  type UnbanUserInput,
  unbanUserSchema,
} from "@repo/validators";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/rbac";

type ActionResult = { error: string } | { data: { userId: string; role: string } };
type BanActionResult = { error: string } | { data: { userId: string } };

/**
 * Role-aware Server Action (Step 21): an admin sets another user's role.
 *
 * Gated by `requireAdmin()` — the authoritative DB role check (see lib/rbac.ts),
 * the same one `adminProcedure` uses — so a logged-out or non-admin caller gets
 * a typed `{ error }` (a Server Action can't set a 403 status). Input is
 * validated with the shared `setUserRoleSchema`.
 *
 * This is also how *additional* admins are promoted once a first admin exists.
 * The FIRST admin is always created out-of-band (manual SQL / a db:seed in
 * Step 28) — roles are never self-service. See AUTH.md (RBAC).
 *
 * Anti-lockout (D2): an admin can't change their OWN role. A demotion is therefore
 * always performed by a *different* admin, so the last admin can't accidentally
 * strip the app of every admin and lock everyone out of /admin.
 */
export async function setUserRole(input: SetUserRoleInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Forbidden" };

  const parsed = setUserRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (parsed.data.userId === admin.session.user.id) {
    return { error: "You cannot change your own role" };
  }

  // Read the current role first: the audit log below reports old→new, and a
  // missing row means the target doesn't exist — surface that instead of
  // "succeeding" on a zero-row update.
  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, parsed.data.userId))
    .limit(1);
  if (!target) return { error: "User not found" };

  await db.update(user).set({ role: parsed.data.role }).where(eq(user.id, parsed.data.userId));

  // Two-layer audit trail for the privileged mutation:
  //  - a structured log LINE (P1-7) → BetterStack when configured, console otherwise,
  //    for real-time alerting. IDs only — no email PII in the external sink.
  //  - a persisted `audit_log` ROW (B2) → the queryable trail ("every role change for
  //    user X"). recordAuditEvent is best-effort, so it never fails the role change.
  log.info("admin.setUserRole", {
    actorId: admin.session.user.id,
    targetId: parsed.data.userId,
    oldRole: target.role,
    newRole: parsed.data.role,
  });
  await recordAuditEvent({
    action: "user.role_changed",
    actorId: admin.session.user.id,
    targetId: parsed.data.userId,
    metadata: { oldRole: target.role, newRole: parsed.data.role },
  });

  revalidatePath("/admin");
  return { data: parsed.data };
}

/**
 * Ban a user (Admin plugin, Tier 4 · Band 4). Gated by the SAME fresh-DB `requireAdmin()`
 * as `setUserRole` — the repo's authoritative boundary — then performs the privileged write
 * DIRECTLY against Postgres rather than through `auth.api.banUser`. Why not the plugin
 * endpoint: it re-authorizes off the caller's cookie-cached SESSION role (≤5 min stale via
 * the Step-19 cache), which would wrongly FORBID a just-promoted admin whose session still
 * says `role: "user"`. `requireAdmin()` above already read the role fresh, so we own the
 * write and keep the strict, fresh gate (exactly the setUserRole posture).
 *
 * The write sets the ban columns the admin() plugin's `session.create.before` hook reads
 * FRESH on every sign-in — so the target is blocked from signing back in with
 * `bannedUserMessage`, and an elapsed `banExpires` auto-lifts there — and revokes the
 * target's EXISTING sessions (what a live ban must also do). See DECISIONS.md → Admin plugin.
 *
 * Anti-lockout: an admin can't ban themselves (a self-ban would revoke their own sessions
 * and lock them out). Audited like a role change (persisted `audit_log` row, best-effort).
 */
export async function banUser(input: BanUserInput): Promise<BanActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Forbidden" };

  const parsed = banUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (parsed.data.userId === admin.session.user.id) {
    return { error: "You cannot ban yourself" };
  }

  const banExpires = parsed.data.banExpiresIn
    ? new Date(Date.now() + parsed.data.banExpiresIn * 1000)
    : null;

  await db
    .update(user)
    .set({ banned: true, banReason: parsed.data.banReason ?? null, banExpires })
    .where(eq(user.id, parsed.data.userId));
  // Revoke the target's live sessions — a ban must sign them out now, not only block
  // future sign-ins. The FK-indexed session.user_id makes this a targeted delete.
  await db.delete(session).where(eq(session.userId, parsed.data.userId));

  log.info("admin.banUser", { actorId: admin.session.user.id, targetId: parsed.data.userId });
  await recordAuditEvent({
    action: "user.banned",
    actorId: admin.session.user.id,
    targetId: parsed.data.userId,
    metadata: parsed.data.banReason ? { reason: parsed.data.banReason } : undefined,
  });

  revalidatePath("/admin");
  return { data: { userId: parsed.data.userId } };
}

/**
 * Lift a ban (Admin plugin, Tier 4 · Band 4). Same fresh-DB `requireAdmin()` gate + direct
 * write as `banUser`: clears banned/banReason/banExpires, after which the plugin's sign-in
 * hook lets the user back in. No self-check is needed — a banned admin can't sign in to
 * reach this. Audited.
 */
export async function unbanUser(input: UnbanUserInput): Promise<BanActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Forbidden" };

  const parsed = unbanUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, parsed.data.userId));

  log.info("admin.unbanUser", { actorId: admin.session.user.id, targetId: parsed.data.userId });
  await recordAuditEvent({
    action: "user.unbanned",
    actorId: admin.session.user.id,
    targetId: parsed.data.userId,
  });

  revalidatePath("/admin");
  return { data: { userId: parsed.data.userId } };
}

/**
 * Impersonate a user (Admin plugin, Tier 4 · Band 4). UNLIKE ban/unban, impersonation is a
 * SESSION-COOKIE SWAP only the plugin can perform, so this goes through `auth.api` rather than
 * a direct DB write. It is still fronted by the same fresh-DB `requireAdmin()` gate + audit as
 * the other admin mutations.
 *
 * KNOWN TRADE-OFF (the documented ≤5-min impersonation window): the plugin's endpoint
 * re-authorizes off the caller's cookie-cached SESSION role (Step-19 cache), and refuses to
 * impersonate another admin (`allowImpersonatingAdmins` stays false). So it can throw FORBIDDEN
 * even though the fresh `requireAdmin()` above passed — most notably for a JUST-PROMOTED admin
 * whose session still says `role:"user"` (they must sign out and back in first). We surface that
 * as a typed error rather than a 500. The fresh gate still earns its place: it blocks a
 * just-DEMOTED admin whom the plugin alone would keep trusting for up to 5 minutes.
 *
 * On success the endpoint writes the swapped Set-Cookie (delete the admin's session cookie,
 * stash it in a signed `admin_session` cookie, set the target's) — `nextCookies()` flushes it
 * from this Server Action. The caller then does a FULL navigation so the new session loads.
 * See DECISIONS.md → Admin plugin / SECURITY.md.
 */
export async function impersonateUser(input: ImpersonateUserInput): Promise<BanActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Forbidden" };

  const parsed = impersonateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (parsed.data.userId === admin.session.user.id) {
    return { error: "You cannot impersonate yourself" };
  }

  try {
    await auth.api.impersonateUser({
      body: { userId: parsed.data.userId },
      headers: await headers(),
    });
  } catch {
    // FORBIDDEN (stale-promoted admin / admin target) or NOT_FOUND — never leak internals.
    return {
      error: "Could not impersonate. If you were just made an admin, sign out and back in first.",
    };
  }

  log.info("admin.impersonateUser", {
    actorId: admin.session.user.id,
    targetId: parsed.data.userId,
  });
  await recordAuditEvent({
    action: "user.impersonated",
    actorId: admin.session.user.id,
    targetId: parsed.data.userId,
  });

  return { data: { userId: parsed.data.userId } };
}

/**
 * Stop impersonating (Admin plugin, Tier 4 · Band 4). Restores the admin's original session
 * from the signed `admin_session` cookie the impersonate swap stashed. Deliberately does NOT
 * gate on `requireAdmin()`: during impersonation the caller's session IS the target user (not
 * an admin), so a fresh admin gate would wrongly fail. The precondition instead is that an
 * impersonation session is active — `session.impersonatedBy` is set, which is also the plugin
 * endpoint's own guard. `impersonatedBy` (the admin) and the current user (the target) name
 * both parties for the audit row before the swap-back. `nextCookies()` flushes the restored
 * cookie; the caller full-navigates afterward.
 */
export async function stopImpersonating(): Promise<BanActionResult> {
  const requestHeaders = await headers();
  const currentSession = await auth.api.getSession({ headers: requestHeaders });
  const impersonatedBy = currentSession?.session.impersonatedBy;
  if (!currentSession || !impersonatedBy) {
    return { error: "Not impersonating anyone." };
  }

  const targetId = currentSession.user.id;
  try {
    await auth.api.stopImpersonating({ headers: requestHeaders });
  } catch {
    return { error: "Unable to stop impersonating." };
  }

  log.info("admin.stopImpersonating", { actorId: impersonatedBy, targetId });
  await recordAuditEvent({
    action: "user.impersonation_stopped",
    actorId: impersonatedBy,
    targetId,
  });

  return { data: { userId: targetId } };
}
