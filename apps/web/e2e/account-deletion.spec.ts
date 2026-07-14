import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";

// Account deletion (P2-2), immediate flow — the only one E2E can drive: CI runs with
// email unconfigured, so `sendDeleteAccountVerification` is not registered and
// /delete-user deletes in place (the verification-gated flow needs a delivered
// email; it's live-verified instead). The freshly signed-up user has a credential
// account, so the danger zone asks for the password — which Better Auth verifies
// server-side before deleting (and which skips the session-freshness gate).
// DB-backed → e2e lane.

test("deleting the account signs out, kills the session, and frees nothing to sign into", async ({
  page,
}) => {
  const user = makeTestUser("deletion");
  await signUp(page, user);

  // Danger zone: reveal the confirm area, prove the password actually gates —
  // a wrong password must surface an error and delete nothing.
  await page.goto("/account");
  await page.getByRole("button", { name: "Delete account…" }).click();
  // (Text-anchored rather than getByRole("alert") — Next's route announcer is a
  // permanent second alert on every page, so the bare role is ambiguous.)
  await page.getByLabel("Confirm your password").fill("not-the-password");
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page.getByText("Incorrect password.")).toBeVisible();

  // Right password → immediate deletion → full navigation to /goodbye.
  await page.getByLabel("Confirm your password").fill(user.password);
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await page.waitForURL("**/goodbye");
  await expect(page.getByRole("heading", { name: "Your account has been deleted" })).toBeVisible();

  // The session is authoritatively dead: the DB-backed read returns null (and
  // clears any lingering cookies), after which the protected area re-gates.
  const probe = await page.request.get("/api/auth/get-session?disableCookieCache=true");
  expect(await probe.json()).toBeNull();
  await page.goto("/dashboard");
  await page.waitForURL("**/login**");

  // The credentials no longer exist: signing in with them must fail, not redirect.
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
