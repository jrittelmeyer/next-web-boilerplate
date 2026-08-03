import { expect, type Page, type Response, test } from "@playwright/test";

export type TestUser = { name: string; email: string; password: string };

/**
 * A fresh, unique throwaway user. The email is namespaced + timestamped so repeated
 * local runs never collide (the row is harmless test data; the CI database is
 * ephemeral). Password clears Better Auth's 8-char minimum.
 */
export function makeTestUser(prefix: string): TestUser {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: "E2E User",
    email: `e2e-${prefix}-${unique}@example.com`,
    password: "e2e-password-12345",
  };
}

/**
 * Fill and submit an auth form, waiting for the form to become interactive first and for
 * the API call to actually answer.
 *
 * ⚠️ This shape is the fix for the long-standing "signup flake", diagnosed 2026-08-03.
 * `page.goto` resolves on `load`, which fires BEFORE React hydrates, and Playwright's
 * actionability checks do not wait for hydration — the server-rendered form is fillable
 * and clickable while its submit handler is not yet attached. A click that lands in that
 * window submits *nothing*: no request, no session, and the caller's
 * `waitForURL("**\/dashboard")` then hangs for the full test timeout with no error on the
 * page and no server-side trace. Reproduced 8/8 under 6x CPU throttling; the CI evidence
 * agrees — hung attempts left no signup line in the server log, i.e. the account was never
 * created. A slow, loaded CI runner widens that window, which is why it looked like
 * "timing, not a code bug".
 *
 * Awaiting the response (rather than only the URL) is the second half: `/sign-up/email` is
 * rate-limited to 5/60s, so a 429 — or any 5xx — otherwise degrades into the same silent
 * hang. Asserting the status here makes it fail by name.
 */
async function settleThenSubmit(
  page: Page,
  endpoint: string,
  buttonName: string,
  fill: () => Promise<void>,
): Promise<void> {
  await page.waitForLoadState("networkidle");
  await fill();
  const submit = async (): Promise<Response> => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(endpoint)),
      page.getByRole("button", { name: buttonName, exact: true }).click(),
    ]);
    return response;
  };

  let response = await submit();

  // The auth endpoints are 5 per 60s (`packages/auth/src/auth.ts` → rateLimit.customRules),
  // and a dense stretch of signup-heavy specs genuinely reaches that — measured at 7
  // signups in ~15s across three spec files. Asserting straight through would convert a
  // throughput limit into a red lane, and because this helper now fails FAST, Playwright's
  // retries would land inside the very same window. Waiting out the window in place is
  // what actually clears it; every other status still fails immediately, by name.
  if (response.status() === 429) {
    const retryAfter = Number(response.headers()["retry-after"] ?? 60);
    // An absolute value, not `test.info().timeout + …`: this helper is also called from
    // `beforeAll` (organization.spec.ts), where `test.info()` is not available and would
    // throw — turning a recoverable wait into a confusing hook failure. 120 s clears both
    // the 30 s default and the 90 s a `test.slow()` spec gets.
    try {
      test.setTimeout(120_000);
    } catch {
      // Not a scope that can extend the timeout; the wait below may exceed it, and the
      // resulting failure still names the 429 rather than hanging anonymously.
    }
    await page.waitForTimeout((retryAfter + 2) * 1000);
    response = await submit();
  }

  expect(response.ok(), `${endpoint} responded ${response.status()}`).toBe(true);
}

/**
 * Sign up through the real UI (the C1 `(auth)` pages). With email unconfigured — the
 * CI default — verification is off, so a successful sign-up establishes a session and
 * the app redirects to /dashboard; we wait for that to confirm the session is live.
 */
export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto("/signup");
  await settleThenSubmit(page, "/api/auth/sign-up/email", "Create account", async () => {
    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
  });
  await page.waitForURL("**/dashboard");
}

/** Sign in an existing user through the /login form, landing on the dashboard. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await settleThenSubmit(page, "/api/auth/sign-in/email", "Sign in", async () => {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
  });
  await page.waitForURL("**/dashboard");
}

/** Sign out via the dashboard account menu, returning to /login. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await page.waitForURL("**/login**");
}
