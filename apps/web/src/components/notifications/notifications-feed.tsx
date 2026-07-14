"use client";

import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { notificationPayloadSchema } from "@repo/validators";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";
import { markAllRead, sendTestNotification } from "@/server/actions/notification";
import type { AppRouter } from "@/server/trpc/root";
import { NOTIFICATIONS_PAGE_SIZE } from "./constants";

type RouterOutput = inferRouterOutputs<AppRouter>;
/** One page of `notification.list` — `{ items, nextCursor }`. */
type NotificationPage = RouterOutput["notification"]["list"];
type FeedItem = NotificationPage["items"][number];
/**
 * The shape `useInfiniteQuery` keeps in the cache: pages of rows plus the keyset page
 * param. The second type arg matches the cursor the tRPC infinite-query helper threads
 * through, so `setQueryData` under `infiniteQueryKey()` type-checks without a cast
 * (the post-cache.ts precedent).
 */
type NotificationListData = InfiniteData<NotificationPage, NotificationPage["nextCursor"]>;

type ConnectionStatus = "connecting" | "live" | "offline";

/**
 * The realtime notifications feed (Tier 4 · A22) — the client half of the SSE example.
 * Its INITIAL list comes from the `notification.list` tRPC query the page prefetched +
 * hydrated (so it renders from cache on first paint, no client refetch). Then it opens
 * a native `EventSource` to `/api/notifications/stream` and, on each pushed event,
 * **prepends the notification into that same TanStack Query cache** via `setQueryData`
 * + fires a toast. That's the crux of the pattern: SSE feeds the query cache, so the
 * rest of the app reads realtime data through the exact same TanStack Query surface it
 * already uses — no parallel state store. EventSource reconnects on its own after a drop,
 * but the server doesn't replay the gap, so on a RE-open we invalidate the query to
 * backfill the missed rows from the persisted table (A23); we also reflect the connection
 * state in a small badge.
 *
 * The persisted `notifications` table is the source of truth, so if SSE is unavailable
 * the feed still works: the send action's fallback invalidates the query to refetch.
 * See docs/context/API.md → Realtime and STATE.md → realtime/push state.
 */
