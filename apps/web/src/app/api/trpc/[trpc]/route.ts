import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { rateLimitHeaders } from "@/lib/rate-limit";
import { appRouter } from "@/server/trpc/root";
import { createTRPCContext } from "@/server/trpc/trpc";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    // Emit the standard RateLimit-*/Retry-After headers on a rate-limited 429. The
    // rate-limit middleware (trpc.ts) stashes the blocked bucket on `ctx.rateLimit`;
    // read it back here and translate it into headers. Emitted on the 429 only — the
    // client uses httpBatchLink (non-streaming), so this fires once after the batch
    // resolves and applies to the whole HTTP response. Auth routes are separate: Better
    // Auth's own limiter already sets X-Retry-After on `/api/auth/*`.
    responseMeta({ ctx, errors }) {
      const blocked = ctx?.rateLimit.blocked;
      const tooMany = errors.some((e) => e.code === "TOO_MANY_REQUESTS");
      if (tooMany && blocked) {
        return { headers: rateLimitHeaders(blocked) };
      }
      return {};
    },
  });
}

export { handler as GET, handler as POST };
