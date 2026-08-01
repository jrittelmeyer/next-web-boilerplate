"use client";

import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTRPC } from "@/lib/trpc/client";
import { RsvpControl } from "./rsvp-control";

const INVITES_PAGE_SIZE = 20;

/**
 * Everything you have been invited to, soonest first.
 *
 * **This list is the only place a Phase-3 invitation is visible.** `calendar.range` scopes
 * the month grid to `calendars.user_id = me`, and widening it would mean a fourth query on
 * the hottest path in the feature, its own recurrence expansion and a share of
 * `MAX_RANGE_ROWS` — so an invitation does not appear as a chip on the invitee's grid until
 * Phase 6, which is already reworking that query for shares. It has its own route rather
 * than a panel beside the grid for a plainer reason: "Invitations: Standup" next to a month
 * that does not contain Standup reads as a bug, not as a phase boundary.
 *
 * **An error renders as an error.** `listInvites` is a `userRateLimitedProcedure` sharing
 * the 20/min calendar budget, and the month grid has already taught this repo that a
 * silently-empty list is indistinguishable from "you have no invitations" — which is the
 * one message this page must never show by accident.
 */
export function InvitesList() {
  const t = useTranslations("Calendar.invites");
  const format = useFormatter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery(
    trpc.calendar.listInvites.infiniteQueryOptions(
      { limit: INVITES_PAGE_SIZE },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  function refetch() {
    queryClient.invalidateQueries({ queryKey: trpc.calendar.listInvites.infiniteQueryKey() });
  }

  if (query.isPending) return <Skeleton className="h-64 w-full" />;

  if (query.isError) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("error")}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3" data-testid="invites-list">
        {items.map((invite) => (
          <li key={invite.id} className="flex flex-col gap-2 rounded-md border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link className="font-medium underline" href={`/calendar/event/${invite.id}`}>
                {invite.title}
              </Link>
              <span className="text-sm text-muted-foreground">
                {/* All-day rows carry no clock and their stored end is EXCLUSIVE, so
                    rendering the end for one would name the following midnight. */}
                {invite.allDay
                  ? format.dateTime(invite.startAt, "dateOnly")
                  : format.dateTime(invite.startAt, "short")}
              </span>
            </div>
            {invite.location ? (
              <p className="text-sm text-muted-foreground">{invite.location}</p>
            ) : null}
            <RsvpControl eventId={invite.id} status={invite.status} onResponded={refetch} />
          </li>
        ))}
      </ul>

      {query.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? t("loading") : t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
