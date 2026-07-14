import { user } from "@repo/db/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";

// Server-side cap on page size — same rationale as post.list: the default is a sane
// page, the `.max()` keeps a caller from requesting an unbounded one.
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

// Keyset cursor — the same (createdAt, id) shape as post.list's (D1). The field MUST
// be named `cursor` for `@trpc/tanstack-react-query`'s infinite-query helper. Unlike
// post.list / notification.list, `id` deliberately stays z.string(): user.id is a
// TEXT column (Better Auth generates its own ids), so any string is a valid keyset
// comparison — the uuid-500 those routers guard against can't happen here.
const cursorSchema = z.object({ createdAt: z.date(), id: z.string() });

/**
 * Admin-only router (Step 21). Every procedure uses `adminProcedure`, so it
 * returns UNAUTHORIZED when logged out and FORBIDDEN for a non-admin — the
 * authoritative role check runs against the DB on each call (see trpc.ts).
 */
export const adminRouter = createTRPCRouter({
  // Lists users with their roles — the verifiable admin surface. Cursor-paginated
  // (P3-5) in the same {items, nextCursor} shape as post.list; the /admin page reads
  // the same data directly (Server Component) with the flat-string form of this
  // cursor in its URL. Both orderings are served by user_created_at_id_idx (0006).
  listUsers: adminProcedure
    .input(
      z.object({
        cursor: cursorSchema.nullish(),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      // limit+1 probe → hasMore without a COUNT; the keyset predicate selects rows
      // strictly older than the cursor (or equal createdAt but a smaller id),
      // matching the (createdAt desc, id desc) ordering below.
      const rows = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(
          cursor
            ? or(
                lt(user.createdAt, cursor.createdAt),
                and(eq(user.createdAt, cursor.createdAt), lt(user.id, cursor.id)),
              )
            : undefined,
        )
        .orderBy(desc(user.createdAt), desc(user.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];
      const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

      return { items, nextCursor };
    }),
});
