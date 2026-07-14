// Page size for the cursor-paginated /posts list — deliberately small so "Load more"
// is exercised even with a handful of rows (the db:seed ships eight). Shared by the
// RSC prefetch (app/posts/page.tsx) and the client useInfiniteQuery (post-list.tsx)
// so their query keys match and the prefetch hydrates without a refetch flash.
//
// Plain module (no `server-only`, no client hooks) so BOTH the server page and the
// client components can import it.
export const POSTS_PAGE_SIZE = 5;
