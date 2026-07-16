# State Management

> When to load: deciding where a piece of state lives, adding a Zustand store, or
> reaching for client-side data fetching/caching. Pairs with [API.md](API.md), which
> owns the tRPC (reads) / Server Actions (writes) boundary.

## The read-model boundary (read this first)

There are **two** kinds of state and they live in two different places. The single
most important rule in this project's state layer:

> **Server/async state → TanStack Query. Ephemeral client/UI state → Zustand.
> Never copy server data into a Zustand store.**

| State is... | Examples | Lives in |
| --- | --- | --- |
| **Server/async** — owned by the backend, fetched, can go stale | the current user, a list of posts, anything from tRPC/the DB | **TanStack Query** (the server cache) |
| **Ephemeral client/UI** — owned by the browser session, never persisted to the DB | sidebar open/closed, active tab, command-menu visibility, an optimistic "is this row selected" flag | **Zustand** |

Why this split: TanStack Query already gives server data caching, deduping,
revalidation, loading/error states, and refetch-on-focus. Mirroring that data into a
Zustand store means two sources of truth that drift — the store goes stale the moment
the server changes. So the store never holds a `user`, a `post[]`, or any fetched
entity. If you're tempted to, the data belongs in a query (`useQuery`) keyed by the
thing you're fetching; derive what the UI needs from `data`.

