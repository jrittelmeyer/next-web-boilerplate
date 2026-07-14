import "server-only";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { db, uploads, user } from "@repo/db";
import { eq } from "drizzle-orm";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { avatarKeyFromUrl } from "@/lib/avatar";
import { rateLimit } from "@/lib/rate-limit";
import { getUTApi, isUploadthingConfigured } from "@/lib/uploadthing-api";

const f = createUploadthing();

/**
 * Example file router. Defines the allowed file types/sizes, gates uploads behind
 * an authenticated Better Auth session (AUTH.md), and persists each finished
 * upload into the `uploads` table (Phase 3 · D9) — the worked example for
 * Uploadthing → DB persistence (the upload analog of the C4 Stripe webhook). See
 * DATABASE.md + SERVICES.md. Swap the route name and constraints for a real feature.
 */
export const ourFileRouter = {
  imageUploader: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) throw new UploadThingError("Unauthorized");
      // Per-user cap (P2-3), same limiter as the write Server Actions. Uploads cost
      // storage + a DB row each; the thrown message surfaces in `onUploadError`.
      const limit = await rateLimit(`upload:request:${session.user.id}`, {
        limit: 10,
        windowSec: 60,
      });
      if (!limit.success) {
        throw new UploadThingError("Too many uploads. Please wait a moment and try again.");
      }
      // Whatever is returned here is available as `metadata` in onUploadComplete.
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Runs server-side once the upload finishes. Persist the file against its
      // owner, keyed by Uploadthing's stable storage `key` so a redelivered
      // callback upserts the same row instead of duplicating it (idempotent, the
      // same posture as the C4 Stripe webhook). Errors propagate so a non-2xx
      // makes Uploadthing retry — at-least-once delivery, no-op on retry.
      await db
        .insert(uploads)
        .values({
          userId: metadata.userId,
          key: file.key,
          name: file.name,
          url: file.ufsUrl,
          size: file.size,
          type: file.type,
        })
        .onConflictDoUpdate({
          target: uploads.key,
          set: { url: file.ufsUrl, name: file.name, size: file.size, type: file.type },
        });
      // The returned value is sent to the client's `onClientUploadComplete`.
      return { uploadedBy: metadata.userId };
    }),

  /**
   * Avatar route (Band-1 Tier-4). Same auth+rate-limit gate as `imageUploader`,
   * but tighter (2MB) and persisted to the user's own `user.image` instead of the
   * `uploads` table — an avatar is profile state you replace, not a file you manage
   * in the `/uploads` list. `onUploadComplete` runs server-side, so the stored URL
   * is Uploadthing's, never a client-supplied one.
   */
  avatarUploader: f({
    image: { maxFileSize: "2MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) throw new UploadThingError("Unauthorized");
      const limit = await rateLimit(`avatar:request:${session.user.id}`, {
        limit: 10,
        windowSec: 60,
      });
      if (!limit.success) {
        throw new UploadThingError("Too many uploads. Please wait a moment and try again.");
      }
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Read the previous avatar first, then point `user.image` at the new file.
      // (UPDATE ... RETURNING gives the NEW value, so the prior URL must be read
      // up front to clean the old file out of storage after the swap.)
      const before = await db.query.user.findFirst({
        where: eq(user.id, metadata.userId),
        columns: { image: true },
      });
      await db.update(user).set({ image: file.ufsUrl }).where(eq(user.id, metadata.userId));

      // Best-effort cleanup of the replaced file so changing an avatar doesn't
      // orphan storage forever. Unlike the fail-closed `deleteUpload`, this is
      // fail-OPEN: the new avatar is already stored and `user.image` already
      // updated, so a cleanup failure must not surface as an upload error — it's
      // logged and left for a later sweep. Skipped when the token is unset (an
      // unconfigured deploy can't reach storage anyway).
      const prevKey = avatarKeyFromUrl(before?.image);
      if (prevKey && prevKey !== file.key && isUploadthingConfigured()) {
        try {
          await getUTApi().deleteFiles(prevKey);
        } catch (err) {
          log.warn("avatar.cleanup remote delete failed", {
            userId: metadata.userId,
            key: prevKey,
            error: err instanceof Error ? err.message : err,
          });
        }
      }

      // Sent to the client's `onClientUploadComplete` (the browser already has
      // `res[0].ufsUrl` from the upload itself for its optimistic preview).
      return { image: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
