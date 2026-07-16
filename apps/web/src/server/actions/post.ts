"use server";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { postRevisions, posts } from "@repo/db/schema";
import {
  type ActionResult,
  createPostSchema,
  updatePostSchema,
  zodFieldErrors,
} from "@repo/validators";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { getActiveOrganizationId, getOrgRole, isOrgAdminRole } from "@/lib/organization";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/rbac";
import {
  ensurePostsIndexSettings,
  getSearchClient,
  isSearchConfigured,
  POSTS_INDEX,
  POSTS_INDEX_SETTINGS,
  type PostDocument,
} from "@/lib/search";

// The shared `ActionResult<T>` (A7) — its error arm carries an optional per-field
// `fieldErrors` map, which `createPost` populates so the form maps each failing field
// inline (see @repo/validators + API.md → Server Actions).
type CreateResult = ActionResult<{ id: string; title: string }>;
type UpdateResult = ActionResult<{ id: string; title: string }>;
type DeleteResult = ActionResult<{ id: string }>;
type ReindexResult = ActionResult<{ indexed: number }>;

/**
 * Index a single post into Meilisearch (best-effort). The DB row is the source of
 * truth, so a search outage must NOT fail the mutation — we log and move on; the
 * `reindexPosts` action can repair the index later. Awaits the enqueued task so an
 * immediate search sees the change. No-op (and no throw) when search is unconfigured.
 *
 * Applies the pinned index settings once per process BEFORE the first document write
 * (A8, `ensurePostsIndexSettings`), so an index first created here — not by
 * `reindexPosts` — is born with the right shape instead of engine defaults. Both the
 * ensure and the addDocuments share this try/catch, so either failing is logged and
 * the caller's DB write still succeeds.
 */
async function indexPost(doc: PostDocument): Promise<void> {
  if (!isSearchConfigured()) return;
  try {
    await ensurePostsIndexSettings();
    await getSearchClient().index<PostDocument>(POSTS_INDEX).addDocuments([doc]).waitTask();
  } catch (err) {
    log.warn("post.index failed", { id: doc.id, error: err instanceof Error ? err.message : err });
  }
}

/**
 * Create a post (Step 28 — the headline write of the example entity). Auth-gated
 * and rate-limited like the other write actions, validates with the shared schema,
 * inserts via `@repo/db`, then indexes the new row into Meilisearch on write
 * (replacing the old hardcoded EXAMPLE_DOCUMENTS demo). Returns the shared
 * `ActionResult` — on a validation failure it carries a per-field `fieldErrors` map
 * (A7) the form maps inline, and it enforces a per-workspace unique title (below).
 */
