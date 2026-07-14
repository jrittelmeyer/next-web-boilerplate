import { defineConfig, devices } from "@playwright/test";

// Visual-regression harness for @repo/ui — screenshots the Storybook gallery and diffs
// each story against a committed baseline. OPT-IN: run locally with
// `pnpm --filter @repo/ui test:visual` (and `test:visual:update` to rebase). It is NOT
// part of the default gate (`pnpm test` / the CI `verify` lane); a dormant `visual` CI
// job runs it only when the ENABLE_VISUAL repo variable is set — see ci.yml + UI.md.
//
// Baselines are PLATFORM-SPECIFIC: Playwright names them `…-<platform>.png` because font
// hinting / antialiasing differ across OSes. The committed set is for the dev platform;
// generating the Linux baselines the ubuntu CI runner needs is documented in UI.md (run
// this config via the pinned mcr.microsoft.com/playwright Docker image so they match).
const PORT = 6006;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  // A small tolerance absorbs sub-pixel antialiasing noise while still catching real
  // visual changes; `animations: "disabled"` freezes enter/exit transitions so an
  // open dialog is captured at its settled end-state, not mid-zoom.
  expect: {
    // With the determinism flags below, unchanged snapshots diff by ~0 px run-to-run,
    // so a 1% ratio is pure cushion for cross-machine micro-variance while still well
    // under a real small-component change (a button corner-radius tweak measured ~2%).
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", scale: "css" },
  },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Determinism flags: without these, subpixel/LCD text antialiasing varies a
        // few pixels between browser launches, so every text-bearing snapshot drifts
        // ~1-2% run-to-run — noise that would swamp a real small-component change.
        // These force consistent, hinting-free, GPU-independent rendering so baselines
        // reproduce and the diff threshold below can stay tight.
        launchOptions: {
          args: [
            "--force-color-profile=srgb",
            "--font-render-hinting=none",
            "--disable-lcd-text",
            "--disable-gpu",
            "--disable-skia-runtime-opts",
            "--hide-scrollbars",
          ],
        },
      },
    },
  ],
  webServer: {
    // Storybook's dev server exposes /index.json (the story index the spec reads to
    // discover ids) and /iframe.html (the isolated per-story render we screenshot).
    // `--ci` skips the browser-open + update prompts. Locally an already-running :6006
    // Storybook is reused; in CI Playwright boots one.
    command: `pnpm exec storybook dev -p ${PORT} --ci`,
    url: `http://localhost:${PORT}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
