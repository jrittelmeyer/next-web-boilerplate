import { defineConfig, devices } from "@playwright/test";
import { EMAIL_CAPTURE_DIR } from "./e2e/support/email-capture";
import { RESEND_WEBHOOK_TEST_SECRET } from "./e2e/support/resend-webhook";

// E2E specs live in apps/web/e2e as `*.spec.ts` (Vitest owns `*.test.*` in the
// packages). By default the webServer boots the production build on :3000;
// `pnpm test:e2e` goes through Turbo, which builds the app first (the `test:e2e`
// task dependsOn `build`). For a one-off local run, build first (or reuse a running
// dev server).
//
// Set E2E_BASE_URL to run the suite against an already-running server (a prod build
// on another port, a preview deploy) — Playwright then targets that URL and does
// NOT manage a server. The default + CI path (env unset) is unchanged. In this mode
// the `chromium-email` project is dropped entirely: an external server has no
// email-capture directory for the magic-link spec to read.
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/magic-link.spec.ts", "**/email-suppression.spec.ts"],
    },
    // Magic link (path-to-100 #6) + email suppression (#8): these specs run ONLY
    // against the second, email-capturing server below — the main suite's :3000
    // server stays keyless (email unconfigured), which is itself load-bearing:
    // auth.spec.ts asserts the affordance is HIDDEN there, and signup must keep
    // yielding an immediate session.
    ...(process.env.E2E_BASE_URL
      ? []
      : [
          {
            name: "chromium-email",
            use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3001" },
            testMatch: ["**/magic-link.spec.ts", "**/email-suppression.spec.ts"],
          },
        ]),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "pnpm start",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          // The email-capture server (path-to-100 #6): the SAME keyless build, second
          // instance. Fake Resend creds flip isEmailConfigured() on — registering the
          // magicLink() plugin and the login affordance — while EMAIL_TEST_CAPTURE_DIR
          // diverts every send to a JSON file (packages/email/src/send.tsx) that
          // magic-link.spec.ts reads: no network, no real key, CI-honest.
          // BETTER_AUTH_URL must match the served origin (trusted-origin check + the
          // links inside captured emails). These env entries win over the start
          // script's `dotenv -e ../../.env` (dotenv-cli never overrides already-set
          // vars), so a populated local root .env can't leak real creds in here.
          command: "pnpm start --port 3001",
          url: "http://localhost:3001",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            BETTER_AUTH_URL: "http://localhost:3001",
            RESEND_API_KEY: "re_e2e_capture_only",
            EMAIL_FROM: "E2E <e2e@example.com>",
            EMAIL_TEST_CAPTURE_DIR: EMAIL_CAPTURE_DIR,
            // Path-to-100 #8: arms /api/resend/webhook signature verification AND
            // the send helper's suppression consult on this server only; the
            // email-suppression spec self-signs event payloads against it.
            RESEND_WEBHOOK_SECRET: RESEND_WEBHOOK_TEST_SECRET,
          },
        },
      ],
});
