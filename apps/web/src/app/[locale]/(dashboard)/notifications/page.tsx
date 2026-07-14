import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NOTIFICATIONS_PAGE_SIZE } from "@/components/notifications/constants";
import { NotificationsFeed } from "@/components/notifications/notifications-feed";
import type { Locale } from "@/i18n/routing";
import { getQueryClient, HydrateClient, trpc } from "@/lib/trpc/server";

// Realtime notifications demo (Tier 4 · A22). Lives under (dashboard) so it's auth-gated
// by the layout (the SSE stream + notification.list are per-user). Title only, no
// hreflang alternates — it's a signed-in, non-indexable page (like /dashboard).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("notifications") };
}

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Per-request dynamic: the prefetch does a session-scoped DB read and HydrateClient's
  // dehydrate() reads Date.now(), which cacheComponents forbids during prerender unless
  // request data is accessed first. connection() declares that dependency — keeps this
  // out of the static build (green with the DB down) and lets it stream via loading.tsx.
  await connection();

  // Prefetch the first page with the SAME limit the client feed uses, so the query keys
  // match and <HydrateClient> hydrates the feed's cache without a client refetch. The feed
  // is keyset-paginated ("Load more"), so this is prefetchInfiniteQuery (not prefetchQuery)
  // — its cache shape is { pages, pageParams }, which the client useInfiniteQuery expects.
  // New notifications after mount arrive over SSE, which the feed prepends into this cache.
  // The unread badge reads the authoritative notification.unreadCount — prefetch it too so
  // it hydrates on first paint (the feed invalidates it as the cache mutates thereafter).
  const queryClient = getQueryClient();
  void queryClient.prefetchInfiniteQuery(
    trpc.notification.list.infiniteQueryOptions(
      { limit: NOTIFICATIONS_PAGE_SIZE },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );
  void queryClient.prefetchQuery(trpc.notification.unreadCount.queryOptions());

  return (
    <HydrateClient>
      <NotificationsFeed />
    </HydrateClient>
  );
}
