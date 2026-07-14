import { UTApi } from "uploadthing/server";
import { deleteUploadsPayload } from "../queues";

/**
 * Process one `delete-uploads` job (P2-3): remove a deleted account's files from
 * Uploadthing storage. Enqueued by `@repo/auth`'s `user.deleteUser` hooks — the
 * DB rows cascade with the user, but the remote files don't (the caveat in
 * SERVICES.md → Uploadthing), so this finishes the cleanup out-of-band.
 *
 * Return = job complete. Throw = pg-boss retries (at-least-once delivery —
 * `deleteFiles` is idempotent, so a retry after a partial failure is safe). Like
 * the welcome-email handler, an UNCONFIGURED deployment completes instead of
 * retrying: with no token the files can't be deleted from here at all (and in
 * practice never existed unless a previously-configured run wrote them), so
 * there's nothing a retry could fix — we log the orphaned keys and move on.
 */
export async function handleDeleteUploads(data: unknown): Promise<void> {
  const { userId, keys } = deleteUploadsPayload.parse(data);

  if (!process.env.UPLOADTHING_TOKEN) {
    console.info(
      `[jobs] delete-uploads for ${userId} skipped — Uploadthing not configured (${keys.length} file(s) left in storage)`,
    );
    return;
  }

  const result = await new UTApi().deleteFiles(keys);
  if (!result.success) {
    throw new Error(`delete-uploads failed for ${userId}: Uploadthing reported failure`);
  }
  console.info(
    `[jobs] delete-uploads for ${userId}: removed ${result.deletedCount}/${keys.length} file(s)`,
  );
}
