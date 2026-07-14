import { TRPCError } from "@trpc/server";
import { MeilisearchApiError } from "meilisearch";
import { z } from "zod";
import { getSearchClient, isSearchConfigured, POSTS_INDEX, type PostDocument } from "@/lib/search";
import { createTRPCRouter, rateLimitedProcedure } from "../trpc";

export const searchRouter = createTRPCRouter({
  // Reads live in tRPC (writes — indexing — are side effects of the post actions in
  // server/actions/post.ts). Public (no session) but rate-limited: it hits the
  // external search engine on an open endpoint, so it uses rateLimitedProcedure
  // (20/min per IP → 429) and bounds the query length. Degrades to an empty result
  // set — never a 500 — when search is unconfigured or nothing is indexed.
  search: rateLimitedProcedure
    .input(z.object({ query: z.string().max(200) }))
    .query(async ({ input }): Promise<{ configured: boolean; hits: PostDocument[] }> => {
      if (!isSearchConfigured()) return { configured: false, hits: [] };

      try {
        const result = await getSearchClient()
          .index<PostDocument>(POSTS_INDEX)
          .search(input.query, { limit: 20 });
        return { configured: true, hits: result.hits };
      } catch (err) {
        // Searching before anything is indexed 404s with `index_not_found` — an
        // expected empty state for the demo, not an error. Surface anything else.
        if (err instanceof MeilisearchApiError && err.cause?.code === "index_not_found") {
          return { configured: true, hits: [] };
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Search failed",
          cause: err,
        });
      }
    }),
});
