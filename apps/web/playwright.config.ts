import { defineConfig, devices } from "@playwright/test";

// E2E specs live in apps/web/e2e as `*.spec.ts` (Vitest owns `*.test.*` in the
// packages). By default the webServer boots the production build on :3000;
// `pnpm test:e2e` goes through Turbo, which builds the app first (the `test:e2e`
// task dependsOn `build`). For a one-off local run, build first (or reuse a running
// dev server).
//
// Set E2E_BASE_URL to run the suite against an already-running server (a prod build
// on another port, a preview deploy) — Playwright then targets that URL and does
// NOT manage a server. The default + CI path (env unset) is unchanged.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
