import { create } from "zustand";
import { devtools } from "zustand/middleware";

// Ephemeral, client-only UI state — NEVER server/async data. Anything that
// comes from the database or an API belongs in TanStack Query (server cache),
// not here. See docs/context/STATE.md for the read-model boundary and the
// (intentionally not-wired) persist pattern.
interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

// `create<UiState>()(...)` — the curried call is required so middleware infers
// the state type under `strict`. The 3rd `set` arg is the devtools action label.
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
