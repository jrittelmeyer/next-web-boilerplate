import { defineConfig } from "vitest/config";

// Validators are pure (zod only), so the node environment is enough — no DOM.
// Unit tests are co-located as `*.test.ts`; Playwright `*.spec.ts` files live in
// the app and are never picked up here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Coverage runs only under `--coverage` (the `test:coverage` task / CI),
    // so a plain `pnpm test` stays fast. `all: true` counts every source file,
    // not just the imported ones, so an untested file drags the % down honestly.
    // Validators are pure logic — exactly what a coverage gate should hold — so
    // the bar is the maximum: every schema ships with tests (Step 29 raised this
    // from 90 to 100, where the package already sits). A new untested schema fails
    // the gate, which is the point.
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json", "lcov"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
