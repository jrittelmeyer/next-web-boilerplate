import { expect, test } from "@playwright/test";
import { makeTestUser, signOut, signUp } from "./support/auth";

// Passkeys / WebAuthn (Tier 4 · Band 3). One throwaway user through the whole lifecycle:
// register a passkey on /account with a virtual authenticator, rename it, sign OUT, sign
// back IN with the passkey button (no email — the discoverable credential establishes the
// session), then delete it. Chrome's CDP virtual authenticator plays the security key, so
// this runs headless in CI with no real device. Email is off in CI, so sign-up establishes
// a session immediately.
//
// The credential is resident (hasResidentKey) and lives on the browser CONTEXT, so it
// survives sign-out and answers the discoverable get() at sign-in. Deletion is the LAST
// step by design: a passkey deleted server-side can no longer authenticate, so we sign in
// first while the (single) credential is still valid, then remove it.
test.describe.configure({ mode: "serial" });

test("register, rename, sign in with, and delete a passkey", async ({ page }) => {
  const user = makeTestUser("passkey");
  await signUp(page, user);

  // Attach a virtual authenticator to the browser context (Chromium-only, via CDP). It
  // persists across sign-out, so the resident credential is still present at sign-in.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  // --- Register ----------------------------------------------------------------
  await page.goto("/account");
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Passkeys" });
  await expect(card.getByText("You haven’t added any passkeys yet.")).toBeVisible();

  await card.locator("#passkey-name").fill("E2E Passkey");
  await card.getByRole("button", { name: "Add a passkey" }).click();
  await expect(card.getByText("E2E Passkey")).toBeVisible();

  // --- Rename ------------------------------------------------------------------
  // "Save" collides with the profile Display-name card, so scope it to the rename form
  // (the only form containing the "Passkey name" input).
  await card.getByRole("button", { name: "Rename" }).click();
  const renameForm = card.locator("form", { has: page.getByLabel("Passkey name") });
  await renameForm.getByLabel("Passkey name").fill("Renamed Passkey");
  await renameForm.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Renamed Passkey")).toBeVisible();

  // --- Sign out, then sign IN with the passkey ---------------------------------
  // The button calls signIn.passkey() with no email; the resident credential answers the
  // discoverable get() and the session lands us on /dashboard.
  await signOut(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL("**/dashboard");

  // --- Delete ------------------------------------------------------------------
  await page.goto("/account");
  const cardAfter = page.locator('[data-slot="card"]').filter({ hasText: "Passkeys" });
  await cardAfter.getByRole("button", { name: "Remove" }).click();
  await expect(cardAfter.getByText("You haven’t added any passkeys yet.")).toBeVisible();
});
