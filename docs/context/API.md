# API Layer

> When to load: building tRPC procedures, writing Server Actions, deciding which pattern to use.

## Pattern Decision: tRPC vs Server Actions

| Use | For |
| --- | --- |
| **tRPC** | Queries (reading data), complex data fetching, client-side refetching |
| **Server Actions** | Mutations (forms, creating/updating/deleting), progressive enhancement |

The rule: if a Client Component needs to fetch or refetch data, use tRPC. If a form or button needs to trigger a side effect, use a Server Action.

## tRPC Setup

Client integration uses **`@trpc/tanstack-react-query`** (tRPC v11's recommended
TanStack Query integration), not the older `createTRPCReact` from
`@trpc/react-query`. Hooks come from `useTRPC()` returning `queryOptions`, not an
`api.*.useQuery()` proxy. superjson is the transformer on both ends so `Date`/etc.
survive the wire.

```text
apps/web/src/server/trpc/
  trpc.ts           — tRPC instance, context factory, base procedures
  root.ts           — appRouter (combines all domain routers) + AppRouter type
  routers/
    user.ts         — example domain router
    ...
apps/web/src/server/actions/
  user.ts           — example Server Action (mutations)
apps/web/src/app/api/trpc/[trpc]/route.ts  — HTTP handler (fetch adapter)
apps/web/src/lib/trpc/
  query-client.ts   — makeQueryClient factory (superjson de/hydration)
  client.tsx        — "use client" provider + useTRPC hook
  server.tsx        — server-side proxy (trpc) + HydrateClient for RSC prefetch
```

## tRPC Procedure Pattern

```typescript
// server/trpc/routers/user.ts
import { user } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  // `db` and `session` come off ctx (built in trpc.ts createTRPCContext).
  health: publicProcedure.query(() => ({ status: "ok", time: new Date() })),

  getProfile: protectedProcedure.query(({ ctx }) => {
    return ctx.db.query.user.findFirst({ where: eq(user.id, ctx.session.user.id) });
  }),
});
```

Reading lives in tRPC; **writing lives in Server Actions** (see below). Don't add
`mutation` procedures for plain form mutations — reach for a Server Action.

## Procedure Types

- `publicProcedure` — no auth required
- `protectedProcedure` — requires valid session (throws `UNAUTHORIZED`; narrows
  `ctx.session` to non-null for the procedure body)
- `rateLimitedProcedure` — public, but rate-limited by client IP + procedure path
  (throws `TOO_MANY_REQUESTS` → HTTP 429 past the cap). Compose it for expensive or
  abusable **public** queries (`post.list`, `search.search`). For the authenticated
  case, reach for `userRateLimitedProcedure` (below) — it keys by user, not IP.
- `userRateLimitedProcedure` — **protected + rate-limited by user**.
  Builds on `protectedProcedure` (so a signed-out caller gets `UNAUTHORIZED` first),
  then keys the same limiter by `ctx.session.user.id` + path instead of client IP —
  the fair unit for an authenticated abusable read (one IP NATs many users; one account
  can rotate IPs). Same 20/min cap + 429 + `RateLimit-*`/`Retry-After` headers as its IP
  sibling (via the shared `ctx.rateLimit.blocked` slot). Example: `post.listMine`.
- `adminProcedure` — requires an admin (RBAC). Builds on
  `protectedProcedure`, then authoritatively reads the caller's role from the DB
  (not the possibly-stale session) and throws `FORBIDDEN` for non-admins; attaches
  `role` to ctx. Example: `admin.listUsers`. See [auth/rbac-admin.md](auth/rbac-admin.md).
- `orgProcedure` — requires an **active organization** the caller is a member of.
  Builds on `protectedProcedure`, then reads the
  active org **authoritatively** (`disableCookieCache` — the session's cached
  `activeOrganizationId` lags up to 5 min after create/switch) and the membership
  **role fresh from Postgres** (`lib/organization.ts`), the same authoritative posture
  as `adminProcedure`. No active org → `BAD_REQUEST`; active org but not a member →
  `FORBIDDEN`. Attaches `activeOrganizationId` + `orgRole` (`owner`/`admin`/`member`)
  to ctx. The base for org-scoped tRPC queries; org-scoped **writes** stay in Server
  Actions. See [auth/organizations.md](auth/organizations.md) + [DECISIONS.md](DECISIONS.md).

### Org-scoped reads & writes (Tier 4 · Band 4)

The example `post` entity is the worked multi-tenant case. `posts.organization_id`
is nullable — **NULL = the personal workspace** — so a zero-org clone behaves as before.

