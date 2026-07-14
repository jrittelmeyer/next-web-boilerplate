import { expect, test } from "@playwright/test";
import { makeTestUser, signIn, signUp } from "./support/auth";
import { promoteToAdmin } from "./support/db";

// Admin plugin — user ban/unban E2E (Tier 4 · Band 4), through the real /admin UI and a
// second live "victim" browser context. Ban REVOKES the target's sessions and BLOCKS
// their sign-in; unban restores it. Needs Postgres (DB-backed e2e lane).
//
// Bootstrapping mirrors admin.spec.ts: no seed/UI admin (promotion is never
// self-service), so we sign up two users and promote one via a direct DB write. The
// target keeps a live session in its own context so we can prove revocation.

test("an admin bans a user (revoking their session + blocking sign-in), then unbans them", async ({
  browser,
}) => {
  // Two auth bootstraps + cross-context navigation → give it room under load.
  test.slow();

  const target = makeTestUser("ban-target");
  const adminUser = makeTestUser("ban-actor");

  // The target signs up and stays signed in (their own context = a live "device").
  const targetCtx = await browser.newContext();
  const targetPage = await targetCtx.newPage();
  await signUp(targetPage, target);

  // The admin-to-be signs up in a separate context, then is promoted out-of-band.
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await signUp(adminPage, adminUser);
  await promoteToAdmin(adminUser.email);

  // Admin bans the target: Ban → inline reason → Confirm. The optimistic control flips
  // to a "Banned" badge + "Unban" immediately (the Server Action + revalidate reconcile
  // in the background), proving the write path end-to-end.
  await adminPage.goto("/admin");
  const targetRow = adminPage.getByRole("listitem").filter({ hasText: target.email });
  await targetRow.getByRole("button", { name: "Ban", exact: true }).click();
  await targetRow.getByLabel("Ban reason").fill("e2e ban");
  await targetRow.getByRole("button", { name: "Confirm" }).click();
  await expect(targetRow.getByText("Banned")).toBeVisible();
  await expect(targetRow.getByRole("button", { name: "Unban" })).toBeVisible();

  // The target is authoritatively signed out: once the ban lands, the DB-backed session
  // read returns null (and clears the target's cookies), after which the protected area
  // re-gates — bypassing the 5-min cookie cache the way a real revoked device converges.
  // POLL it: the optimistic badge above flips before the Server Action resolves, so a
  // single read here would race the still-in-flight ban (+ its session revoke).
  await expect
    .poll(
      async () => {
        const probe = await targetCtx.request.get("/api/auth/get-session?disableCookieCache=true");
        return probe.json();
      },
      { timeout: 20_000 },
    )
    .toBeNull();
  await targetPage.goto("/dashboard");
  await targetPage.waitForURL("**/login**");

  // And the target can't sign back in — the ban blocks it with an inline error, and the
  // page stays on /login (never reaches /dashboard).
  await targetPage.goto("/login");
  await targetPage.getByLabel("Email").fill(target.email);
  await targetPage.getByLabel("Password").fill(target.password);
  await targetPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(targetPage.getByRole("alert")).toBeVisible();
  await expect(targetPage).toHaveURL(/\/login/);

  // Admin unbans: the control flips back to "Ban".
  await targetRow.getByRole("button", { name: "Unban" }).click();
  await expect(targetRow.getByRole("button", { name: "Ban", exact: true })).toBeVisible();

  // The target can sign in again, landing on the dashboard.
  await signIn(targetPage, target);

  await targetCtx.close();
  await adminCtx.close();
});
