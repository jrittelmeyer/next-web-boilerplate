import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Component tests render into jsdom. Vitest 4's built-in oxc transformer handles
// the automatic JSX runtime, so no @vitejs/plugin-react is needed — the
// components are plain React (no Fast Refresh / React Compiler in tests), which
// keeps the toolchain lean. The `@repo/ui` alias points the package's own
// subpath imports (e.g. `@repo/ui/lib/utils`) at the raw source.
export default defineConfig({
  resolve: {
    alias: {
      "@repo/ui": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // Coverage runs only under `--coverage` (so `pnpm test` stays fast). `all: true`
    // counts every component, including the shadcn primitives we deliberately DON'T
    // unit-test (card/form/input/label/dialog/select/avatar/theme-provider —
    // TESTING.md: "don't test trivial presentational UI"), so the bar is a regression
    // FLOOR, not a target. As the untested-primitive count grows, the aggregate % held
    // by the fixed set of smokes (button/empty-state/theme-toggle/textarea) falls: the
    // Band-4 org UI added `dialog` + `select` (317 lines of Radix wrappers), A1 then
    // added the untested `sonner` Toaster wrapper, and A14 the untested `skeleton`
    // primitive, pulling the aggregate to ~13.1% lines / 29.7% branches / 12.3% funcs. The
    // floor (11/10/27/11) sits a couple points under that (as Step 29 last re-based) so it
    // still trips on a real regression in the tested components without breaking each time a
    // new untested primitive lands — `skeleton` (6 lines, 0 branches, 1 func) was small
    // enough to be absorbed with no re-base.
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      // Stories are dev-only gallery scaffolding (D6), not unit-testable source —
      // exclude them like .test files so they don't drag the coverage floor down.
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.stories.tsx", "src/test/**"],
      reporter: ["text", "json", "lcov"],
      thresholds: { lines: 11, functions: 10, branches: 27, statements: 11 },
    },
  },
});