export async function createPost(formData: FormData): Promise<CreateResult> {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return { error: "Unauthorized" };

  // Per-user cap (writes hit the DB + search engine). Server Actions can't set a 429
  // status, so the limit surfaces as the typed error the UI already renders.
  const limit = await rateLimit(`post:create:${session.user.id}`, { limit: 10, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  const parsed = createPostSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });
  // A7 — surface EVERY failing field, not just the first Zod issue: `zodFieldErrors`
  // maps them to a { field: message } object the form applies inline via RHF setError.
  if (!parsed.success) {
    return { error: "Please fix the fields below.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  // Stamp the caller's ACTIVE organization (NULL = personal workspace) so the post
  // lands in the right tenant. Read authoritatively (cookie cache bypassed) — the
  // session's cached active-org can lag up to 5 min after create/switch, which would
  // otherwise file a brand-new org's first post under personal (see lib/organization).
  const organizationId = await getActiveOrganizationId(reqHeaders);

  // Example SERVER-ONLY field validation (A7): reject a duplicate title within the
  // caller's workspace (their posts in the active org, else personal). This is the kind
  // of rule the client schema can't check without a round-trip, so it exercises the
  // fieldErrors path with JS on — mapped inline to the `title` input, not a form-level
  // banner. Remove this block if a real app doesn't want unique titles.
  const duplicate = await db.query.posts.findFirst({
    where: and(
      eq(posts.authorId, session.user.id),
      organizationId ? eq(posts.organizationId, organizationId) : isNull(posts.organizationId),
      eq(posts.title, parsed.data.title),
    ),
    columns: { id: true },
  });
  if (duplicate) {
    const message = "You already have a post with this title.";
    return { error: message, fieldErrors: { title: message } };
  }

  // A15 — the worked `db.transaction`: the post row AND its first history revision
  // must both commit or neither. `db.transaction` runs the callback in a single SQL
  // transaction and rolls back automatically if it throws, so a post can never exist
  // without its initial revision (and vice-versa). External side-effects that CAN'T
  // be rolled back — search indexing, cache revalidation — stay OUTSIDE the tx and
  // run only after it commits (a search outage must not undo a committed DB write).
  let created: { id: string; title: string; content: string };
  try {
    created = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({
          authorId: session.user.id,
          organizationId,
          title: parsed.data.title,
          content: parsed.data.content,
        })
        .returning({ id: posts.id, title: posts.title, content: posts.content });
      // Throwing here (or from the revision insert) aborts the whole transaction.
      if (!post) throw new Error("post insert returned no row");
      await tx.insert(postRevisions).values({
        postId: post.id,
        authorId: session.user.id,
        title: post.title,
        content: post.content,
      });
      return post;
    });
  } catch (err) {
    log.error("post.create transaction failed", {
      error: err instanceof Error ? err.message : err,
    });
    return { error: "Failed to create post." };
  }

  await indexPost(created);
  // revalidatePath refreshes the /posts dynamic render; updateTag busts the cached
  // `"use cache"` count (cacheTag("posts") in components/posts/post-stats.tsx) AND
  // refreshes it in this same Server Action response — read-your-own-writes, so the
  // author sees the new count immediately (the cacheComponents-native tag API).
  revalidatePath("/posts");
  updateTag("posts");
  return { data: { id: created.id, title: created.title } };
}

/**
 * Update a post (D1 — author-only edit). Mirrors `createPost`'s gate/limit/validate
 * shape — including the A7 `fieldErrors` map on a validation failure, which the edit
 * form maps inline — then authorizes by the same row-level ownership check
 * `deletePost` uses (admin override is the same one-liner). Re-indexes the updated
 * row on write so search stays in sync; `updatedAt` is bumped automatically by the
 * schema's `$onUpdate`. Returns the shared `ActionResult` the UI already handles.
 */