A useful test: **"If two tabs disagreed about this value, would that be a bug?"**
Yes → it's server state → TanStack Query. No (each tab can legitimately differ, e.g.
its own sidebar) → it's client state → Zustand. One special case: client state that
should be **shareable/bookmarkable** (filters, tabs, the current page) belongs in the
**URL**, not a store — see [URL as state](#url-as-state-shareable-client-state) below.

## TanStack Query (server state) — already wired

TanStack Query v5 (`@tanstack/react-query`) is installed and mounted through the tRPC
provider in [`lib/trpc/client.tsx`](../../apps/web/src/lib/trpc/client.tsx) — there is
**no second `QueryClientProvider`** to add for Zustand (Zustand needs no provider at
all). Read server data with the tRPC + TanStack integration documented in
[API.md](API.md) (`useTRPC()` → `queryOptions` → `useQuery`); don't hand-roll `fetch`
in components. Writes are Server Actions, not query mutations.

### Optimistic updates (D1)

A write can still update the server cache *optimistically* — wrap the Server Action in
a TanStack `useMutation` and edit the query cache in `onMutate`, before the round-trip.
This is the one sanctioned way client code mutates server-state cache, and it stays a
single source of truth: the optimistic edit is provisional and `onSettled` reconciles
it against the server. The shape (worked example: the `/posts` create/edit/delete in
[`components/posts/`](../../apps/web/src/components/posts/)):

- `onMutate` — `cancelQueries` (so an in-flight refetch can't clobber the optimistic
  state), snapshot the current cache with `getQueryData`, apply the change with
  `setQueryData`, and **return the snapshot** as context.
- `onError` — restore the snapshot (`setQueryData(key, context.previous)`) and surface
  the action's typed error.
- `onSettled` — `invalidateQueries` so the server's truth replaces the provisional row
  (canonical id/timestamps).

Cache edits return a **new** object graph (never mutate in place) so React/Query see a
fresh reference. For a paginated (`useInfiniteQuery`) cache, map over `pages[].items`
rather than treating `data` as a flat array — see `post-cache.ts` and
[API.md](API.md#optimistic-mutations-d1).

## Document-shell client providers (the client boundary)

The document shell — [`app/[locale]/layout.tsx`](../../apps/web/src/app/[locale]/layout.tsx)
(the root `app/layout.tsx` is a bare passthrough since i18n, see [I18N.md](I18N.md)) —
wraps `children` in **four** client providers — `ThemeProvider` (`next-themes`, Step 24)
outside `PostHogProvider` (analytics, Step 13) outside `TRPCReactProvider` (server-state
cache) outside `NextIntlClientProvider` (active locale + messages) — plus the `Toaster`
portal leaf (A1). All take `children` and render them straight through, so **Server
Components passed into the layout stay server-rendered** — a client component rendering a
`children` prop does not pull that subtree into the client bundle. Adding a provider here
therefore does **not** widen the RSC boundary; it just makes a context available (the
build still prerenders `/` and the static demos). `PostHogProvider`
([`components/observability/posthog-provider.tsx`](../../apps/web/src/components/observability/posthog-provider.tsx))
is additionally a no-op passthrough when `NEXT_PUBLIC_POSTHOG_KEY` is unset (it returns
`children` without mounting the provider at all). Zustand, by contrast, needs **no**
provider — its stores are plain hooks.

## Zustand (client state)

### Conventions

- **One store per file** under [`apps/web/src/stores/`](../../apps/web/src/stores/),
  kebab-case filename: `ui-store.ts`, `wizard-store.ts`.
- Export a hook named **`use<Name>Store`** (CONVENTIONS.md naming table), e.g.
  `useUiStore`. Named export only.
- Keep stores **small and domain-scoped**. Prefer several focused stores over one
  god-store; there's no provider, so a new store is just a new file.
- Co-locate actions **inside** the store (the `set`-closure pattern below), so state
  and its transitions live together. Components call actions; they don't `set` raw.

### The store pattern

See [`apps/web/src/stores/ui-store.ts`](../../apps/web/src/stores/ui-store.ts) for the
canonical example (the real file additionally wraps `persist` — see the middleware
decision below). The minimal shape:

```ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  devtools(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen }), undefined, "ui/toggleSidebar"),
      setSidebarOpen: (open) => set({ sidebarOpen: open }, undefined, "ui/setSidebarOpen"),
    }),
    { name: "ui-store", enabled: process.env.NODE_ENV === "development" },
  ),
);
```

Notes:

- **`create<UiState>()(...)` is curried on purpose.** The empty `()` after the type
  argument is required for middleware to infer the state type under `strict`. Without
  it the types collapse — this is a Zustand + TypeScript quirk, not a style choice.
- **Select narrowly in components:** `const open = useUiStore((s) => s.sidebarOpen)`.
  A selector subscribes the component to *only* that slice, so unrelated state changes
  don't re-render it. Pull actions the same way: `useUiStore((s) => s.toggleSidebar)`.
  Avoid `const store = useUiStore()` with no selector — it re-renders on every change.
- Stores are usable from any `"use client"` component with no provider. They must not
  be read during render of a Server Component.

### Middleware decision

- **`devtools` — enabled, dev-only.** Wraps the store so state and actions show up in
  the Redux DevTools extension; the third `set` argument is the action label
  (`"ui/toggleSidebar"`). Gated by `enabled: process.env.NODE_ENV === "development"`
  so it's inert in production. No extra dependency — it ships inside `zustand/middleware`.

- **`persist` — wired to `ui-store` as the shipped example (2026-07-16,
  hydration-safe).** Persisting a store to `localStorage` reintroduces an **SSR
  hydration mismatch** risk: the server renders with the store's initial state, but
  a naively-rehydrated client would render the persisted value, so the first client
  render can disagree with the server HTML. The scaffold ships the safe shape in
  [`ui-store.ts`](../../apps/web/src/stores/ui-store.ts) — `persist` wrapped
  **inside** `devtools`:

  ```ts
  persist(
    (set) => ({ /* ...state + actions as above... */ }),
    {
      name: "ui-store",                                   // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarOpen: s.sidebarOpen }), // persist data, not actions
      skipHydration: true,                                 // see note
    },
  ),
  ```

  With `skipHydration: true` the server HTML and the FIRST client render both use
  the store defaults — no mismatch — and **`<StoreRehydration/>`**
  ([`components/store-rehydration.tsx`](../../apps/web/src/components/store-rehydration.tsx),
  mounted once in the `[locale]` layout) calls `persist.rehydrate()` from a
  post-paint effect to load the persisted value; add one line there per additional
  persisted store. Two subtleties the unit tests pin
  ([`ui-store.test.ts`](../../apps/web/src/stores/ui-store.test.ts)): `partialize`
  persists the **data slice only** (never actions), and in a realm with no working
  `localStorage` (SSR/prerender, storage-disabled browsers) `createJSONStorage`
  degrades gracefully but the store's **`persist` API is never attached** — which is
  why `<StoreRehydration/>` optional-chains (`persist?.rehydrate()`). The e2e proof
  is [`e2e/state.spec.ts`](../../apps/web/e2e/state.spec.ts): the preference
  survives a reload with zero hydration errors. Only persist genuine client
  preferences — **never** server data (that's still TanStack Query's job). **Opt
  out** by unwrapping `persist` in the store and deleting `<StoreRehydration/>` +
  its layout mount.

- **`immer`** is an optional Zustand peer for mutable-style `set` drafts. Not installed;
  the spread-based `set` above is enough for the scaffold. Add `immer` only if a store
  grows deeply-nested state.

### Theme — client preference, but NOT a Zustand store

The active theme (light/dark/system) is genuinely **ephemeral client/UI state** by the
table above — each tab can legitimately differ, it's never persisted to the DB. By the
default rule that would make it a Zustand store. It deliberately **isn't**: it's owned by
**`next-themes`** (Step 24, mounted as `ThemeProvider` in the root layout — see UI.md).

This is the one client preference where a purpose-built library beats a store, because a
persisted theme hits exactly the **SSR hydration-mismatch** problem the `persist` note
above describes — and `next-themes` already solves it with a **pre-paint inline script**
that sets the `.dark` class from `localStorage` before first paint (no FOUC), plus
`prefers-color-scheme` resolution for `"system"`. Reading it from a store on mount would
reintroduce a flash. So: read/set the theme with `useTheme()` from `next-themes`, not a
Zustand store. Other one-off client preferences with no SSR-flash concern (a saved sort
order, a dismissed banner) can still be a `persist`-wrapped store.

## URL as state (shareable client state)

A **third** home for state — beyond the server cache and Zustand — is the **URL**
(`searchParams`). It's the right place for any client-controlled value that should be
**shareable, bookmarkable, and survive a refresh or the Back button**: the active
pagination page, a search query, selected filters/tabs, a selected entity id. Extend
the boundary test above with a second question — **"should this be in a link I can send
someone?"** Yes → the URL owns it, not a store. Keep Zustand/`useState` for transient UI
that should *not* be shareable (sidebar open/closed, command-menu visibility, an
in-progress form).

**Prefer reading it on the server and passing it down.** The default here is an async
Server Component that awaits the `searchParams` prop — no client JS, no `useSearchParams`:

- `app/[locale]/(dashboard)/admin/page.tsx` is the worked **pagination** example:
  `searchParams: Promise<{ after?: string }>`, awaited, decoded to a keyset cursor that
  drives the query; the Older/Newest nav is plain server-rendered
  `<Link href="/admin?after=…">` — **zero client JavaScript**.
- `app/[locale]/(auth)/login/page.tsx` reads `?redirectTo` the same way, then **sanitizes it**
  through `safeRedirectPath` ([`lib/auth-redirect.ts`](../../apps/web/src/lib/auth-redirect.ts),
  the P0-2 open-redirect guard) before handing it to the client form.

Reading `searchParams` makes a route **dynamic** (rendered per request) — correct and
expected for surfaces like these.

**Opaque cursors for pagination.** `?after=` carries an encoded `(createdAt, id)` pair
via [`lib/keyset-cursor.ts`](../../apps/web/src/lib/keyset-cursor.ts) — the flat-string
form of `post.list`'s D1 cursor. Decode is **strict**: a missing or garbled cursor
returns `null` and the caller falls back to page 1, so a hand-edited URL degrades
gracefully instead of throwing.

**Writing URL state from a client component.** When the change starts in the browser (a
filter dropdown, a search box), navigate with the App Router primitives — build the next
query with `URLSearchParams`, keep the current path from `usePathname()`, and call
**`router.replace()` (not `push`)** so a stream of filter/keystroke edits doesn't stack
one Back-button entry per change; `{ scroll: false }` keeps the viewport put:

```ts
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function StatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setStatus(status: string) {
    const next = new URLSearchParams(params);
    if (status) next.set("status", status);
    else next.delete("status");
    router.replace(`${pathname}?${next}`, { scroll: false });
  }
  // ...render a control that calls setStatus
}
```

A component that calls `useSearchParams()` must render under a `<Suspense>` boundary (a
Next requirement); reading the value on the server and passing it as a prop — the
`/admin` pattern — sidesteps that entirely, which is why it's the default here. (The
snippet deliberately uses `next/navigation`'s `usePathname` — it returns the **full**
locale-prefixed path, so the literal `replace()` keeps the active locale. The i18n
`@/i18n/navigation` helpers are for locale-*switching* nav — see
[I18N.md](I18N.md#the-client-vs-server-navigation-split-the-crux).)

**No `nuqs` dependency.** Native `URLSearchParams` plus the Next primitives cover
filters/tabs/pagination without a library (the repo's minimal-dep posture). Reach for
`nuqs` only if URL-state grows enough to want typed parsers, default values, and batched
updates — a clean opt-in, not a baseline need.

## Realtime / push state — feed the query cache (Tier 4 · A22)

Server-**pushed** state (live notifications, presence, a job's progress) is a fourth
channel — the server initiates the update, so the client can't just "fetch it." The rule
here: **don't stand up a parallel store for it — push it into the same TanStack Query
cache the rest of the app already reads.** Then a live value and a fetched value are the
same value, read through one surface.

The worked example is the realtime notifications feed
([`components/notifications/notifications-feed.tsx`](../../apps/web/src/components/notifications/notifications-feed.tsx),
A22). Its initial page is the ordinary `notification.list` tRPC query (prefetched +
hydrated). Then it opens a native **`EventSource`** to `/api/notifications/stream` (SSE)
and, on each pushed event, **`queryClient.setQueryData(queryKey, …)`** prepends the row
into that query's cache — the same `setQueryData` shape the optimistic posts mutations
use ([API.md](API.md#optimistic-mutations-d1)). A toast (`sonner`, A1) fires alongside.
Practical notes carried by that component:

- **Stable key for the effect.** `queryOptions()` returns a fresh object each render, so
  memoize the `queryKey` (the input is constant) — otherwise the `EventSource` effect
  re-subscribes every render. Keep other live values (toast copy, connection status) in
  refs so the stream is opened **once on mount**, not torn down on each render.
- **Dedupe on insert.** The sender's own tab also receives its push, and a reconnect can
  redeliver — guard with an `id` check before prepending.
- **Paginating a realtime-fed cache (A25).** The feed is keyset-paginated ("Load more",
  `useInfiniteQuery`), so its cache is no longer `{ items }` but `InfiniteData` —
  `{ pages, pageParams }`. Every push/mutation `setQueryData` therefore maps over
  `pages[].items`, not a flat array: **prepend a new push into `pages[0]`**, map
  mark-all-read across **all** pages, and — the subtle one — run the dedupe check across
  **every loaded page** (a "Load more" may already hold the id a redelivered push carries).
  This is the `post-cache.ts` shape; the RSC side prefetches with `prefetchInfiniteQuery`.
  The separate `unreadCount` query (below) is unaffected — it's authoritative, not derived
  from the pages.
- **Backfill on reconnect.** A NOTIFY that lands while the `EventSource` is dropped is never
  pushed (the server doesn't replay). On a re-open — every `onopen` after the first —
  `invalidateQueries(queryKey)` refetches so the gap reconciles automatically, no reload (A23).
- **Aggregate counts are their own query, kept in lockstep.** The unread badge reads
  `notification.unreadCount` (an authoritative SQL `count()` over the whole table), *not* a
  tally of the loaded page — the page holds only the first `NOTIFICATIONS_PAGE_SIZE` rows,
  so a local count would undercount past that. Because it's a separate query it must be
  reconciled at the same moments the list is: invalidate it on each push, on the reconnect
  backfill, and on the offline-send fallback; set it to `0` on mark-all-read (A24). The
  lesson generalizes — a derived count that must be exact belongs in its own server query,
  invalidated alongside the cache it summarizes, not computed from a partial client page.
- **Degrade to the cache.** The rows are persisted (the `notifications` table), so if SSE
  is unavailable the feed still works from the query; the send action's fallback
  `invalidateQueries` refetches when the stream isn't connected. The transport + serverless
  caveats live in [API.md](API.md#realtime--server-sent-events-sse-tier-4--a22) +
  [DEPLOYMENT.md](DEPLOYMENT.md#realtime-sse--serverless-caveat-tier-4--a22).

## Where this is exercised

`/state` ([`app/[locale]/state/page.tsx`](../../apps/web/src/app/[locale]/state/page.tsx)) is a public
demo route that mounts [`UiStoreDemo`](../../apps/web/src/components/demo/ui-store-demo.tsx)
twice. Both instances read the same `useUiStore`, so toggling one updates both — the
live proof that it's global client state rather than per-component `useState`. Like the
other `/billing`/`/search`/… demos, it's scaffold to delete or replace when real features land.
