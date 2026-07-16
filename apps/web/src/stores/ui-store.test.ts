import { afterEach, describe, expect, it, vi } from "vitest";

// The persist wiring under test resolves `localStorage` at MODULE-EVAL time
// (`createJSONStorage(() => localStorage)` runs when the store is created), so
// each test stubs the global FIRST and then dynamically imports a fresh copy of
// the store module.
function makeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

async function importFreshStore() {
  vi.resetModules();
  return (await import("./ui-store")).useUiStore;
}

describe("useUiStore persist (STATE.md hydration-safe recipe)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("persists ONLY the partialized data slice on a state change", async () => {
    const storage = makeStorage();
    vi.stubGlobal("localStorage", storage);
    const useUiStore = await importFreshStore();

    useUiStore.getState().toggleSidebar();

    const raw = storage.getItem("ui-store");
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string) as { state: Record<string, unknown> };
    // Data only — actions (toggleSidebar/setSidebarOpen) never reach storage.
    expect(persisted.state).toEqual({ sidebarOpen: false });
  });

  it("setSidebarOpen writes through to storage too", async () => {
    const storage = makeStorage();
    vi.stubGlobal("localStorage", storage);
    const useUiStore = await importFreshStore();

    useUiStore.getState().setSidebarOpen(false);

    const persisted = JSON.parse(storage.getItem("ui-store") as string) as {
      state: { sidebarOpen: boolean };
    };
    expect(persisted.state.sidebarOpen).toBe(false);
  });

  it("skipHydration: the first render sees the DEFAULT; rehydrate() restores the persisted value", async () => {
    const storage = makeStorage({
      "ui-store": JSON.stringify({ state: { sidebarOpen: false }, version: 0 }),
    });
    vi.stubGlobal("localStorage", storage);
    const useUiStore = await importFreshStore();

    // Pre-rehydrate — what the server HTML and the first client paint render.
    // Storage says "closed", but the store MUST still say the default ("open"),
    // or the first client render would disagree with the server HTML.
    expect(useUiStore.getState().sidebarOpen).toBe(true);

    await useUiStore.persist.rehydrate();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it("degrades gracefully where localStorage is unavailable: no persist API, state still works", async () => {
    // No stub — the vitest `node` env has no localStorage, mirroring SSR/prerender
    // (and storage-disabled browsers). createJSONStorage catches the ReferenceError
    // and zustand's persist middleware then never attaches `store.persist` — the
    // reason <StoreRehydration/> optional-chains.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const useUiStore = await importFreshStore();

    expect(useUiStore).not.toHaveProperty("persist");

    // State changes still work; zustand warns that nothing is persisted.
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("storage is currently unavailable"));
  });
});
