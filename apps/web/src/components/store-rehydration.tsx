"use client";

import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";

// Rehydrates persisted Zustand stores AFTER first paint (STATE.md → persist):
// with `skipHydration: true` the server HTML and the first client render both
// use the store defaults — no hydration mismatch — and this effect then loads
// the persisted values from localStorage. Mounted once in the [locale] layout;
// add a `.persist?.rehydrate()` line per additional persisted store. Renders
// nothing.
//
// The `?.` is load-bearing: when the `localStorage` getter itself is unavailable
// (storage-disabled browsers), zustand's persist middleware never attaches the
// `persist` API to the store at all (verified in the installed v5 source), so an
// unguarded call would throw. The unit tests pin this (`stores/ui-store.test.ts`).
export function StoreRehydration() {
  useEffect(() => {
    void useUiStore.persist?.rehydrate();
  }, []);
  return null;
}
