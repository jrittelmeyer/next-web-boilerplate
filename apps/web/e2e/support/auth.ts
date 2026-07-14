import type { Page } from "@playwright/test";

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
 * Sign up through the real UI (the C1 `(auth)` pages). With email unconfigured — the
 * CI default — verification is off, so a successful sign-up establishes a session and
 * the app redirects to /dashboard; we wait for that to confirm the session is live.
 */
export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}

/** Sign in an existing user through the /login form, landing on the dashboard. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
}

/** Sign out via the dashboard account menu, returning to /login. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await page.waitForURL("**/login**");
}
