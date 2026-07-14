"use client";

import { Button } from "@repo/ui/components/button";
import { useUiStore } from "@/stores/ui-store";

// Scaffold/example: a Client Component reading ephemeral UI state from the
// shared Zustand store via a selector. Mounted twice on /state to prove the
// store is global — toggling one instance updates both. Not app logic; delete
// or replace when building real features.
export function UiStoreDemo({ label }: { label: string }) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-muted-foreground" role="status">
        Sidebar is{" "}
        <span className="font-semibold text-foreground">{sidebarOpen ? "open" : "closed"}</span>.
      </p>
      <Button onClick={toggleSidebar} variant="outline" size="sm">
        Toggle sidebar
      </Button>
    </div>
  );
}
