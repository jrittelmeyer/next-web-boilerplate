import { cn } from "@repo/ui/lib/utils";
import type * as React from "react";

interface EmptyStateProps extends React.ComponentProps<"div"> {
  // Optional leading visual (e.g. a Lucide icon). Kept as a ReactNode so this
  // primitive carries no icon-library dependency of its own.
  icon?: React.ReactNode;
  title: string;
  description?: string;
  // Trailing call(s) to action — e.g. a "Try again" Button or a "Go home" link.
  action?: React.ReactNode;
}

// Shared centered status panel for error boundaries, 404 pages, and "no data"
// empty states. Presentational only (no providers/hooks), so it renders safely
// from global-error.tsx — which mounts outside the app's provider tree.
function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div data-slot="empty-state-icon" className="text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

export { EmptyState };
