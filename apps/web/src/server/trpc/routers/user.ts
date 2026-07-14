import { user } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  // Public, dependency-free probe — handy for verifying the tRPC pipe end to end
  // (returns a Date to also exercise the superjson transformer). Kept on
  // publicProcedure; the app-level limiter now guards the abusable public reads
  // (post.list / search.search) instead — see ../trpc.ts and lib/rate-limit.ts.
  health: publicProcedure.query(() => ({ status: "ok", time: new Date() })),

  getProfile: protectedProcedure.query(({ ctx }) => {
    return ctx.db.query.user.findFirst({
      where: eq(user.id, ctx.session.user.id),
    });
  }),
});