export async function updatePost(formData: FormData): Promise<UpdateResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const limit = await rateLimit(`post:update:${session.user.id}`, { limit: 10, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  const parsed = updatePostSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  // A7 — same convention as createPost: surface EVERY failing field via the
  // `fieldErrors` map so the edit form applies them inline (RHF setError).
  if (!parsed.success) {
    return { error: "Please fix the fields below.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  // Row-level authorization: look up the owner + org before writing, exactly like
  // deletePost. Allowed = the author, OR (for an ORG post) an owner/admin of that
  // post's organization — org managers can moderate their tenant's content. Personal
  // posts (organization_id NULL) stay author-only. The role is read fresh from the DB
  // for the POST's org (not the caller's active org), so authority is authoritative
  // regardless of which org is currently active (see lib/organization).
  const existing = await db.query.posts.findFirst({
    where: eq(posts.id, parsed.data.id),
    columns: { id: true, authorId: true, organizationId: true },
  });
  if (!existing) return { error: "Post not found" };
  if (existing.authorId !== session.user.id) {
    const orgRole = existing.organizationId
      ? await getOrgRole(existing.organizationId, session.user.id)
      : null;
    if (!isOrgAdminRole(orgRole)) return { error: "Forbidden" };
  }

  // A15 — same transactional pattern as createPost, here across TWO tables: the
  // `UPDATE posts` and the new-version `INSERT post_revisions` commit as one unit, so
  // the post's content and its recorded history can never drift apart. Indexing +
  // revalidation stay outside the tx (post-commit, best-effort).
  let updated: { id: string; title: string; content: string };
  try {
    updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(posts)
        .set({ title: parsed.data.title, content: parsed.data.content })
        .where(eq(posts.id, parsed.data.id))
        .returning({ id: posts.id, title: posts.title, content: posts.content });
      if (!row) throw new Error("post update returned no row");
      await tx.insert(postRevisions).values({
        postId: row.id,
        authorId: session.user.id,
        title: row.title,
        content: row.content,
      });
      return row;
    });
  } catch (err) {
    log.error("post.update transaction failed", {
      error: err instanceof Error ? err.message : err,
    });
    return { error: "Failed to update post." };
  }

  await indexPost(updated);
  revalidatePath("/posts");
  updateTag("posts");
  return { data: { id: updated.id, title: updated.title } };
}

/**
 * Delete a post. Demonstrates row-level authorization and keeps the search index in
 * sync — the document is removed after the row. Allowed = the author, OR an owner/admin
 * of the post's ORGANIZATION (org managers can moderate their tenant's content); personal
 * posts (organization_id NULL) stay author-only. The org role is read fresh from the DB
 * for the post's org (see lib/organization). A PLATFORM-admin override is a one-liner:
 * also allow when `getUserRole(session.user.id) === "admin"` (lib/rbac).
 */
export async function deletePost(postId: string): Promise<DeleteResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    columns: { id: true, authorId: true, organizationId: true },
  });
  if (!post) return { error: "Post not found" };
  if (post.authorId !== session.user.id) {
    const orgRole = post.organizationId
      ? await getOrgRole(post.organizationId, session.user.id)
      : null;
    if (!isOrgAdminRole(orgRole)) return { error: "Forbidden" };
  }

  await db.delete(posts).where(eq(posts.id, postId));

  if (isSearchConfigured()) {
    try {
      await getSearchClient().index<PostDocument>(POSTS_INDEX).deleteDocument(postId).waitTask();
    } catch (err) {
      log.warn("post.deindex failed", {
        id: postId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  revalidatePath("/posts");
  updateTag("posts");
  return { data: { id: postId } };
}

/**
 * Bulk-rebuild the posts index from the database (auth-gated + rate-limited). This
 * replaces the old `indexExampleDocuments` scaffold: it indexes REAL rows, and
 * bridges the DB-only `db:seed` to the search engine (seeded posts aren't searchable
 * until reindexed — see SERVICES.md). `addDocuments` upserts by `id`; a full rebuild
 * that also drops orphaned documents would `deleteAllDocuments()` first.
 *
 * Settings are applied unconditionally before the documents (P2-7): reindex is the
 * documented idempotent repair path, so it also repairs an index born with engine
 * defaults. Since A8 the write path also ensures the settings once per process
 * (`ensurePostsIndexSettings` in `indexPost`), so even an index first created by
 * `createPost` is born with the pinned shape — reindex stays the unconditional
 * repair for a drifted/stale index.
 *
 * Admin-only (2026-07-16, supersedes the P1-2 any-signed-in-user demo decision):
 * a full-table scan + bulk index write is an operator repair, not a user feature,
 * so it's gated on `requireAdmin()` — the authoritative DB role check — exactly
 * like `setUserRole` (actions/admin.ts). The /search page hides the button for
 * non-admins; the gate here is the authority either way. The per-admin cap stays
 * tighter than create/update (3/min vs 10/min) because one call rebuilds the
 * whole index.
 */
export async function reindexPosts(): Promise<ReindexResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Forbidden" };

  const limit = await rateLimit(`post:reindex:${admin.session.user.id}`, {
    limit: 3,
    windowSec: 60,
  });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  if (!isSearchConfigured()) return { error: "Search is not configured" };

  try {
    const docs: PostDocument[] = await db
      .select({ id: posts.id, title: posts.title, content: posts.content })
      .from(posts);

    const index = getSearchClient().index<PostDocument>(POSTS_INDEX);
    await index.updateSettings(POSTS_INDEX_SETTINGS).waitTask();
    if (docs.length > 0) {
      await index.addDocuments(docs).waitTask();
    }
    return { data: { indexed: docs.length } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reindex posts" };
  }
}
