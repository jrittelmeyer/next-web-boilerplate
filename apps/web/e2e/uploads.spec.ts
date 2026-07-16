import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";

// Keyless-honest e2e for the /uploads demo (path-to-100 #4a — previously the only
// integration with zero e2e coverage). CI runs WITHOUT UPLOADTHING_TOKEN, so this
// spec pins the graceful-degradation surface: the page renders for everyone, the
// UploadButton mounts and settles (its route-metadata GET works keylessly), and
// the signed-in P2-3 read path renders its empty state. The with-token upload →
// server callback → `uploads` row path can't run keylessly — that's the
// live-verified prod-callback runbook (SERVICES.md → Uploadthing · VERIFICATION.md).
//
// Selector notes: `data-ut-element` is Uploadthing's own stable styling hook, and
// the button label must settle past its initial "Loading..." state before it means
// anything (both from the earlier scratchpad live-verify of this surface).

test("logged out: the upload demo renders; no personal uploads list", async ({ page }) => {
  await page.goto("/uploads");

  await expect(page.getByText("Upload demo")).toBeVisible();
  const utButton = page.locator('[data-ut-element="button"]');
  await expect(utButton).toBeVisible();
  await expect(utButton).not.toContainText(/loading/i, { timeout: 15000 });

  // The "Your uploads" card (P2-3 read path) is signed-in only.
  await expect(page.getByText("Your uploads")).toHaveCount(0);
});

test("signed in: the uploads list renders its empty state", async ({ page }) => {
  await signUp(page, makeTestUser("uploads"));
  await page.goto("/uploads");

  await expect(page.getByText("Your uploads")).toBeVisible();
  await expect(page.getByText(/No uploads yet/)).toBeVisible();
  // The upload surface is present for the signed-in user too.
  await expect(page.locator('[data-ut-element="button"]')).toBeVisible();
});