- **Read** — `post.list` (`rateLimitedProcedure`, stays public) is session-aware: it
  scopes to the caller's active org (`organization_id = $1`) when one is set, else to
  personal (`IS NULL`). Anonymous callers and signed-in users with no active org both
  see personal posts, so the public showcase keeps working. A read reads the active org
  from the (cookie-cached) `ctx.session` — it tolerates the ≤5-min staleness the cache
  already implies (self-healing); only writes/authz read authoritatively.
- **Write** — `createPost` stamps the caller's active org (read authoritatively) onto
  the new row. `updatePost`/`deletePost` authorize **author OR an owner/admin of the
  post's organization** (org managers moderate their tenant's content); personal posts
  stay author-only. The org role comes fresh from the DB for the *post's* org, not the
  caller's active org (`getOrgRole` / `isOrgAdminRole` in `lib/organization.ts`).

## Rate limiting

App-level rate limiting lives in `apps/web/src/lib/rate-limit.ts` — an
in-memory limiter by default, distributed via Upstash when its env is set. It's
applied at three surfaces:

- **tRPC** via `rateLimitedProcedure` (above) — the abusable public reads `post.list`
  and `search.search` — **or** `userRateLimitedProcedure` for an authenticated
  abusable read, keyed by user id instead of IP (`post.listMine`).
- **Server Actions** by calling `rateLimit(\`checkout:${session.user.id}\`, …)` and
  returning a typed `{ error }` when blocked (an action can't set a 429 status, so
  the limit surfaces as the same `ActionResult` the UI already handles).
- **Stripe webhook** (route handler) → HTTP 429.

