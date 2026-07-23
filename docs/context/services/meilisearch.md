# Meilisearch (Search)

> When to load: working on search — indexing, index settings-as-code, the `/search` surface, reindexing, or the local Meilisearch engine. Shared client/degradation conventions: [../SERVICES.md](../SERVICES.md).

- SDK: `meilisearch` (JS client). The exported client class is **`Meilisearch`**
  (one capital — not the older `MeiliSearch` casing). The API-error class is
  `MeilisearchApiError` (its `cause?.code` carries the Meilisearch error code).
- Self-hosted locally via docker-compose (`getmeili/meilisearch`, port 7700).
- Server client: `apps/web/src/lib/search.ts` (`import "server-only"`). App-only
  and a thin config singleton, so it stays in the app rather than a `@repo/*`
  package — **same posture as `lib/stripe.ts`/`lib/uploadthing.ts`**, and it keeps
  the `meilisearch` dep out of `@repo/db` (which is pure Drizzle/Postgres). Promote
  to a package only if a second app needs it.

**Server client (`lib/search.ts`):** like `new Stripe("")` (and unlike the Resend
client, which only warns), `new Meilisearch({ host })` **validates the host and
throws** on an empty/invalid one — so it can't be constructed at import time
without breaking the "builds without creds" guarantee. It's a **lazy guarded
singleton**:
```typescript
import { getSearchClient, isSearchConfigured, POSTS_INDEX } from "@/lib/search";
// getSearchClient() constructs on first use (throws if MEILISEARCH_HOST is unset);
// callers gate on isSearchConfigured() first and degrade gracefully.
```
The index backs the real `posts` entity: `POSTS_INDEX = "posts"`, and the
`PostDocument` interface (`{ id, title, content }`) is a projection of a `posts` row.

**Read/write split** (per [../API.md](../API.md)):
- **Searching is a READ → tRPC.** `searchRouter.search` (`publicProcedure`, input
  `{ query }`) in `server/trpc/routers/search.ts` returns
  `{ configured: boolean; hits: PostDocument[] }`. It degrades to empty hits —
  never a 500 — when search is unconfigured, and treats a not-yet-created index
  (`index_not_found`) as an expected empty state; any other engine error becomes a
  `TRPCError`.
- **Indexing is a write/side-effect → Server Action.** It lives with the entity's
  writes in `server/actions/post.ts`: `createPost` indexes the new row on write,
  `deletePost` removes its document, and `reindexPosts` bulk-rebuilds the index from
  the DB (auth-gated + rate-limited **3/min per user** — tighter than the 10/min on
  create/update because one call is a full-table scan + bulk index write). Each
  `await`s the enqueued task (`.addDocuments(...).waitTask()`) so an immediate search
  sees the change. Per-post indexing is **best-effort** — a search outage is logged
  but never fails the DB write; `reindexPosts` repairs the index later.

```typescript
// Indexing (server-side only): wait for the async task so results are queryable.
await getSearchClient().index<PostDocument>(POSTS_INDEX).addDocuments(docs).waitTask();
// Searching:
const { hits } = await getSearchClient().index<PostDocument>(POSTS_INDEX).search(query, { limit: 20 });
```

**This IS the "real app" pattern** (it replaced the old hardcoded
`EXAMPLE_DOCUMENTS` scaffold): the index is kept in sync from inside the same Server
Actions that create / delete the rows (see [../DATABASE.md](../DATABASE.md)). Because
`db:seed` is DB-only (`@repo/db` stays Meilisearch-free), seeded rows aren't searchable
until indexed — which is exactly what `reindexPosts` (the `/search` button) is for.

**Index settings as code:** without a pin, an index is born from the first
`addDocuments` with **engine defaults** — `searchableAttributes: ["*"]` makes `id`
searchable (an id fragment matches documents) and the shape drifts with whatever
engine version first touched the volume. `POSTS_INDEX_SETTINGS` (`lib/search.ts`,
typed against the SDK's `Settings`) pins:
- `searchableAttributes: ["title", "content"]` — **order matters**: the
  `attributeRank` ranking rule scores title hits above content hits; `id` is
  deliberately excluded.
- `displayedAttributes: ["id", "title", "content"]` — the `/search` UI keys hits
  on `id`.
- `rankingRules` — pinned to the compose-pinned engine's defaults (v1.48.1:
  `words, typo, proximity, attributeRank, sort, wordPosition, exactness` — v1.48
  split the legacy `attribute` rule into `attributeRank` + `wordPosition`; the
  legacy name is still accepted but fresh indexes get the new ones).

