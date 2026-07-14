/**
 * Extract Uploadthing's storage `key` from a served file URL (`file.ufsUrl`),
 * e.g. `https://<appId>.ufs.sh/f/<key>` → `<key>`. We persist the URL in
 * `user.image`, but replacing or removing an avatar has to delete the PREVIOUS
 * file from storage, and `UTApi.deleteFiles` is keyed by `key` — so we recover
 * it from the stored URL. Returns null when the URL doesn't look like an
 * Uploadthing file URL (both the modern `<appId>.ufs.sh` and legacy `utfs.io`
 * hosts serve at `/f/<key>`; keys contain no slashes), so callers skip the
 * remote delete rather than guess a key.
 */
export function avatarKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return pathname.match(/^\/f\/([^/]+)$/)?.[1] ?? null;
}
