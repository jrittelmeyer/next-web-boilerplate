import { expect, test } from "@playwright/test";

// The /state demo persists `sidebarOpen` (STATE.md → persist, wired to ui-store
// as the shipped example). Proves the two hydration-safety properties end-to-end
// on the prod build: the preference survives a reload, and skipHydration +
// post-paint rehydration (<StoreRehydration/>) produces ZERO hydration errors on
// that reload — the exact mismatch the recipe exists to prevent.
//
// getByRole("status") is filtered by text: sonner's <Toaster/> mounts its own
// live region, so a bare role query would be ambiguous (see the locator notes in
// the session-tooling memories).
test("sidebar preference persists across reload without hydration errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto("/state");
  const sidebarStatus = page.getByRole("status").filter({ hasText: "Sidebar is" });
  await expect(sidebarStatus.first()).toContainText("open"); // the default

  await page.getByRole("button", { name: "Toggle sidebar" }).first().click();
  // Both demo components share the one store.
  await expect(sidebarStatus.first()).toContainText("closed");
  await expect(sidebarStatus.nth(1)).toContainText("closed");

  await page.reload();
  // The persisted value comes back — and because the pre-rehydration HTML said
  // "open" (the default), reaching "closed" also proves rehydrate() ran.
  await expect(sidebarStatus.first()).toContainText("closed");
  await expect(sidebarStatus.nth(1)).toContainText("closed");

  // The property the persist recipe exists for: NO hydration mismatch on the
  // reload that had a persisted value to disagree with the server HTML.
  const hydrationErrors = pageErrors.filter((e) =>
    /hydrat|did not match|text content does not match/i.test(e),
  );
  expect(hydrationErrors).toEqual([]);
});
