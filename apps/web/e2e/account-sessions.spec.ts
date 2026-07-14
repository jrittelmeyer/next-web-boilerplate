import { expect, test } from "@playwright/test";
import { makeTestUser, signIn, signUp } from "./support/auth";

// Active-sessions list + revoke (P2-1), driven across TWO browser contexts — two
// real signed-in devices for the same user. Revocation deletes the session row at
// once, but the revoked context's 5-min cookie cache would keep rendering protected
// pages; `get-session?disableCookieCache=true` is the authoritative probe — it hits
// the DB, returns null, AND clears the session cookies, so the next navigation
// re-gates. (That is also exactly how a real revoked device converges: its next
// cache-miss read finds no row and drops the cookies.) DB-backed → e2e lane.

test("revoking a session from another device signs that device out", async ({ browser }) => {
  const user = makeTestUser("sessions");

  // Device A signs up (first session), device B signs in (second session).
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signUp(pageA, user);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, user);

  // A's /account lists both sessions; A's own row is badged and has no Revoke button.
  await pageA.goto("/account");
  const rows = pageA.getByRole("listitem").filter({ hasText: "signed in" });
  await expect(rows).toHaveCount(2);
  await expect(pageA.getByText("Current session")).toBeVisible();
  await expect(pageA.getByRole("button", { name: "Revoke" })).toHaveCount(1);

  // A revokes B; the server-rendered list refreshes down to one row.
  await pageA.getByRole("button", { name: "Revoke" }).click();
  await expect(rows).toHaveCount(1);
  await expect(pageA.getByRole("button", { name: "Revoke" })).toHaveCount(0);

  // B is authoritatively signed out: the DB-backed session read returns null (and
  // clears B's cookies), after which the protected area re-gates immediately.
  const probe = await contextB.request.get("/api/auth/get-session?disableCookieCache=true");
  expect(await probe.json()).toBeNull();
  await pageB.goto("/dashboard");
  await pageB.waitForURL("**/login**");

  // A is untouched — still signed in.
  await pageA.goto("/dashboard");
  await expect(pageA.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test("'Sign out all other sessions' revokes every non-current session", async ({ browser }) => {
  const user = makeTestUser("sessions-all");

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signUp(pageA, user);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, user);

  await pageA.goto("/account");
  await expect(pageA.getByRole("listitem").filter({ hasText: "signed in" })).toHaveCount(2);
  await pageA.getByRole("button", { name: "Sign out all other sessions" }).click();

  // The button only renders while other sessions exist, so it disappears with them.
  await expect(pageA.getByRole("button", { name: "Sign out all other sessions" })).toHaveCount(0);
  await expect(pageA.getByRole("listitem").filter({ hasText: "signed in" })).toHaveCount(1);

  const probe = await contextB.request.get("/api/auth/get-session?disableCookieCache=true");
  expect(await probe.json()).toBeNull();
  await pageB.goto("/dashboard");
  await pageB.waitForURL("**/login**");

  await contextA.close();
  await contextB.close();
});
