import { notifications } from "@repo/db/schema";
import { and, count, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Reads for the realtime notifications example (Tier 4 · A22). Writes — send / mark-read
// — live in server/actions/notification.ts (the app's tRPC-reads / action-writes split).
// This supplies the feed's INITIAL page; new notifications after mount arrive over the
// SSE stream (app/api/notifications/stream/route.ts), which the client prepends into
// this same query's cache — so the two never double-deliver.

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

// Keyset cursor: the (createdAt, id) of the last row on the previous page — the same
// shape as post.list's D1 cursor, carried as a tRPC input the infinite-query helper
// threads through as the page param (the field MUST be named `cursor`). `id` is
// validated as a uuid HERE: notifications.id is a uuid column, so a hand-crafted
// non-uuid cursor would reach `id < $1` and make Postgres throw `invalid input syntax
// for type uuid` (a 500). Because a legitimate cursor is ALWAYS server-originated
// (react-query feeds `nextCursor` back), rejecting a non-uuid at this validation
// boundary — a 400, never a 500 — is the right guard; there is no human-pasteable-URL
// path here that would warrant the /admin/audit page's degrade-to-page-1 instead.
const cursorSchema = z.object({ createdAt: z.date(), id: z.uuid() });

export const notificationRouter = createTRPCRouter({
  // The caller's notifications, newest-first. protectedProcedure (not the rate-limited
  // variant) because it's a tightly-scoped, indexed per-user read that the client loads
  // once and then keeps fresh over SSE rather than by polling. Scoped to
  // `user_id = me`; the (user_id, created_at desc, id desc) index serves the filter +
  // sort in one pass (schema/notifications.ts). Bounded by `limit` so a hostile caller
  // can't request an unbounded page. Keyset-paginated ("Load more"): same `limit + 1`
  // probe + (createdAt, id) cursor as post.list.
  list: protectedProcedure
    .input(
      z
        .object({
          cursor: cursorSchema.nullish(),
          limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        })
        .default({ limit: DEFAULT_PAGE_SIZE }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      // Fetch one extra row to learn whether another page exists without a second COUNT.
      // The keyset predicate selects rows strictly older than the cursor (or equal
      // createdAt but a smaller id) — matching the (createdAt desc, id desc) order below.
      const rows = await ctx.db
        .select({
          id: notifications.id,
          type: notifications.type,
          body: notifications.body,
          read: notifications.read,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, ctx.session.user.id),
            cursor
              ? or(
                  lt(notifications.createdAt, cursor.createdAt),
                  and(
                    eq(notifications.createdAt, cursor.createdAt),
                    lt(notifications.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      // The cursor must be the last row we actually RETURN (not the probe row), or the
      // next page would skip it. `null` signals "no more pages" to getNextPageParam.
      const last = items[items.length - 1];
      const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

      return { items, nextCursor };
    }),

  // Count of unread — a cheap companion read for a badge/heading. Same per-user scope.
  // SQL count() (one aggregate row over the wire), NOT fetch-every-unread-row and count
  // in JS: the shape stays O(1) regardless of how many are unread — the right pattern for
  // the thing this demonstrates. The (user_id, …) index serves the `user_id = me` filter;
  // Postgres then counts the `read = false` subset. The feed reads this as the
  // AUTHORITATIVE badge count (its loaded page is only the first NOTIFICATIONS_PAGE_SIZE,
  // so a local page-derived count would undercount once unread exceeds it); the client
  // invalidates it alongside notification.list at each cache mutation.
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.session.user.id), eq(notifications.read, false)));
    return { count: row?.value ?? 0 };
  }),
});
