import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

// Ephemeral, client-only UI state — NEVER server/async data. Anything that
// comes from the database or an API belongs in TanStack Query (server cache),
// not here. See docs/context/STATE.md for the read-model boundary and the
// hydration-safe persist pattern this store demonstrates.
interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

// `create<UiState>()(...)` — the curried call is required so middleware infers
// the state type under `strict`. The 3rd `set` arg is the devtools action label.
//
// `persist` (STATE.md → Middleware decision) keeps `sidebarOpen` across reloads,
// hydration-safely: `skipHydration: true` means the server HTML and the FIRST
// client render both use the defaults (no mismatch); `<StoreRehydration/>` in the
// [locale] layout then loads the persisted value after first paint. `partialize`
// persists the data slice only — never actions. `createJSONStorage` no-ops where
// `localStorage` doesn't exist (SSR/prerender), so importing this module on the
// server stays safe. Only persist genuine client preferences — server data is
// TanStack Query's job. To opt out, unwrap `persist` and drop <StoreRehydration/>.
export const useUiStore = create<UiState>()(
  devtools(
    persist(
      (set) => ({
        sidebarOpen: true,
        toggleSidebar: () =>
          set((state) => ({ sidebarOpen: !state.sidebarOpen }), undefined, "ui/toggleSidebar"),
        setSidebarOpen: (open) => set({ sidebarOpen: open }, undefined, "ui/setSidebarOpen"),
      }),
      {
        name: "ui-store", // localStorage key
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({ sidebarOpen: s.sidebarOpen }),
        skipHydration: true, // rehydrated post-paint by <StoreRehydration/>
      },
    ),
    { name: "ui-store", enabled: process.env.NODE_ENV === "development" },
  ),
);
