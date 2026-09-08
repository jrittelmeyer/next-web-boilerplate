import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import { replaceCredentialWithOAuthAccount, seedExpiredSession } from "./support/db";

// Two /account read predicates with no importable module boundary (Server Component
// page) and no existing sensor (predicate-sensor long tail, items 6/9): the expired
// -session exclusion (`gt(sessionTable.expiresAt, now())`) and the OAuth-only
// password card (`account.providerId = "credential"`). Neither has a UI path to
// reach the fixture state it needs — Better Auth never hands the app an expired
// session, and this deploy has no configured OAuth provider to sign up through —
// so both are seeded by a direct, sanctioned out-of-band DB write (support/db.ts).
// DB-backed → e2e lane.

test("an expired session never appears in the active-sessions list", async ({ page }) => {
  const user = makeTestUser("account-expired-session");
  await signUp(page, user);
  await seedExpiredSession(user.email);

  // signUp lands on /dashboard, not /account — the expired row must never render
  // even though it exists.
  await page.goto("/account");
  const rows = page.getByRole("listitem").filter({ hasText: "signed in" });
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("Current session")).toBeVisible();
});

test("an OAuth-only account sees the social copy and no password form", async ({ page }) => {
  const user = makeTestUser("account-oauth-only");
  await signUp(page, user);
  await replaceCredentialWithOAuthAccount(user.email);

  await page.goto("/account");
  await expect(
    page.getByText("You signed in with a social provider, so there is no password to change."),
  ).toBeVisible();
  // The credential form must be gone, not merely the description swapped — the
  // regression this guards is `hasPassword` defaulting true and rendering both.
  await expect(page.getByLabel("Current password")).toHaveCount(0);
});
