"use client";

import { Button } from "@repo/ui/components/button";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { POSTS_PAGE_SIZE } from "./constants";
import { PostItem } from "./post-item";
import { PostListSkeleton } from "./post-list-skeleton";

// Reads the example `posts` entity via the public, cursor-paginated `post.list` tRPC
// query. The RSC (app/posts/page.tsx) prefetches the first page with the SAME limit
// and hydrates it, so this renders from cache on first paint with no client refetch.
// Each row (edit/delete + optimistic cache updates) lives in <PostItem>; this
// component owns the list shell + the keyset "Load more".
export function PostList() {
  const trpc = useTRPC();
  const posts = useInfiniteQuery(
    trpc.post.list.infiniteQueryOptions(
      { limit: POSTS_PAGE_SIZE },
      // `nextCursor` is the (createdAt, id) keyset of the last returned row, or null at
      // the end — react-query treats null/undefined as "no more pages".
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );

  if (posts.isPending) {
    return <PostListSkeleton />;
  }
  if (posts.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Failed to load posts: {posts.error.message}
      </p>
    );
  }

  const items = posts.data.pages.flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No posts yet. Publish one above, or run <code>pnpm --filter @repo/db db:seed</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3" aria-live="polite">
        {items.map((post) => (
          <PostItem key={post.id} post={post} />
        ))}
      </ul>
      {posts.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => posts.fetchNextPage()}
          disabled={posts.isFetchingNextPage}
        >
          {posts.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