`reindexPosts` applies the settings **unconditionally before** `addDocuments`
(`updateSettings(...).waitTask()`), so the documented repair path also repairs a
default-shaped index. **Settings-on-create:** the write path also ensures the
settings on the **first** index-creating write, via a memoized
`ensurePostsIndexSettings()` (`lib/search.ts`) that `indexPost` awaits before
`addDocuments`. It runs `updateSettings(...).waitTask()` **once per process** and
caches the resolved promise, so only the first `createPost` into a fresh index pays
the roundtrip — every later write is effectively free — and an index born from a
single-doc write now gets the pinned shape instead of engine defaults. It's
**best-effort** (inside `indexPost`'s try/catch, like the `addDocuments` itself): a
settings outage is logged, never fails the DB write, and clears the memo so a later
write retries. `reindexPosts` keeps its own unconditional `updateSettings` — the
idempotent repair path for a drifted/stale index, not routed through the cache.
**Fork guidance:** to make
a new field searchable, extend `PostDocument`, add the field to
`POSTS_INDEX_SETTINGS`, and click Reindex (settings-only changes don't require
re-adding documents — Meilisearch rebuilds the index from stored documents).

**Demo:** a public scaffold route at `/search` (like `/uploads`, `/billing`,
`/state`) — a search box (the tRPC query) plus, **for admins only**, a "Reindex
posts from database" button (`reindexPosts`). Past the 3/min cap the button shows
"Too many requests…"; an unset env shows "not configured". Create posts on `/posts`
to index them on write. Delete when a real search surface lands.

**Who may reindex: admins.** A full-table scan + bulk index write is an operator
repair, not a user
feature, so `reindexPosts` is gated on `requireAdmin()` — the authoritative DB role
check — exactly like `setUserRole` (`server/actions/admin.ts`); a non-admin invoking
the action gets a typed "Forbidden". The `/search` page resolves the same check
server-side and hides the button for non-admins (UX only — the action gate is the
authority). The 3/min per-admin rate limit stays: even an operator repair shouldn't
hammer full DB→Meilisearch rebuilds. After `db:seed` (which seeds no admin),
reindex as an admin — the first admin is promoted out-of-band via manual SQL
(AUTH.md → RBAC) — or simply create a post on `/posts` to index on write.

**Local engine** (`docker/docker-compose.yml`, service `meilisearch` →
`nwb-meilisearch`): runs with `MEILI_ENV=development` (keeps the search-preview UI
at `http://localhost:7700` and is lenient about key length) and a local-dev
`MEILI_MASTER_KEY` (overridable via a root-`.env` `MEILI_MASTER_KEY`; the default
is **not** a real secret). Health: `GET http://localhost:7700/health` → `available`.
In production use `MEILI_ENV=production` with a strong master key.

**Key env vars** (both **optional** — the app builds/runs without search):
- `MEILISEARCH_HOST` — e.g. `http://localhost:7700`. `isSearchConfigured()` gates
  on this.
- `MEILISEARCH_API_KEY` — the instance master key; **must match** the compose
  service's `MEILI_MASTER_KEY` for local dev.

**Remove it** (self-contained; unhook index-on-write):
1. Delete (under `apps/web/src/`) `lib/search.ts`, the `app/[locale]/search/` route,
   `components/search/`, and `server/trpc/routers/search.ts`, then remove `searchRouter`
   from the tRPC root router.
2. Unhook indexing in `server/actions/post.ts`: remove the `indexPost`/de-index calls in
   `createPost`/`updatePost`/`deletePost`, plus the `reindexPosts` action and
   `ensurePostsIndexSettings`.
3. `pnpm --filter web remove meilisearch`.
4. Remove `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` from `.env.example` + `env.ts`.
5. Remove the local engine from `docker/docker-compose.yml` (+ the prod compose): the
   `meilisearch` service, the `meilisearch_data` volume, and the `MEILI_MASTER_KEY`.
6. No CSP entry (search is server-to-server) and no DB table to drop.
