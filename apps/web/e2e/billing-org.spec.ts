import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";

// Org billing E2E (path-to-100 #11), CI-honest with NO Stripe keys: it proves the
// CONTEXT plumbing — /billing and /premium follow the active workspace, and an org
// owner passes the owner/admin gate all the way to the config gate (the typed
// "Stripe is not configured" error, which the action checks AFTER the role gate —
// so reaching it is proof the gate passed). The member-blocked branch and the
// Stripe-configured flow are covered by billing.test.ts + the Phase-5 live verify
// (docs/VERIFICATION.md). One user, serial — the org lifecycle itself is
// organization.spec.ts's job.

test.describe.configure({ mode: "serial" });

const unique = `${Date.now()}`;
const owner = makeTestUser("billing-org");
const orgName = `E2E Billing Org ${unique}`;

let ownerContext: BrowserContext;
let ownerPage: Page;

// Same helper as organization.spec.ts: select a workspace and wait for the
// set-active round-trip so the refreshed session cookie lands before navigating.
async function switchWorkspace(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/organization/set-active") && r.ok()),
    page.getByRole("menuitem", { name, exact: true }).click(),
  ]);
}

test.beforeAll(async ({ browser }) => {
  ownerContext = await browser.newContext();
  ownerPage = await ownerContext.newPage();
  await signUp(ownerPage, owner);
});

test.afterAll(async () => {
  await ownerContext?.close();
});

test("the personal workspace gets the personal billing surface", async () => {
  await ownerPage.goto("/billing");
  // CardTitle renders a div, so anchor on text, not a heading role.
  await expect(ownerPage.getByText("Billing demo", { exact: true })).toBeVisible();
  await expect(ownerPage.getByRole("button", { name: "Subscribe" })).toBeVisible();
});

test("an active org makes /billing the org's surface and the owner reaches the config gate", async () => {
  // Create an org (which also sets it active) — the organization.spec.ts steps.
  await ownerPage.goto("/organization");
  await ownerPage.getByRole("button", { name: "Create organization" }).click();
  const dialog = ownerPage.getByRole("dialog");
  await dialog.getByLabel("Name").fill(orgName);
  await dialog.getByRole("button", { name: "Create organization" }).click();
  await ownerPage.waitForURL("**/organization");
  await expect(ownerPage.getByRole("heading", { name: orgName })).toBeVisible();

  // /billing re-resolves the context server-side → the org-billing copy.
  await ownerPage.goto("/billing");
  await expect(ownerPage.getByText(`Billing for ${orgName}`, { exact: true })).toBeVisible();

  // The owner passes the org role gate; what happens next depends on the env —
  // keyless (CI's default) the config gate answers with the typed error, while a
  // local .env with Stripe TEST keys redirects to real Stripe-hosted Checkout.
  // Either outcome proves the owner cleared the role gate (a plain member gets
  // the owners/admins error BEFORE it — billing.test.ts pins that ordering).
  await ownerPage.getByRole("button", { name: "Subscribe" }).click();
  await expect(async () => {
    const redirectedToStripe = ownerPage.url().includes("stripe.com");
    const configErrorShown = await ownerPage
      .getByText("Stripe is not configured (set STRIPE_SECRET_KEY).")
      .isVisible();
    expect(redirectedToStripe || configErrorShown).toBe(true);
  }).toPass({ timeout: 15_000 });
});

test("/premium gates on the active org's (absent) subscription", async () => {
  await ownerPage.goto("/premium");
  await expect(
    ownerPage.getByText(
      "Your active organization has no subscription. An organization owner or admin can subscribe on the billing page.",
    ),
  ).toBeVisible();
});

test("switching back to Personal restores the personal billing surface", async () => {
  await ownerPage.goto("/organization");
  await switchWorkspace(ownerPage, "Personal");
  await ownerPage.goto("/billing");
  await expect(ownerPage.getByText("Billing demo", { exact: true })).toBeVisible();
});