This is separate from Better Auth's own limiter on `/api/auth/*`. Full
details — limits, storage, the no-CSP-change rationale — are in
[SECURITY.md](SECURITY.md#rate-limiting-app-level).

## Server Actions Pattern

```typescript
// server/actions/user.ts
"use server";

import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { user } from "@repo/db/schema";
import { updateNameSchema } from "@repo/validators";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

type ActionResult = { error: string } | { data: { name: string } };

export async function updateUserName(formData: FormData): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  const parsed = updateNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await db.update(user).set({ name: parsed.data.name }).where(eq(user.id, session.user.id));
  revalidatePath("/dashboard");
  return { data: { name: parsed.data.name } };
}
```

**Role-gated actions (RBAC):** for an admin-only mutation, gate with
`requireAdmin()` from `@/lib/rbac` instead of the plain session check — it does the
authoritative DB role read and returns `null` for non-admins, which the action turns
into a typed `{ error: "Forbidden" }` (an action can't set a 403 status). Example:
`server/actions/admin.ts` `setUserRole`, which also refuses to change the caller's
*own* role (anti-lockout) and `revalidatePath("/admin")`s so its client
`RoleControl` (optimistic via `useOptimistic`) reconciles. See
[auth/rbac-admin.md](auth/rbac-admin.md).

### Typed field errors — the `ActionResult` convention (A7)

Actions return the shared `ActionResult<T>` from `@repo/validators` — the older
per-file `{ error: string } | { data: T }` types, plus an OPTIONAL per-field
`fieldErrors` map on the error arm:

```typescript
export type FieldErrors = Record<string, string>; // field name → message
export type ActionResult<T> = { error: string; fieldErrors?: FieldErrors } | { data: T };
```

It stays backward-compatible (`"error" in result` still discriminates; the field is
optional), so adopt it per-action — don't churn every file. On a Zod `safeParse`
failure, map **every** failing field with `zodFieldErrors(parsed.error)` (first
message per top-level field) instead of collapsing to `issues[0]`:

```typescript
const parsed = createPostSchema.safeParse({ title: fd.get("title"), content: fd.get("content") });
if (!parsed.success)
  return { error: "Please fix the fields below.", fieldErrors: zodFieldErrors(parsed.error) };
```

On the client, map them onto React Hook Form so each field shows its message inline
via `<FormMessage/>` (never a toast — field validation stays inline; a field-less
`error`, e.g. `Unauthorized`, stays a form-level banner). `applyFieldErrors` from
`@/lib/forms` is the one-liner: `setError(field, { message })` per entry.

**Worked examples:** `server/actions/post.ts` `createPost` + `components/posts/
create-post-form.tsx`, and `updatePost` + the inline edit form in
`components/posts/post-item.tsx` (both post writes share the convention). `createPost` also demonstrates a **server-only** field rule the client
schema can't check without a round-trip — a per-workspace unique title — returning
`fieldErrors: { title }` mapped inline to the title input. Each mutation carries
`fieldErrors` on the thrown error (`FieldActionError` from `@/lib/forms`) into
`onError`, which calls `applyFieldErrors`; a field-less error (Unauthorized,
Forbidden, rate-limit) falls back to the form-level banner.

## Client-Side Usage

`useTRPC()` returns a proxy whose leaves produce TanStack Query option objects;
pass them to TanStack's own `useQuery`/`useMutation`. Mutations are Server
Actions, so a Client Component reads via tRPC and writes via the action directly.

```tsx
// In a Client Component
"use client";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

function UserProfile() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.user.getProfile.queryOptions());
  // ...
}
```

### Server-Component prefetch + hydration

```tsx
// A Server Component
import { getQueryClient, HydrateClient, trpc } from "@/lib/trpc/server";

export default async function Page() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(trpc.user.getProfile.queryOptions());
  return (
    <HydrateClient>
      <UserProfile />
    </HydrateClient>
  );
}
```

The `/posts` page is the **live worked example** of this prefetch +
hydration pattern: `app/[locale]/posts/page.tsx` prefetches the first page of `trpc.post.list`
(via `prefetchInfiniteQuery` — see pagination below) and wraps the list in
`<HydrateClient>`, so `PostList` renders from cache on first paint. It works without
forcing static-build DB access because the page is already dynamic (`ƒ`) — it reads
the session — so the prefetch runs at request time, not at build.

## Example entity (`post`, Step 28 + D1)

The `post` router + actions are the copy-me template for a real entity:

- **Read — tRPC query:** `post.list` (`rateLimitedProcedure`) lists posts newest-first,
  joining the author name from `user` (`server/trpc/routers/post.ts`). **Org-scoped**:
  the caller's active org, else personal (`organization_id IS NULL`)
  — see "Org-scoped reads & writes" above. `post.listMine`
  (`userRateLimitedProcedure`) is the authenticated companion — the caller's own posts across every
  workspace (`author_id = me`), same keyset cursor but rate-limited **per user** instead
  of per IP; the copy-me for any per-account expensive read.
- **Write — Server Actions** (`server/actions/post.ts`): `createPost` (auth-gated,
  rate-limited, validates with `createPostSchema`, **stamps the caller's active org**,
  inserts, then **indexes the row into Meilisearch on write**), `updatePost` (edit —
  same row-level authz as delete: **author OR org owner/admin** — re-validates, updates,
  re-indexes), `deletePost` (same authz — deletes + de-indexes), and `reindexPosts`
  (bulk-rebuilds the index from the DB; this is what
  the `/search` demo's button now calls — rate-limited 3/min per user, tighter than
  create/update's 10/min because it's a full-table scan + bulk index write; a real app
  would `requireAdmin()` it, see [services/meilisearch.md](services/meilisearch.md)). Indexing
  is best-effort: a search outage logs but never fails the DB write. See
  [services/meilisearch.md](services/meilisearch.md) and [DATABASE.md](DATABASE.md).

### Cursor pagination (D1)

`post.list` pages by a **keyset cursor**, not OFFSET. Input is `{ cursor?, limit }`
where `cursor` is the `(createdAt, id)` of the last returned row; the query selects
rows strictly older than the cursor (`id` breaks `createdAt` ties) and fetches
`limit + 1` to compute `nextCursor` without a second COUNT. Output is
`{ items, nextCursor }` (`nextCursor: null` ⇒ last page). Keyset never skips or
repeats a row when the set shifts and stays cheap as you page deeper — unlike OFFSET.

**When the id column is a uuid, validate the cursor id as one** (`id: z.uuid()` —
`post.list`/`post.listMine` and `notification.list` do): a hand-crafted non-uuid
cursor otherwise reaches `id < $1` and Postgres throws `invalid input syntax for
type uuid` — a 500 whose error body leaks the query text (live-reproduced). A
legitimate cursor is always server-originated (react-query feeds `nextCursor`
back), so a 400 at the Zod boundary is the right response; the degrade-to-page-1
treatment is only for human-pasteable URL cursors (`/admin/audit`, see
`lib/keyset-cursor.ts`). `admin.listUsers` deliberately keeps `id: z.string()` —
Better Auth's `user.id` is a `text` column, so any string is a valid comparison.

The field **must** be named `cursor` — that is the page param
`@trpc/tanstack-react-query`'s `infiniteQueryOptions` reads/writes. The client
(`post-list.tsx`) drives it with `useInfiniteQuery` + a "Load more" button:

```tsx
const posts = useInfiniteQuery(
  trpc.post.list.infiniteQueryOptions(
    { limit: POSTS_PAGE_SIZE },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  ),
);
const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
```

`POSTS_PAGE_SIZE` lives in a plain `constants.ts` (no `server-only`) so the RSC
prefetch and the client query use the **same** limit — otherwise their query keys
differ and the prefetch won't hydrate.

### Optimistic mutations (D1)

The create/edit/delete writes update the UI **before** the server responds. Each is a
TanStack `useMutation` wrapping the Server Action, with the canonical rollback shape:

- `onMutate` — `cancelQueries` (so an in-flight refetch can't clobber the optimistic
  state), snapshot the current cache with `getQueryData`, apply the change immediately
  with `setQueryData` (prepend / patch / remove against the infinite cache), and
  **return the snapshot** as context.
- `onError` — restore the snapshot (`setQueryData(key, context.previous)`) and surface
  the action's typed error.
- `onSettled` — `invalidateQueries` so the server's truth replaces the provisional row
  (canonical id/timestamps).

Cache edits return a **new** object graph (never mutate in place) so React/Query see a
fresh reference. The cache helpers (`components/posts/post-cache.ts`) map over
`pages[].items` since the infinite cache is pages, not a flat array. Controls show on
**every** row, so editing/deleting another author's post optimistically changes it then
rolls back on the typed `Forbidden` — a live demo of the rollback path. The
where-state-lives framing is [STATE.md](STATE.md#optimistic-updates-d1).

## Realtime / Server-Sent Events (SSE) (Tier 4 · A22)

For **server-pushed** updates (live notifications, presence, job progress) the repo
ships a worked **SSE** example — a route handler that streams, driven by Postgres
**LISTEN/NOTIFY** so it's correct across multiple instances. The demo entity is
per-user notifications (`/notifications`). The split stays the app's usual one:
**writes are Server Actions, the stream + the initial read are separate surfaces.**

- **Publish** — `notify(channel, payload)` (`@repo/db`) wraps `SELECT pg_notify($1,$2)`
  (parameterized, so the channel can't inject SQL). Call it from wherever the event
  actually originates — a Server Action, a webhook, a finished background job.
  `sendTestNotification` (`server/actions/notification.ts`) is the demo trigger: it
  **persists** a row *and* publishes it. NOTIFY's payload cap is 8 KB — send an id +
  a few scalars, and re-fetch for anything larger.
- **Subscribe (server)** — `server/realtime/notification-bus.ts` holds **one** dedicated
  `pg` LISTEN connection per instance (via `@repo/db`'s `createPgListener`) and fans each
  notification out in-process to that user's open streams (a `Map<userId, Set<handler>>`).
  One global channel + a payload `userId` filter keeps the connection count at one and
  avoids dynamic SQL identifiers; per-user (hashed) channels are the documented scale-up.
  A `globalThis` singleton survives dev HMR; a dropped connection reconnects on a timer.
- **Stream** — `app/api/notifications/stream/route.ts` is the `GET` SSE handler: session-
  auth (401 otherwise), a `ReadableStream` that subscribes the caller's `userId`, a 25 s
  `: ping` heartbeat, and `cancel`/`abort` cleanup. It runs on **Node** (the `pg` LISTEN
  client is not Edge-safe) via `connection()` — the health-route pattern, since
  `cacheComponents` bans the `runtime` segment config. Frames come from the pure
  `server/realtime/sse.ts` helper. `/api/*` is excluded from the i18n proxy matcher, and
  same-origin `EventSource` is already covered by `connect-src 'self'` — so **no CSP
  change** (see [SECURITY.md](SECURITY.md)).
- **Client** — the feed reads the initial page via the `notification.list` tRPC query and
  **keyset-paginates** it (`useInfiniteQuery` + a "Load more" button): input is
  `{ cursor?, limit }`, output `{ items, nextCursor }`, the same `(createdAt, id)` cursor +
  `limit + 1` probe as `post.list` (the cursor `id` is uuid-validated like `post.list`'s —
  see "Cursor pagination" above). Stream events push into that same query
  cache with `setQueryData` — which, because the cache is now infinite-query-shaped
  (`{ pages, pageParams }`), means **prepend into `pages[0]` and dedupe across all loaded
  pages** — see [STATE.md](STATE.md#realtime--push-state--feed-the-query-cache-tier-4--a22).
- **Unread badge** — a companion `notification.unreadCount` query is the badge's
  **authoritative** source. It's a SQL `count()` (not fetch-every-unread-row + count in
  JS), so it stays a single aggregate row regardless of how many are unread — and it
  reflects the *server* total, not just the loaded page, which a page-derived tally would
  undercount past `NOTIFICATIONS_PAGE_SIZE`. Being a separate query, it's kept in
  lockstep with the list: the feed invalidates it on each SSE push, on the reconnect
  backfill, and on the offline-send fallback, and sets it straight to `0` on mark-all-read.

**Delivery is at-least-once while connected, self-healing across a reconnect** — a NOTIFY
in the reconnect gap is missed *as a push* (the server doesn't replay), but the client
**backfills on re-open**: `EventSource.onopen` after a drop invalidates `notification.list`,
so the feed reconciles against the persisted table with no reload. Every notification
is persisted, so the initial load reconciles too. **Serverless caveat:** SSE needs a long-lived
connection and a persistent DB connection — native on the Docker / `next start` target
this repo ships, but capped/broken on serverless. See
[DEPLOYMENT.md](DEPLOYMENT.md#realtime-sse--serverless-caveat-tier-4--a22).
