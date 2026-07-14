"use server";

import { auth } from "@repo/auth";
import { db } from "@repo/db";
import {
  account,
  auditLog,
  invitation,
  member,
  organization,
  passkey,
  postRevisions,
  posts,
  session,
  subscriptions,
  twoFactor,
  uploads,
  user,
} from "@repo/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import { headers } from "next/headers";
import { buildDataExport } from "@/lib/data-export";
import { rateLimit } from "@/lib/rate-limit";

type ExportResult = { error: string } | { data: { filename: string; json: string } };

/**
 * GDPR "download my data" (B3 · Band 3 — step 2). Gathers every row the caller owns across
 * the schema and returns a redacted JSON bundle for the client to save. The GDPR ACCESS
 * right, complementing the erasure right already implemented by account deletion (P2-2).
 *
 * A Server Action (not tRPC) — it's a user-initiated mutation-shaped read that returns a
 * downloadable blob, and it re-checks the session authoritatively here. Rate-limited per
 * user (a full-account read is heavier than a normal query and a light scraping vector,
 * though it only ever returns the caller's OWN data). All shaping + redaction lives in the
 * pure, 100%-tested `buildDataExport` (lib/data-export.ts) — this is just the DB shell.
 */
export async function exportMyData(): Promise<ExportResult> {
  const activeSession = await auth.api.getSession({ headers: await headers() });
  if (!activeSession) return { error: "Unauthorized" };
  const userId = activeSession.user.id;

  const limit = await rateLimit(`data-export:${userId}`, { limit: 5, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  const [
    userRow,
    accounts,
    sessions,
    userPosts,
    revisions,
    userUploads,
    subs,
    tf,
    passkeys,
    memberships,
    invitations,
    auditEvents,
  ] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db.query.account.findMany({ where: eq(account.userId, userId) }),
    db.query.session.findMany({ where: eq(session.userId, userId) }),
    db.query.posts.findMany({ where: eq(posts.authorId, userId) }),
    db.query.postRevisions.findMany({ where: eq(postRevisions.authorId, userId) }),
    db.query.uploads.findMany({ where: eq(uploads.userId, userId) }),
    db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId) }),
    db.query.twoFactor.findMany({ where: eq(twoFactor.userId, userId) }),
    db.query.passkey.findMany({ where: eq(passkey.userId, userId) }),
    db.query.member.findMany({ where: eq(member.userId, userId) }),
    db.query.invitation.findMany({ where: eq(invitation.inviterId, userId) }),
    db.query.auditLog.findMany({
      where: or(eq(auditLog.actorId, userId), eq(auditLog.targetId, userId)),
    }),
  ]);

  // A valid session with no user row means the account was deleted mid-request — nothing
  // to export; don't leak an empty-profile bundle.
  if (!userRow) return { error: "Unauthorized" };

  const orgIds = memberships.map((m) => m.organizationId);
  const organizations = orgIds.length
    ? await db.query.organization.findMany({ where: inArray(organization.id, orgIds) })
    : [];

  const json = JSON.stringify(
    buildDataExport(
      {
        user: userRow,
        accounts,
        sessions,
        posts: userPosts,
        postRevisions: revisions,
        uploads: userUploads,
        subscriptions: subs,
        twoFactor: tf,
        passkeys,
        memberships,
        organizations,
        invitations,
        auditEvents,
      },
      new Date(),
    ),
    null,
    2,
  );

  const filename = `my-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  return { data: { filename, json } };
}
