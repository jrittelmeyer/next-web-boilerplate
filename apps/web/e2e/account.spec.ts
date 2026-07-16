import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { makeTestUser, signIn, signOut, signUp } from "./support/auth";

// Account-settings lifecycle E2E (P3-1): the M3 /account surface — name change,
// immediate email change (the email-unconfigured path, CI's default), and password
// change + re-login. ONE user drives the whole file serially: a single sign-up keeps
// the run inside Better Auth's 5-per-60s sign-up limiter, and later tests build on
// earlier ones (the re-login uses the changed email AND the changed password).
// DB-backed → e2e lane.
//
// Two staleness traps shape the assertions:
// - The Step-19 cookie cache (5 min) means a plain reload can legitimately re-render
//   STALE session data — `updateUserName` writes the user table directly, so the
//   cached cookie never hears about it. The authoritative check is
//   `get-session?disableCookieCache=true` (the P2-1 probe): it reads the DB and
//   re-issues the cookie cache, after which a reload shows the fresh values.
// - UI outcomes now surface as toasts (A1); assertions anchor on the toast copy (or
//   sonner's data-type for the Better-Auth-worded error), never on `router.refresh()`
//   committing (the Next 16.2.9 race — see AUTH.md).

test.describe.configure({ mode: "serial" });

const user = makeTestUser("account");
const changedEmail = makeTestUser("account-changed").email;
const newName = "Renamed E2E User";
const newPassword = "e2e-new-password-67890";

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  await signUp(page, user);
});

test.afterAll(async () => {
  await context?.close();
});

test("changing the display name saves and persists", async () => {
  await page.goto("/account");
  await page.getByLabel("Display name").fill(newName);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved — your name is now")).toBeVisible();

  // Authoritative: the DB-backed session read carries the new name (and refreshes
  // the cookie cache), so the server-rendered form shows it after a reload.
  const probe = await page.request.get("/api/auth/get-session?disableCookieCache=true");
  const fresh = (await probe.json()) as { user: { name: string } } | null;
  expect(fresh?.user.name).toBe(newName);

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue(newName);
});

test("an email change applies immediately while the address is unverified", async () => {
  await page.goto("/account");
  await page.getByLabel("New email").fill(changedEmail);
  await page.getByRole("button", { name: "Update email" }).click();
  await expect(page.getByText("Email updated.")).toBeVisible();

  const probe = await page.request.get("/api/auth/get-session?disableCookieCache=true");
  const fresh = (await probe.json()) as { user: { email: string } } | null;
  expect(fresh?.user.email).toBe(changedEmail);

  // The Profile card renders the (still unverified) current address.
  await page.reload();
  await expect(page.getByText(`${changedEmail} · unverified`)).toBeVisible();
});

test("a wrong current password is rejected inline", async () => {
  await page.goto("/account");
  await page.getByLabel("Current password").fill("not-the-password-1");
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();

  // The failure surfaces as an error toast (A1), not an in-form alert. Anchor on
  // sonner's error toast (data-type="error") — the message copy is Better Auth's, not
  // ours — and confirm no success copy appeared.
  await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible();
  await expect(page.getByText("Password updated")).toHaveCount(0);
});

test("changing the password re-gates sign-in to the new credentials", async () => {
  await page.goto("/account");
  await page.getByLabel("Current password").fill(user.password);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByText("Password updated — other sessions have been signed out."),
  ).toBeVisible();

  // The current session survives revokeOtherSessions, so the menu sign-out works.
  await signOut(page);

  // The old password is dead: the login form surfaces Better Auth's error inline
  // and never leaves /login.
  await page.goto("/login");
  await page.getByLabel("Email").fill(changedEmail);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  expect(page.url()).toContain("/login");

  // The new credentials — changed email + changed password — sign in normally.
  await signIn(page, { ...user, email: changedEmail, password: newPassword });
  await expect(page.getByText(`Signed in as ${changedEmail}`)).toBeVisible();
});

test("the account surface renders in Spanish with locale-formatted dates (path-to-100 #7)", async () => {
  // Piggybacks on the serial lifecycle's signed-in session — no extra signup
  // against the 5-per-60s limiter. Spot-checks the full-surface es coverage on a
  // signed-in page: localized <title> + chrome, and the sessions card's meta line
  // rendering through the A32 "short" named format (a Spanish abbreviated-month
  // date, not the old English-only toLocaleString()).
  await page.goto("/es/account");
  await expect(page).toHaveTitle(/^Cuenta ·/);
  await expect(page.getByRole("heading", { name: "Cuenta" })).toBeVisible();

  // Match the meta line (date follows), not the card description that shares the
  // "sesión iniciada" words.
  const meta = page.getByText(/sesión iniciada \d/).first();
  await expect(meta).toBeVisible();
  await expect(meta).toContainText(/\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)/);
});
