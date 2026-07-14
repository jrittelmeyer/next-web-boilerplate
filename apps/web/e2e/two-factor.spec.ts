import { expect, test } from "@playwright/test";
import { makeTestUser, signOut, signUp } from "./support/auth";
import { generateTotp, secretFromOtpauthUri } from "./support/totp";

// Two-factor auth (Tier 4 · Band 2). Serial, one throwaway user through the whole
// lifecycle. The test plays the authenticator app itself (support/totp.ts) so it can
// answer the enrollment challenge with no real device. Email is off in CI, so sign-up
// establishes a session immediately.
//
// The 2FA UI is inline (no modal), and its "Confirm your password" label collides with
// other /account cards, so every interaction is scoped to the 2FA card element
// (`[data-slot="card"]` filtered by its heading text).
//
// Step 2 scope (this file): the /account card — enroll (password -> QR/secret ->
// verify) -> regenerate backup codes -> disable. The SIGN-IN challenge leg (sign out,
// sign back in, answer the code) is appended in step 3 once the login form handles it.
test.describe.configure({ mode: "serial" });

test("enroll, regenerate backup codes, and disable 2FA from /account", async ({ page }) => {
  const user = makeTestUser("2fa");
  await signUp(page, user);

  await page.goto("/account");
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Two-factor authentication" });
  const enableButton = card.getByRole("button", { name: "Enable two-factor authentication" });
  await expect(enableButton).toBeVisible();

  // --- Enroll ------------------------------------------------------------------
  await enableButton.click();
  // Stage 1: confirm password.
  await card.getByLabel("Confirm your password").fill(user.password);
  await card.getByRole("button", { name: "Continue" }).click();

  // Stage 2: read the manual secret the card shows, compute a live code, submit it.
  const manualKey = (await card.locator("code").innerText()).trim();
  const code = generateTotp(secretFromOtpauthUri(`otpauth://totp/x?secret=${manualKey}`));
  await card.getByLabel("Verification code").fill(code);
  await card.getByRole("button", { name: "Verify and enable" }).click();

  // The card flips to the enabled state.
  await expect(card.getByText("Enabled.")).toBeVisible();

  // --- Regenerate backup codes -------------------------------------------------
  await card.getByRole("button", { name: "Regenerate backup codes" }).click();
  await card.getByLabel("Confirm your password").fill(user.password);
  await card.getByRole("button", { name: "Generate new codes" }).click();
  await expect(card.getByRole("button", { name: "Copy codes" })).toBeVisible();
  await card.getByRole("button", { name: "Done" }).click();

  // --- Disable -----------------------------------------------------------------
  await card.getByRole("button", { name: "Disable" }).click();
  await card.getByLabel("Confirm your password").fill(user.password);
  await card.getByRole("button", { name: "Disable" }).click();

  // Back to the disabled state — the enroll entry point returns.
  await expect(enableButton).toBeVisible();
});

test("challenges for a code at sign-in, then accepts a backup code", async ({ page }) => {
  const user = makeTestUser("2fa-signin");
  await signUp(page, user);

  // --- Enroll and LEAVE 2FA on -------------------------------------------------
  // Capture the secret AND one backup code off the enroll screen — the second half of
  // the test replays both against the sign-in challenge.
  await page.goto("/account");
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Two-factor authentication" });
  await card.getByRole("button", { name: "Enable two-factor authentication" }).click();
  await card.getByLabel("Confirm your password").fill(user.password);
  await card.getByRole("button", { name: "Continue" }).click();

  const manualKey = (await card.locator("code").innerText()).trim();
  const secret = secretFromOtpauthUri(`otpauth://totp/x?secret=${manualKey}`);
  // Backup codes are shown once, during enroll; grab one now (single-use, still unused).
  const backupCode = (await card.locator("ul li").first().innerText()).trim();

  await card.getByLabel("Verification code").fill(generateTotp(secret));
  await card.getByRole("button", { name: "Verify and enable" }).click();
  await expect(card.getByText("Enabled.")).toBeVisible();

  // --- Sign-in challenge: TOTP -------------------------------------------------
  // Sign out, then sign in with email+password. With 2FA on, the credentials step no
  // longer lands on /dashboard — the login form reveals the code step inline (so the
  // support signIn() helper, which waits for /dashboard, can't drive this).
  await signOut(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByLabel("Verification code")).toBeVisible();
  await page.getByLabel("Verification code").fill(generateTotp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL("**/dashboard");

  // --- Sign-in challenge: backup-code fallback ---------------------------------
  // We didn't trust this device, so the next sign-in challenges again. This time answer
  // with the backup code via the fallback link.
  await signOut(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.getByRole("button", { name: "Use a backup code instead" }).click();
  await page.getByLabel("Backup code").fill(backupCode);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL("**/dashboard");
});
