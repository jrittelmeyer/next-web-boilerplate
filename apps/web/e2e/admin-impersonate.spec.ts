import { expect, test } from "@playwright/test";
import { makeTestUser, signIn, signOut, signUp } from "./support/auth";
import { promoteToAdmin } from "./support/db";

// Admin plugin — impersonation E2E (Tier 4 · Band 4), through the real /admin UI. An admin
// starts impersonating a target user (a session-cookie swap via the impersonateUser Server
// Action); the app then acts AS the target and shows the app-wide banner, and "Stop
// impersonating" swaps back to the admin. Needs Postgres (DB-backed e2e lane).
//
// Unlike admin-ban.spec.ts, the admin must RE-SIGN-IN after promoteToAdmin: impersonation
// goes through the plugin endpoint, which authorizes off the cookie-cached SESSION role, so a
// just-promoted admin whose session still says role:"user" would be refused. Ban didn't need
// this because it's a fresh-gated DIRECT DB write. This is the documented ≤5-min window.

test("an admin impersonates a user, the app acts as them, then stops impersonating", async ({
  browser,
}) => {
  // Two auth bootstraps (one with a re-sign-in) + a full navigation → give it room.
  test.slow();

  const target = makeTestUser("impersonate-target");
  const adminUser = makeTestUser("impersonate-actor");

  // The target only needs to EXIST as a user to impersonate — create it in a throwaway
  // context and discard (impersonation swaps the ADMIN's own session, so no live target
  // context is needed, unlike the ban spec's revocation proof).
  const targetCtx = await browser.newContext();
  const targetPage = await targetCtx.newPage();
  await signUp(targetPage, target);
  await targetCtx.close();

  // The admin signs up, is promoted out-of-band, then RE-SIGNS-IN so its session role is a
  // fresh "admin" (the impersonate endpoint reads the session role, not the DB).
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await signUp(adminPage, adminUser);
  await promoteToAdmin(adminUser.email);
  await signOut(adminPage);
  await signIn(adminPage, adminUser);

  // Impersonate the target from the /admin list. On success the control full-navigates to
  // /dashboard under the swapped session.
  await adminPage.goto("/admin");
  const targetRow = adminPage.getByRole("listitem").filter({ hasText: target.email });
  await targetRow.getByRole("button", { name: "Impersonate" }).click();
  await adminPage.waitForURL("**/dashboard");

  // The app-wide banner names who we're now acting as (the target). Filter the status
  // region by the unique button text so a stray toast can't match.
  const banner = adminPage.getByRole("status").filter({ hasText: "Stop impersonating" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(target.email);

  // Authoritative proof of the swap: the session read (cache-bypassed) is now the target,
  // with impersonatedBy set to the acting admin.
  const impersonated = await adminCtx.request
    .get("/api/auth/get-session?disableCookieCache=true")
    .then((r) => r.json());
  expect(impersonated.user.email).toBe(target.email);
  expect(impersonated.session.impersonatedBy).toBeTruthy();

  // Stop impersonating → swap back to the admin and full-nav to /admin, where the admin card
  // renders again and the banner is gone.
  await banner.getByRole("button", { name: "Stop impersonating" }).click();
  await adminPage.waitForURL("**/admin");
  await expect(adminPage.getByText("Admin area")).toBeVisible();
  await expect(adminPage.getByRole("status").filter({ hasText: "Stop impersonating" })).toHaveCount(
    0,
  );

  // The restored session is the admin again, no longer an impersonation.
  const restored = await adminCtx.request
    .get("/api/auth/get-session?disableCookieCache=true")
    .then((r) => r.json());
  expect(restored.user.email).toBe(adminUser.email);
  expect(restored.session.impersonatedBy ?? null).toBeNull();

  await adminCtx.close();
});
