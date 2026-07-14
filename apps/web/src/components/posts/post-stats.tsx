import { db } from "@repo/db";
import { posts } from "@repo/db/schema";
import { count } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

/**
 * Cached aggregate read — the `"use cache"` showcase (D4 · Next 16 Cache Components).
 *
 * `"use cache"` turns this function's result into a cache entry instead of a per-request
 * query: `cacheLife("minutes")` sets its freshness window and `cacheTag("posts")` lets
 * the write actions bust it precisely via `updateTag("posts")` (see
 * server/actions/post.ts). A cached function must take serializable args and return
 * serializable data, and cannot read request data (cookies/headers) — an aggregate
 * count is the ideal fit.
 *
 * The try/catch preserves the repo's "build green with the DB down" guarantee: under
 * cacheComponents this cached read is eligible to be prerendered into the /posts static
 * shell at build, so a build with no database must not throw. We cache a `null` sentinel
 * and let `cacheLife` expiry (or a write's `revalidateTag`) heal it to a real count once
 * the database is reachable at runtime.
 */
async function getPostStats(): Promise<{ total: number | null }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("posts");

  try {
    const [row] = await db.select({ total: count() }).from(posts);
    return { total: row?.total ?? 0 };
  } catch {
    return { total: null };
  }
}

/**
 * Async server component that renders the cached count. Wrap it in <Suspense> on the
 * page so the surrounding card chrome stays in the Partial-Prerender static shell while
 * this streams in.
 */
export async function PostStats() {
  const { total } = await getPostStats();

  return (
    <p className="text-sm text-muted-foreground">
      {total === null
        ? "Post count unavailable."
        : `${total} post${total === 1 ? "" : "s"} published.`}{" "}
      <span className="text-xs">
        (cached via <code>&quot;use cache&quot;</code>, revalidated on write)
      </span>
    </p>
  );
}
