"use server";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { db, user } from "@repo/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { avatarKeyFromUrl } from "@/lib/avatar";
import { rateLimit } from "@/lib/rate-limit";
import { getUTApi, isUploadthingConfigured } from "@/lib/uploadthing-api";

type RemoveResult = { error: string } | { data: { removed: boolean } };

/**
 * Clear the caller's avatar — the companion to the `avatarUploader` route (the
 * upload writes `user.image`; this nulls it). Best-effort deletes the file from
 * storage too. Unlike `deleteUpload` (fail-CLOSED — a still-served file must never
 * outlive its row), avatar removal is fail-OPEN: nulling the column is the
 * user-visible effect and must always land, so a remote-delete failure is logged
 * and the file left for a later sweep rather than blocking the user from removing
 * their picture. With the token unset the remote call is skipped (graceful
 * degradation) and the column alone is cleared.
 */
export async function removeUserAvatar(): Promise<RemoveResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const limit = await rateLimit(`avatar:remove:${session.user.id}`, { limit: 10, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  const current = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { image: true },
  });
  // Already clear — idempotent no-op success (nothing to null, no file to remove).
  if (!current?.image) return { data: { removed: false } };

  await db.update(user).set({ image: null }).where(eq(user.id, session.user.id));

  const key = avatarKeyFromUrl(current.image);
  if (key && isUploadthingConfigured()) {
    try {
      await getUTApi().deleteFiles(key);
    } catch (err) {
      log.warn("avatar.remove remote delete failed", {
        userId: session.user.id,
        key,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  // The avatar shows on /account (the card) and in the dashboard header.
  revalidatePath("/account");
  revalidatePath("/dashboard");
  return { data: { removed: true } };
}
