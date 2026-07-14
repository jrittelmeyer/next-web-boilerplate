import type { InfiniteData } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";

// Type-only imports from the server router (erased at build) so this stays in the
// client bundle without pulling `server-only` — the same trick client.tsx uses.
type RouterOutput = inferRouterOutputs<AppRouter>;

/** One page of `post.list` — `{ items, nextCursor }`. */
export type PostListPage = RouterOutput["post"]["list"];

/** A single row as the list/optimistic code sees it (incl. the joined author name). */
export type PostListItem = PostListPage["items"][number];

/**
 * The shape `useInfiniteQuery` keeps in the cache: pages of rows plus the keyset page
 * param. The second type arg matches the cursor the tRPC infinite-query helper threads
 * through, so `setQueryData` under `infiniteQueryKey()` type-checks without a cast.
 */
export type PostListData = InfiniteData<PostListPage, PostListPage["nextCursor"]>;

// All three optimistic mutations (create/edit/delete) edit the SAME infinite cache,
// which is pages of items — so each helper maps over `pages[].items`. They return a
// new object graph (no mutation) so React/Query see a fresh reference, and they pass
// `undefined` straight through (cache not populated yet → the onSettled invalidate
// reconciles instead).

function mapItems(
  data: PostListData | undefined,
  fn: (items: PostListItem[]) => PostListItem[],
): PostListData | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) };
}

/** Drop a row by id from every page (optimistic delete). */
export function removePostFromCache(
  data: PostListData | undefined,
  id: string,
): PostListData | undefined {
  return mapItems(data, (items) => items.filter((post) => post.id !== id));
}

/** Patch a row's title/content in place (optimistic edit). */
export function patchPostInCache(
  data: PostListData | undefined,
  id: string,
  patch: { title: string; content: string },
): PostListData | undefined {
  return mapItems(data, (items) =>
    items.map((post) => (post.id === id ? { ...post, ...patch } : post)),
  );
}

/**
 * Prepend a freshly-created row to the first page (optimistic create). Newest-first
 * ordering means a new post always belongs at the top; the onSettled invalidate later
 * swaps this temp row for the server's real one (with its canonical id/timestamps).
 */
export function prependPostToCache(
  data: PostListData | undefined,
  post: PostListItem,
): PostListData | undefined {
  if (!data) return data;
  const [first, ...rest] = data.pages;
  // `noUncheckedIndexedAccess`: the first page is `Page | undefined` until we narrow.
  if (!first) return data;
  return { ...data, pages: [{ ...first, items: [post, ...first.items] }, ...rest] };
}
