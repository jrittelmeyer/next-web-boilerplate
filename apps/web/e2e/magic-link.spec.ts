import { expect, test } from "@playwright/test";
import { resetMagicLinkRateLimit } from "./support/db";
import { resetEmailCapture, waitForCapturedEmail } from "./support/email-capture";

// Magic-link sign-in E2E (path-to-100 #6). Runs ONLY in the `chromium-email` project
// against the :3001 email-capture server (see playwright.config.ts): fake Resend creds
// flip isEmailConfigured() on — registering the magicLink() plugin and the login-page
// affordance — while EMAIL_TEST_CAPTURE_DIR diverts the send to a JSON file this spec
// reads. CI-honest: no real key, no network send, the same keyless build. The
// hidden-when-unconfigured half of the gate is asserted in auth.spec.ts against the
// keyless :3000 server.

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetEmailCapture();
  // The DB-persisted send limiter (3/min, sliding) survives server restarts, so a
  // back-to-back local run — or a serial retry — would otherwise inherit the previous
  // run's count and 429 on the second send. beforeAll re-runs on retry (new worker),
  // so every attempt starts from a clean counter. CI's fresh DB never needs this.
  await resetMagicLinkRateLimit();
});

test("requesting a magic link captures the send and the link signs the user in", async ({
  page,
}) => {
  // A fresh address: with sign-up-via-link on (the plugin default we keep), the link
  // both creates the account and lands a session — the full passwordless journey.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-magic-link-${unique}@example.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();

  // The neutral sent state (same no-enumeration posture as forgot-password).
  await expect(page.getByText("Check your inbox")).toBeVisible();

  const captured = await waitForCapturedEmail(email);
  expect(captured.action).toBe("magic-link sign-in");
  expect(captured.subject).toBe("Your sign-in link");
  expect(captured.url).toBeTruthy();

  // "Click" the emailed link: /magic-link/verify consumes the single-use token and
  // redirects to the callbackURL baked in at request time (/dashboard).
  // biome-ignore lint/style/noNonNullAssertion: asserted truthy above.
  await page.goto(captured.url!);
  await page.waitForURL("**/dashboard");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});

test("a consumed magic link cannot be replayed", async ({ page, context }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-magic-replay-${unique}@example.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();

  const captured = await waitForCapturedEmail(email);
  // biome-ignore lint/style/noNonNullAssertion: waitForCapturedEmail returned a send.
  const url = captured.url!;
  await page.goto(url);
  await page.waitForURL("**/dashboard");

  // Replay from a clean session (tokens are consumed atomically — GHSA-hc7v-rggr-4hvx
  // posture in the installed better-auth): the second visit must NOT mint a session.
  // The plugin error-redirects to the callbackURL (/dashboard?error=INVALID_TOKEN),
  // and with no session cookie the proxy gate bounces that straight to /login.
  await context.clearCookies();
  await page.goto(url);
  await page.waitForURL("**/login**");
});
