import { expect, test } from "@playwright/test";

// A DB-free smoke test against the public landing page — enough to prove the
// app builds, boots, and serves shadcn/ui components end-to-end. Add DB-touching
// flows (sign up / sign in against the Postgres service) once an auth UI lands;
// those belong in the push-to-main E2E lane, not this scaffold smoke.
test("home page renders the boilerplate landing", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "next-web-boilerplate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Primary" })).toBeVisible();
});
