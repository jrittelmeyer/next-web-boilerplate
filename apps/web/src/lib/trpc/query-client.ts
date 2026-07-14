import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

/**
 * One factory, used on both sides: a fresh client per request on the server, a
 * lazily-created singleton in the browser (see getQueryClient in client.tsx).
 *
 * superjson de/serializes dehydrated data so Server Component prefetches and the
 * client cache agree on Date/Map/etc. `pending` queries are dehydrated too so
 * streamed prefetches hydrate without a refetch flash.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000 },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
}
