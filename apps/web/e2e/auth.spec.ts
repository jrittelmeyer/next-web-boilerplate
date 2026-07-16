import { expect, test } from "@playwright/test";
import { makeTestUser, signIn, signOut, signUp } from "./support/auth";

// Auth-flow E2E (C1): the real UI path — sign up, sign in, sign out — driven through
// the `(auth)` pages and the `(dashboard)` shell. Email verification is OFF unless
// email is configured (graceful degradation), so sign-up yields a session at once.
// These hit the DB (session reads/writes), so they belong in the push-to-main E2E
// lane (which provisions Postgres), not the DB-free home smoke.

test("sign up through the UI lands on the dashboard, signed in", async ({ page }) => {
  const user = makeTestUser("signup");
  await signUp(page, user);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();
});

test("an existing user can sign in through the UI", async ({ page }) => {
  const user = makeTestUser("login");
  await signUp(page, user);
  await signOut(page);

  await signIn(page, user);
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();
});

test("signing out re-gates the protected area", async ({ page }) => {
  const user = makeTestUser("signout");
  await signUp(page, user);
  await signOut(page);

  // The optimistic proxy gate now bounces a visit to /dashboard back to /login.
  await page.goto("/dashboard");
  await page.waitForURL("**/login**");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("the magic-link affordance is hidden when email is unconfigured", async ({ page }) => {
  // This server (:3000) runs keyless, so isEmailConfigured() is false: the magicLink()
  // plugin isn't registered and the login page must not offer a link it can't deliver
  // (path-to-100 #6). The configured half runs in the chromium-email project against
  // the :3001 capture server (magic-link.spec.ts).
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toHaveCount(0);
});

test("a logged-out visitor is redirected from /dashboard to /login", async ({ page }) => {
  await page.goto("/dashboard");

  await page.waitForURL("**/login**");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("the session is recognized on the public /posts page", async ({ page }) => {
  const user = makeTestUser("posts");
  await signUp(page, user);

  await page.goto("/posts");

  // The /posts Server Component reads the session and greets the user by email.
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();
});
