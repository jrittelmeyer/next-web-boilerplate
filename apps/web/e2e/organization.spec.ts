import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";

// Organizations E2E (Tier 4 · Band 4): the owner→invite→accept lifecycle plus post
// org-scoping, end to end through the real UI. Two users are genuinely required (the
// accept flow is a SECOND person joining), so the file runs SERIALLY across two browser
// contexts — an owner and the invitee — created once in beforeAll (two sign-ups, well
// inside Better Auth's 5-per-60s sign-up limiter). DB-backed → the e2e lane.
//
// Email is OFF in CI (RESEND_API_KEY empty), so no invitation mail is delivered — the
// invitation ROW still exists, and the accept link is reachable by its id. The graceful
// path the UI exposes is a "Copy link" button; the spec grabs the same id deterministically
// from Better Auth's authenticated `list-invitations` endpoint (what the copy button and
// the reactive hook read), avoiding clipboard-permission flake.
//
// The OrgSwitcher lives in the (dashboard) header; /posts is OUTSIDE that group, so the
// scoping test switches the active workspace from /organization, then reloads /posts —
// post.list re-scopes off the (now cookie-fresh) session. switchWorkspace waits on the
// set-active round-trip so the cookie is updated before we navigate.

test.describe.configure({ mode: "serial" });

const unique = `${Date.now()}`;
const owner = makeTestUser("org-owner");
const invitee = makeTestUser("org-invitee");
const orgName = `E2E Org ${unique}`;
// slugify(orgName) — lowercase, non-alphanumerics → single hyphen. The create dialog
// derives this from the name; the spec asserts the field then reuses it.
const orgSlug = `e2e-org-${unique}`;

let ownerContext: BrowserContext;
let ownerPage: Page;
let inviteeContext: BrowserContext;
let inviteePage: Page;
// Set in the invite test, consumed by the signed-out / wrong-account / accept tests.
let acceptPath = "";

// Open the header workspace switcher and select `name`, waiting for the set-active
// round-trip (and its refreshed session cookie) to land before the caller navigates.
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
  inviteeContext = await browser.newContext();
  inviteePage = await inviteeContext.newPage();
  await signUp(ownerPage, owner);
});

test.afterAll(async () => {
  await ownerContext?.close();
  await inviteeContext?.close();
});

test("the owner creates an organization from the empty state and owns it", async () => {
  await ownerPage.goto("/organization");
  // Personal workspace → the manager shows the empty state with a Create button.
  await ownerPage.getByRole("button", { name: "Create organization" }).click();

  const dialog = ownerPage.getByRole("dialog");
  await dialog.getByLabel("Name").fill(orgName);
  // The slug field tracks the typed name until the user edits it.
  await expect(dialog.getByLabel("Slug")).toHaveValue(orgSlug);
  await dialog.getByRole("button", { name: "Create organization" }).click();

  // create → setActive → push to /organization; the reactive hook renders the new org.
  await ownerPage.waitForURL("**/organization");
  await expect(ownerPage.getByRole("heading", { name: orgName })).toBeVisible();
  // The creator is a member, tagged "You", holding the owner role. Exact matches keep
  // "You" off "your role" and the bare member-row email off the header's "Signed in as…";
  // the owner role renders in both the member badge and the "your role" line, so first().
  await expect(ownerPage.getByText("You", { exact: true })).toBeVisible();
  await expect(ownerPage.getByText(owner.email, { exact: true }).first()).toBeVisible();
  await expect(ownerPage.getByText("owner", { exact: true }).first()).toBeVisible();
});

