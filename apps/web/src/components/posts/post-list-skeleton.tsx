import { Skeleton } from "@repo/ui/components/skeleton";

// Component-level loading placeholder for the posts feed (Band-2 A14). It mirrors the
// bordered-card shape of a real <PostItem> row (title line + content line + meta line)
// so the layout doesn't shift when the data streams in. Reused at BOTH the feed's
// loading boundaries: the server <Suspense> fallback in app/posts/page.tsx (shown while
// the RSC prefetch streams) and the client `post.list` isPending branch in post-list.tsx
// (shown if the hydration cache is cold). The wrapper carries role="status" for a11y; the
// individual bones are decorative.
//
// Static, never-reordered rows keyed off a fixed list (not the array index — that's the
// noArrayIndexKey lint rule, and there's no data identity to key on).
const ROW_KEYS = ["a", "b", "c"];

export function PostListSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading posts">
      {ROW_KEYS.map((key) => (
        <div key={key} className="rounded-md border p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}
