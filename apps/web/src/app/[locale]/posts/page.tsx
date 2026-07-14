import { auth } from "@repo/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { POSTS_PAGE_SIZE } from "@/components/posts/constants";
import { CreatePostForm } from "@/components/posts/create-post-form";
import { PostList } from "@/components/posts/post-list";
import { PostListSkeleton } from "@/components/posts/post-list-skeleton";
import { PostStats } from "@/components/posts/post-stats";
import { getQueryClient, HydrateClient, trpc } from "@/lib/trpc/server";

// Example domain entity (Step 28) — the end-to-end "copy-me" template, reworked in D4
// into a Partial Prerender (PPR) showcase under Next 16 Cache Components. The page
// component is now SYNCHRONOUS: the card chrome (titles, static copy) is the prerendered
// static shell, and each piece that needs request data — the session-aware composer,
// the cached <PostStats>, and the cursor-paginated feed — sits behind its own <Suspense>
// boundary and streams in. So `next build` stays green with the DB down (the dynamic
// reads are deferred to request time; the cached count degrades via PostStats' try/catch)
// while the shell paints instantly. Delete when a real surface lands.
export default function PostsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <Suspense fallback={<ComposerCardFallback />}>
        <ComposerCard />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Posts</CardTitle>
          <CardDescription>Read via the public tRPC query, newest first.</CardDescription>
          <Suspense fallback={<Skeleton className="h-4 w-40" />}>
            <PostStats />
          </Suspense>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PostListSkeleton />}>
            <Feed />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

// The "New post" card — dynamic: reads the session to greet the author and to gate the
// form's submit affordance. Isolated behind a Suspense boundary so it streams without
// blocking the static shell. The optimistic-create temp row needs the author's id +
// display name; pass them down (null when signed out, which also gates the form).
async function ComposerCard() {
  const session = await auth.api.getSession({ headers: await headers() });
  const currentUser = session ? { id: session.user.id, name: session.user.name } : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
        <CardDescription>
          {session
            ? `Signed in as ${session.user.email} — publishing indexes the post for search.`
            : "Not signed in — publishing returns “Unauthorized”."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreatePostForm currentUser={currentUser} />
      </CardContent>
    </Card>
  );
}

// Static-shell placeholder for the composer card while its session read streams in.
function ComposerCardFallback() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

// The posts feed — dynamic: prefetches the FIRST page of the cursor-paginated list
// (same limit the client uses, so the query keys match and <HydrateClient> hydrates
// without a refetch) and renders PostList from that cache on first paint (the RSC
// prefetch + hydration pattern; see API.md). The DB read keeps this out of the static
// shell, so it streams in at request time.
async function Feed() {
  // Mark this subtree dynamic: it does a per-request DB-backed prefetch, and
  // HydrateClient's dehydrate() reads Date.now(), which cacheComponents forbids during
  // prerender unless request data is accessed first. connection() declares the request
  // dependency, keeps the prefetch out of the build (green with the DB down), and lets
  // the feed stream into the PPR shell.
  await connection();

  const queryClient = getQueryClient();
  void queryClient.prefetchInfiniteQuery(
    trpc.post.list.infiniteQueryOptions(
      { limit: POSTS_PAGE_SIZE },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );

  return (
    <HydrateClient>
      <PostList />
    </HydrateClient>
  );
}
