import type { CalendarColor } from "@repo/validators/calendar";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";

/**
 * View types for the calendar UI, inferred from the router rather than restated —
 * the `post-cache.ts` / `notifications-feed.tsx` convention. A column added to
 * `calendar.range` widens these for free; a column removed breaks the components
 * that read it, at build time.
 */
type RouterOutput = inferRouterOutputs<AppRouter>;

export type CalendarSummary = RouterOutput["calendar"]["list"][number];
export type CalendarEventSummary = RouterOutput["calendar"]["range"]["items"][number];

/**
 * A row prepared for the grid.
 *
 * The two millisecond fields exist because `@repo/calendar` speaks epoch ms and
 * never `Date` (`packages/calendar/AGENTS.md`), while superjson hands the wire's
 * `timestamptz` back as a `Date`. Converting once, here, is what keeps the geometry
 * in `lib/calendar/grid.ts` free of `Date` entirely.
 *
 * `resolvedColor` is the event's own colour or, when it has none, the calendar's —
 * resolved once so a chip never has to know which calendar it came from.
 */
export interface CalendarEventView extends CalendarEventSummary {
  readonly startAtMs: number;
  readonly endAtMs: number;
  readonly resolvedColor: CalendarColor;
}

export function toEventView(
  event: CalendarEventSummary,
  calendarColor: CalendarColor,
): CalendarEventView {
  return {
    ...event,
    startAtMs: event.startAt.getTime(),
    endAtMs: event.endAt.getTime(),
    resolvedColor: (event.color as CalendarColor | null) ?? calendarColor,
  };
}