test("the owner invites a member, creating a pending invitation with an accept link", async () => {
  await ownerPage.goto("/organization");
  await ownerPage.getByLabel("Email").fill(invitee.email);
  await ownerPage.getByRole("button", { name: "Send invite" }).click();

  // Email off → the "created, copy the link" branch, and the invitee shows up as pending.
  await expect(ownerPage.getByText(`Invitation created for ${invitee.email}`)).toBeVisible();
  await expect(ownerPage.getByText(invitee.email, { exact: true })).toBeVisible();

  // Grab the invitation id from the same authenticated endpoint the UI reads (the owner
  // page carries the session cookie). Poll briefly in case the org refetch lags the row.
  await expect(async () => {
    const res = await ownerPage.request.get("/api/auth/organization/list-invitations");
    expect(res.ok()).toBe(true);
    const invites = (await res.json()) as { id: string; email: string; status: string }[];
    const invite = invites.find(
      (i) => i.email.toLowerCase() === invitee.email.toLowerCase() && i.status === "pending",
    );
    expect(invite).toBeTruthy();
    acceptPath = `/accept-invitation/${invite?.id}`;
  }).toPass({ timeout: 5000 });
});

test("the accept link prompts a signed-out visitor to sign in as the invited address", async ({
  browser,
}) => {
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(acceptPath);

  await expect(anonPage.getByText(`Join ${orgName}`, { exact: true })).toBeVisible();
  await expect(anonPage.getByText(invitee.email, { exact: true })).toBeVisible();
  await expect(anonPage.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(anonPage.getByRole("link", { name: "Create an account" })).toBeVisible();

  await anonContext.close();
});

test("the accept link explains a wrong-account mismatch to a different signed-in user", async () => {
  // The owner is signed in as `owner.email`, not the invited address.
  await ownerPage.goto(acceptPath);
  await expect(ownerPage.getByText("This invitation is for")).toBeVisible();
  await expect(ownerPage.getByRole("button", { name: "Sign out & switch account" })).toBeVisible();
  // Do NOT click it — that would end the owner's session, which later tests rely on.
});

test("the invited user signs up and accepts, becoming a member", async () => {
  await signUp(inviteePage, invitee);
  await inviteePage.goto(acceptPath);

  // Email matches the session → the accept affordance.
  await expect(inviteePage.getByText(`Accept as`)).toBeVisible();
  await inviteePage.getByRole("button", { name: "Accept invitation" }).click();

  // accept → setActive → land on the org's manage page, now as a member.
  await inviteePage.waitForURL("**/organization");
  await expect(inviteePage.getByRole("heading", { name: orgName })).toBeVisible();
  await expect(inviteePage.getByText("You", { exact: true })).toBeVisible();
  await expect(inviteePage.getByText("member", { exact: true }).first()).toBeVisible();
});

test("the owner sees two members and no pending invitations after the accept", async () => {
  await ownerPage.goto("/organization");
  // The invitee moved from the pending list into the members list… (exact keeps the bare
  // member-row emails off the header's "Signed in as…").
  await expect(ownerPage.getByText(invitee.email, { exact: true })).toBeVisible();
  await expect(ownerPage.getByText(owner.email, { exact: true }).first()).toBeVisible();
  // …and the pending section is now empty.
  await expect(ownerPage.getByText("No pending invitations.")).toBeVisible();
});

test("posts are scoped to the active organization", async () => {
  // The owner still has the org active. A post published now is stamped with the org and
  // only appears under the org scope.
  const orgPostTitle = `E2E org-scoped post ${unique}`;
  const orgItem = ownerPage.getByRole("listitem").filter({ hasText: orgPostTitle });

  await ownerPage.goto("/posts");
  await ownerPage.waitForLoadState("networkidle");
  await ownerPage.getByLabel("Title").fill(orgPostTitle);
  await ownerPage.getByLabel("Content").fill("Visible only under the org scope.");
  await ownerPage.getByRole("button", { name: "Publish post" }).click();
  await expect(orgItem).toBeVisible();

  // Switch to Personal (the switcher lives in the dashboard header, not on /posts), then
  // reload /posts — post.list re-scopes to organization_id IS NULL, so the org post drops.
  await ownerPage.goto("/organization");
  await switchWorkspace(ownerPage, "Personal");
  await ownerPage.goto("/posts");
  await ownerPage.waitForLoadState("networkidle");
  await expect(orgItem).toHaveCount(0);

  // Switch back to the org and reload → the org post is visible again.
  await ownerPage.goto("/organization");
  await switchWorkspace(ownerPage, orgName);
  await ownerPage.goto("/posts");
  await ownerPage.waitForLoadState("networkidle");
  await expect(orgItem).toBeVisible();
});
