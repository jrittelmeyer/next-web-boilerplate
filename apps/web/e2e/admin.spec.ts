import { expect, test } from "@playwright/test";
import { makeTestUser, signOut, signUp } from "./support/auth";
import { promoteToAdmin } from "./support/db";

// DB-backed RBAC E2E for the /admin surface (D2) — the admin user list + the
// `setUserRole` write path, through the real UI. Needs Postgres (the DB-backed E2E
// lane — every PR + push to main).
//
// Bootstrapping: there is no seed/UI admin (promotion is never self-service), so we
// sign up two users through the UI, then promote one via a direct DB write — the
// sanctioned out-of-band path. requireAdmin reads the role FRESH from the DB on each
// request, so the promoted user sees /admin without re-logging-in.

test("an admin promotes another user, but cannot change their own role", async ({ page }) => {
  // test.slow() triples the budget: the bootstrap signs up two users + signs out, and
  // those auth round-trips can be slow under load. The role flips themselves are
  // optimistic (RoleControl), so they assert instantly.
  test.slow();

  const target = makeTestUser("admin-target");
  const adminUser = makeTestUser("admin-actor");

  // Create the target first, then sign out so the admin can sign up cleanly (the
  // proxy bounces an authenticated user away from /signup).
  await signUp(page, target);
  await signOut(page);

  // Create the admin-to-be (now the live session), then promote them out-of-band.
  await signUp(page, adminUser);
  await promoteToAdmin(adminUser.email);

  // The Admin nav link appears only for admins (fresh DB role read in the shell).
  await page.goto("/dashboard");
  const adminLink = page.getByRole("link", { name: "Admin" });
  await expect(adminLink).toBeVisible();
  await adminLink.click();
  await page.waitForURL("**/admin");

  // The caller's own row can't be changed — it shows "(you)", not a role button.
  const ownRow = page.getByRole("listitem").filter({ hasText: adminUser.email });
  await expect(ownRow.getByText("(you)")).toBeVisible();

  // The target starts as a plain user: promote them. The optimistic button label
  // flips Make admin -> Make user immediately on click (the Server Action +
  // revalidatePath reconcile in the background), proving the write path end-to-end.
  const targetRow = page.getByRole("listitem").filter({ hasText: target.email });
  await targetRow.getByRole("button", { name: "Make admin" }).click();
  await expect(targetRow.getByRole("button", { name: "Make user" })).toBeVisible();

  // And demote them back, to exercise the reverse transition.
  await targetRow.getByRole("button", { name: "Make user" }).click();
  await expect(targetRow.getByRole("button", { name: "Make admin" })).toBeVisible();
});

test("a non-admin user gets a 404 at /admin and never sees the Admin link", async ({ page }) => {
  const plainUser = makeTestUser("admin-denied");
  await signUp(page, plainUser);

  // No Admin link in the shell for a plain user.
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  // The page itself 404s (requireAdmin -> notFound), so the area's existence isn't
  // revealed even though the cookie-only proxy gate lets the request through. The
  // app's not-found UI renders ("Page not found") and the admin content never does.
  await page.goto("/admin");
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.getByText("Admin area")).toHaveCount(0);
});