export function NotificationsFeed() {
  const t = useTranslations("Notifications");
  // Locale-aware value formatter (A32). Renders createdAt through the negotiated
  // locale + the global timeZone from i18n/request.ts, so the SSR-hydrated markup
  // matches the client (a raw toLocaleString() drifts between server and browser
  // zone). `"short"` is the named dateTime format defined there.
  const format = useFormatter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const listInfiniteOptions = trpc.notification.list.infiniteQueryOptions(
    { limit: NOTIFICATIONS_PAGE_SIZE },
    // `nextCursor` is the (createdAt, id) keyset of the last returned row, or null at the
    // end — react-query treats null/undefined as "no more pages".
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  // Stable key for the SSE effect's deps + cache writes: infiniteQueryOptions() returns a
  // fresh object each render, so memoize the key. Pass the SAME `{ limit }` input as the
  // options so the key exact-matches the cache entry useInfiniteQuery registers — required
  // for the setQueryData writes below to land (and to keep the EventSource from re-opening
  // every render).
  const queryKey = useMemo(
    () => trpc.notification.list.infiniteQueryKey({ limit: NOTIFICATIONS_PAGE_SIZE }),
    [trpc],
  );

  const query = useInfiniteQuery(listInfiniteOptions);
  // Flatten the loaded pages into one newest-first list for rendering (the "Load more"
  // button appends older pages; the SSE push prepends onto the first page).
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  // The unread badge is the AUTHORITATIVE server count (notification.unreadCount), not a
  // tally of the loaded page: the feed holds only the first NOTIFICATIONS_PAGE_SIZE rows,
  // so a page-derived count undercounts once unread exceeds it. It's a separate query, so
  // it's kept in lockstep with the list by invalidating/updating both at every cache
  // mutation below (SSE push, reconnect backfill, mark-all-read, offline-send fallback).
  const unreadCountQuery = useQuery(trpc.notification.unreadCount.queryOptions());
  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const unreadCountQueryKey = useMemo(() => trpc.notification.unreadCount.queryKey(), [trpc]);

  // Latest values the mount-only SSE handler needs, without making them effect deps
  // (which would tear down + re-open the stream on every render).
  const toastTitleRef = useRef(t("toastTitle"));
  toastTitleRef.current = t("toastTitle");
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    // The first open lands on the SSR-hydrated cache (fresh — no backfill). A later open
    // is a reconnect after a drop: any NOTIFY in the gap was missed (the server doesn't
    // replay), so reconcile the feed against the persisted source of truth (A23). Scope
    // the flag to this EventSource (a closure, not a ref) so it resets if the effect
    // re-runs and re-opens the stream.
    let hasConnected = false;

    source.onopen = () => {
      setStatus("live");
      if (hasConnected) {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: unreadCountQueryKey });
      }
      hasConnected = true;
    };
    // EventSource reconnects automatically; surface the gap while it does.
    source.onerror = () => setStatus("offline");

    source.addEventListener("notification", (event) => {
      let raw: unknown;
      try {
        raw = JSON.parse((event as MessageEvent).data);
      } catch {
        return;
      }
      const parsed = notificationPayloadSchema.safeParse(raw);
      if (!parsed.success) return;

      const payload = parsed.data;
      const incoming: FeedItem = {
        id: payload.id,
        type: payload.type,
        body: payload.body,
        read: payload.read,
        // Re-hydrate the ISO string the wire carries back into a Date, matching the
        // Date the tRPC query puts in the cache — so the cache holds one uniform shape.
        createdAt: new Date(payload.createdAt),
      };

      queryClient.setQueryData<NotificationListData>(queryKey, (old) => {
        if (!old) return old;
        // Dedupe across ALL loaded pages: the sender's own tab also receives its NOTIFY
        // over this stream, and "Load more" may already have paged the row into the cache.
        if (old.pages.some((page) => page.items.some((n) => n.id === incoming.id))) return old;
        // Prepend onto the first (newest) page — newest-first ordering (prependPostToCache).
        const [first, ...rest] = old.pages;
        if (!first) return old;
        return { ...old, pages: [{ ...first, items: [incoming, ...first.items] }, ...rest] };
      });
      // Refetch the authoritative unread count for the badge. We invalidate rather than
      // optimistically ++ because this same NOTIFY reaches the sender's own tab, where the
      // list dedupe above no-ops it — the server count is the single source of truth.
      void queryClient.invalidateQueries({ queryKey: unreadCountQueryKey });
      toast(toastTitleRef.current, { description: incoming.body });
    });

    return () => source.close();
  }, [queryClient, queryKey, unreadCountQueryKey]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const result = await sendTestNotification();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    // The live update arrives over SSE (even in the sender's own tab). Only when the
    // stream is NOT connected do we fall back to a refetch so the send still reflects.
    onSuccess: () => {
      if (statusRef.current !== "live") {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: unreadCountQueryKey });
      }
    },
    onError: (error) => toast.error(error.message || t("sendError")),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const result = await markAllRead();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.setQueryData<NotificationListData>(queryKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((n) => ({ ...n, read: true })),
              })),
            }
          : old,
      );
      // markAllRead flipped every unread row server-side, so the authoritative count is
      // now exactly 0. Set it directly (flash-free), mirroring the optimistic list update.
      queryClient.setQueryData(unreadCountQueryKey, { count: 0 });
    },
    onError: (error) => toast.error(error.message),
  });

  const statusLabel =
    status === "live"
      ? t("statusLive")
      : status === "offline"
        ? t("statusOffline")
        : t("statusConnecting");
  const statusColor =
    status === "live" ? "bg-green-500" : status === "offline" ? "bg-red-500" : "bg-amber-500";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            // aria-live so a screen reader announces connect/disconnect transitions.
            aria-live="polite"
          >
            <span className={`size-2 rounded-full ${statusColor}`} aria-hidden="true" />
            {statusLabel}
          </span>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              {t("unread", { count: unreadCount })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending}
          >
            {sendMutation.isPending ? t("sending") : t("send")}
          </Button>
          {unreadCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              {t("markAllRead")}
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t("description")}</p>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {items.map((notification) => (
            <li
              key={notification.id}
              className="flex items-start justify-between gap-4 rounded-md border p-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    notification.read ? "bg-transparent" : "bg-primary"
                  }`}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={`text-sm ${notification.read ? "text-muted-foreground" : ""}`}>
                    {notification.body}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format.dateTime(notification.createdAt, "short")}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? t("loading") : t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
