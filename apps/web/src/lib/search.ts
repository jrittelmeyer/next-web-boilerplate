import "server-only";
import { Meilisearch, type Settings } from "meilisearch";

/**
 * The Meilisearch index backing the example `posts` entity (Step 28). A real app
 * has one index per searchable resource — add more constants as you add resources.
 */
export const POSTS_INDEX = "posts";

/**
 * The posts index shape, pinned as code (P2-7). Without this the index is born
 * from the first `addDocuments` with engine defaults — `searchableAttributes`
 * `["*"]` makes `id` searchable (a ULID fragment matches documents) and the shape
 * silently drifts with whatever engine version first touched the volume.
 * `reindexPosts` applies this unconditionally, so a reindex is also the repair
 * path for a stale/default index; the write path applies it once per process via
 * `ensurePostsIndexSettings()` (A8), so even an index first created by `createPost`
 * is born with this shape. Adding a searchable field to a fork = extend
 * `PostDocument`, add the field here, reindex.
 *
 * - `searchableAttributes` — order matters: the `attributeRank` ranking rule
 *   scores title hits above content hits. `id` is deliberately excluded.
 * - `displayedAttributes` — the /search UI keys hits on `id` and renders
 *   title/content, so all three stay in the returned documents.
 * - `rankingRules` — pinned to the defaults of the compose-pinned engine
 *   (v1.48.1, verified against a fresh index) so a future engine-default change
 *   can't silently reorder results. Note these are the modern names — v1.48
 *   split the legacy `attribute` rule into `attributeRank` + `wordPosition`
 *   (the legacy name is still accepted, but fresh indexes get these).
 */
export const POSTS_INDEX_SETTINGS: Settings = {
  searchableAttributes: ["title", "content"],
  displayedAttributes: ["id", "title", "content"],
  rankingRules: [
    "words",
    "typo",
    "proximity",
    "attributeRank",
    "sort",
    "wordPosition",
    "exactness",
  ],
};

/**
 * Shape of a document in the posts index. It's a projection of a `posts` row — the
 * fields worth searching — keyed by the post's `id` (Meilisearch needs a stable
 * primary key to dedupe/update documents). Kept in sync by the post Server Actions
 * (server/actions/post.ts): `createPost` indexes on write, `deletePost` removes the
 * document, and `reindexPosts` bulk-rebuilds the index from the DB.
 */
export interface PostDocument {
  id: string;
  title: string;
  content: string;
}

// Unlike the Resend client (which only warns on a missing key), `new Meilisearch`
// validates its `host` and throws on an empty/invalid one — so we can't construct
// eagerly at import time without breaking the "builds/runs without search creds"
// guarantee. Instead the client is a lazily initialized singleton: importing this
// module is cheap and credential-free; the throw only happens if something
// actually reaches for the client while unconfigured. Callers gate on
// `isSearchConfigured()` first and degrade gracefully (same posture as lib/stripe.ts).
let client: Meilisearch | null = null;

export function getSearchClient(): Meilisearch {
  if (!client) {
    const host = process.env.MEILISEARCH_HOST;
    if (!host) {
      throw new Error("MEILISEARCH_HOST is not set — Meilisearch is not configured.");
    }
    client = new Meilisearch({ host, apiKey: process.env.MEILISEARCH_API_KEY });
  }
  return client;
}

export function isSearchConfigured(): boolean {
  return Boolean(process.env.MEILISEARCH_HOST);
}

// A8 — apply POSTS_INDEX_SETTINGS to the posts index exactly once per process. The
// first index-creating write (createPost into a fresh index) would otherwise leave the
// index on engine defaults until someone reindexes (the old P2-7 gap). Memoizing the
// promise means only the first write pays the updateSettings roundtrip; every later
// write awaits the already-resolved promise (effectively free). reindexPosts keeps its
// OWN unconditional updateSettings — it's the idempotent repair path, not routed here.
let settingsPromise: Promise<void> | null = null;

/**
 * Ensure the posts index has its pinned settings applied (once per process). On failure
 * the memo is CLEARED so a later write retries — a transient Meili outage must not be
 * cached for the life of the process. The returned promise still rejects on that first
 * failure, so the caller MUST be best-effort (indexPost wraps it in a try/catch): applying
 * settings, like indexing itself, must never fail the user's DB write.
 */
export function ensurePostsIndexSettings(): Promise<void> {
  if (settingsPromise) return settingsPromise;
  settingsPromise = getSearchClient()
    .index<PostDocument>(POSTS_INDEX)
    .updateSettings(POSTS_INDEX_SETTINGS)
    .waitTask()
    .then(() => undefined);
  // Don't cache a rejection — reset so the next write re-attempts. (Attaching this
  // handler also keeps the reset side-chain from surfacing as an unhandled rejection;
  // the memoized promise returned above still rejects for the awaiting caller to log.)
  settingsPromise.catch(() => {
    settingsPromise = null;
  });
  return settingsPromise;
}
