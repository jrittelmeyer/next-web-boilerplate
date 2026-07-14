import { posts, user } from "@repo/db/schema";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, rateLimitedProcedure, userRateLimitedProcedure } from "../trpc";

// Server-side cap on page size. The client (post-list.tsx) chooses a smaller page
// (POSTS_PAGE_SIZE) and is the default here, but the `.max()` keeps a hostile caller
// from requesting an unbounded page on this public endpoint.
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 5;

// Keyset cursor (D1): the (createdAt, id) of the last row on the previous page.
// `id` is the tiebreaker so rows that share a `created_at` still paginate
// deterministically — unlike OFFSET, keyset never skips/repeats a row when the set
// shifts under you, and stays cheap as you page deeper. The field MUST be named
// `cursor` — that is the property `@trpc/tanstack-react-query`'s infinite-query
// helper reads/writes as the page param. `id` is validated as a uuid (the A25
// pattern, see notification.ts): posts.id is a uuid column, so a hand-crafted
// non-uuid cursor would reach `id < $1` and make Postgres throw `invalid input
// syntax for type uuid` — a 500 whose error body leaks the query text. A
// legitimate cursor is ALWAYS server-originated (react-query feeds `nextCursor`
// back), so rejecting a non-uuid at this validation boundary — a 400, never a
// 500 — is the right guard; there is no human-pasteable-URL path here that would
// warrant /admin/audit's degrade-to-page-1 instead. Exported for post.test.ts,
// which pins the uuid rejection.
export const cursorSchema = z.object({ createdAt: z.date(), id: z.uuid() });

export const postRouter = createTRPCRouter({
  // Reads live in tRPC (writes — create/update/delete — live in server/actions/post.ts).
  // Public (no session) but rate-limited: it runs a DB query on an open endpoint, so it
  // uses rateLimitedProcedure (20/min per IP → 429). The author's display name is joined
  // in from the Better Auth `user` table at read time (a leftJoin keeps that schema free
  // of a Drizzle `relations()` definition). Cursor-paginated, newest-first.
  list: rateLimitedProcedure
    .input(
      z.object({
        cursor: cursorSchema.nullish(),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      // Org scoping (Tier 4 · Band 4): show the caller's ACTIVE organization when they
      // have one (`organization_id = $1`), else the PERSONAL workspace (`IS NULL`).
      // Anonymous callers and signed-in users with no active org both see personal
      // posts, so this public showcase keeps working with zero orgs. A READ tolerates
      // the (up-to-5-min) session cookie-cache staleness that `ctx.session` carries —
      // worst case a just-switched org shows the previous scope briefly, self-healing;
      // WRITES and authz read the active org authoritatively (see lib/organization.ts).
      // The scope is a leading equality/IS-NULL predicate, so posts_org_id_created_at_id_idx
      // serves both the filter and the keyset sort in one index (schema/posts.ts).
      const activeOrganizationId = ctx.session?.session?.activeOrganizationId ?? null;
      const orgScope = activeOrganizationId
        ? eq(posts.organizationId, activeOrganizationId)
        : isNull(posts.organizationId);

      // Fetch one extra row to learn whether another page exists without a second
      // COUNT query. The keyset predicate selects rows strictly older than the cursor
      // (or equal createdAt but a smaller id) — matching the (createdAt desc, id desc)
      // ordering below.
      const rows = await ctx.db
        .select({
          id: posts.id,
          title: posts.title,
          content: posts.content,
          createdAt: posts.createdAt,
          authorId: posts.authorId,
          authorName: user.name,
        })
        .from(posts)
        .leftJoin(user, eq(posts.authorId, user.id))
        .where(
          and(
            orgScope,
            cursor
              ? or(
                  lt(posts.createdAt, cursor.createdAt),
                  and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      // The cursor must be the last row we actually RETURN (not the probe row), or the
      // next page would skip it. `null` signals "no more pages" to getNextPageParam.
      const last = items[items.length - 1];
      const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

      return { items, nextCursor };
    }),

  // "My posts" — the worked example for `userRateLimitedProcedure` (Tier 4 · A16): an
  // AUTHENTICATED, abusable read (a DB scan behind a session) whose fair unit is the
  // user, not the source IP — so it's rate-limited by `ctx.session.user.id`, not by IP
  // like the public `list` above. A signed-out caller gets UNAUTHORIZED before the query
  // (the protected layer runs first); past 20/min per user the caller gets a 429 with the
  // standard RateLimit-*/Retry-After headers. Scoped purely by `author_id = me` (ALL my
  // posts, across every workspace) — deliberately distinct from `list`'s org-scoped,
  // public showcase. Same keyset cursor + `limit + 1` probe as `list`; no author-name
  // join (every row is the caller). Copy-me for any per-account expensive read.
  listMine: userRateLimitedProcedure
    .input(
      z.object({
        cursor: cursorSchema.nullish(),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      const rows = await ctx.db
        .select({
          id: posts.id,
          title: posts.title,
          content: posts.content,
          createdAt: posts.createdAt,
          authorId: posts.authorId,
        })
        .from(posts)
        .where(
          and(
            eq(posts.authorId, ctx.session.user.id),
            cursor
              ? or(
                  lt(posts.createdAt, cursor.createdAt),
                  and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];
      const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

      return { items, nextCursor };
    }),
});
