"use server";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { uploads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { getUTApi, isUploadthingConfigured } from "@/lib/uploadthing-api";

type DeleteResult = { error: string } | { data: { id: string } };

/**
 * Delete one of the caller's uploads (P2-3 — completes the D9 loop). Mirrors
 * `deletePost`'s gate/limit/ownership shape. Deletion is REMOTE-FIRST and
 * fail-closed when Uploadthing is configured: the file must actually leave storage
 * before the row goes, so a remote failure surfaces as the typed error and the row
 * stays (no silently orphaned files at their still-served `ufs.sh` URL). With the
 * token unset the remote call is skipped and the row alone is deleted — such rows
 * are leftovers from a previously-configured run, and an unconfigured deploy can't
 * remove their files anyway (graceful degradation, same stance as the other
 * env-gated services).
 */
export async function deleteUpload(uploadId: string): Promise<DeleteResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const limit = await rateLimit(`upload:delete:${session.user.id}`, { limit: 10, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  // Row-level authorization: look up the owner before touching anything,
  // exactly like deletePost.
  const row = await db.query.uploads.findFirst({
    where: eq(uploads.id, uploadId),
    columns: { id: true, userId: true, key: true },
  });
  if (!row) return { error: "Upload not found" };
  if (row.userId !== session.user.id) return { error: "Forbidden" };

  if (isUploadthingConfigured()) {
    try {
      const result = await getUTApi().deleteFiles(row.key);
      if (!result.success) {
        return { error: "Could not delete the file from storage. Please try again." };
      }
    } catch (err) {
      log.warn("upload.delete remote failed", {
        id: row.id,
        error: err instanceof Error ? err.message : err,
      });
      return { error: "Could not delete the file from storage. Please try again." };
    }
  }

  await db.delete(uploads).where(eq(uploads.id, row.id));

  revalidatePath("/uploads");
  return { data: { id: row.id } };
}
