import { cn } from "@repo/ui/lib/utils";
import type * as React from "react";

// Loading-placeholder primitive (Band-2 A14) — the canonical shadcn Skeleton. A plain
// pulsing box: size/shape it with utility classes (`h-4 w-40`, `size-10 rounded-full`,
// …) so a fallback can mimic the shape of the content it stands in for. Presentational
// only (no client hooks, like card.tsx); mark the WRAPPER `role="status"` when a group
// of skeletons stands in for a region (see components/posts/post-list-skeleton.tsx).
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}

export { Skeleton };
