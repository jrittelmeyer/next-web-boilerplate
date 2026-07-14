import "server-only";

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache, type ReactNode } from "react";
import { appRouter } from "@/server/trpc/root";
import { createTRPCContext } from "@/server/trpc/trpc";
import { makeQueryClient } from "./query-client";

// One QueryClient per request (React cache dedupes within a render pass).
export const getQueryClient = cache(makeQueryClient);

/**
 * Server-side tRPC entry for Server Components. Use it to prefetch into the
 * request's QueryClient, then wrap the client subtree in <HydrateClient> so the
 * browser picks up the cache without a second fetch:
 *
 *   const qc = getQueryClient();
 *   void qc.prefetchQuery(trpc.user.getProfile.queryOptions());
 *   return <HydrateClient><Profile /></HydrateClient>;
 */
export const trpc = createTRPCOptionsProxy({
  ctx: async () => createTRPCContext({ headers: await headers() }),
  router: appRouter,
  queryClient: getQueryClient,
});

export function HydrateClient({ children }: { children: ReactNode }) {
  return <HydrationBoundary state={dehydrate(getQueryClient())}>{children}</HydrationBoundary>;
}
