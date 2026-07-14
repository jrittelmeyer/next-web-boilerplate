import { expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";

// DB-backed CRUD E2E for the example `posts` entity (Step 29) — the read/write split
// on real rows, through the real UI. After signing up (API), drive the /posts page:
// publish via the `createPost` Server Action, see the new row via the public
// `post.list` tRPC query (its cache invalidated, no reload), then delete it
// (author-only). Needs Postgres (the DB-backed E2E lane — every PR + push to main).
// Meilisearch is optional — `createPost` indexes best-effort, so this passes whether
// or not search is wired.

// Open /posts and wait for the client form to hydrate before interacting. The form's
// inputs are controlled by React Hook Form, so a value typed before hydration is
// wiped when React attaches; hydration kicks off the `post.list` refetch, so
// `networkidle` reliably lands after hydration + initial data here.
async function openPostsPage(page: Page) {
  await page.goto("/posts");
  await page.waitForLoadState("networkidle");
}

// Fill the create form and assert the values held (a guard against the hydration
// race above — if a fill were wiped, this fails loudly instead of submitting empty).
async function fillPostForm(page: Page, title: string, content: string) {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Content").fill(content);
  await expect(page.getByLabel("Title")).toHaveValue(title);
}

test("create, edit, then delete a post through the UI", async ({ page }) => {
  const user = makeTestUser("posts");
  await signUp(page, user);

  const title = `E2E post ${Date.now()}`;

  await openPostsPage(page);
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();

  await fillPostForm(page, title, "Created by the posts E2E spec.");
  await page.getByRole("button", { name: "Publish post" }).click();

  // Success resets the form, and the new row appears in the list — optimistically at
  // first, then reconciled by the invalidated `post.list` refetch. Wait for that
  // refetch to settle so we edit the REAL row (with its server id), not the temp one.
  await expect(page.getByLabel("Title")).toHaveValue("");
  const item = page.getByRole("listitem").filter({ hasText: title });
  await expect(item).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Edit (author-only): open the inline editor, change the title, save. The editor is
  // the list row that contains the Save button; scoping to it avoids matching the
  // create form's Title field above. The new title proves updatePost + the optimistic
  // patch end-to-end.
  const editedTitle = `${title} (edited)`;
  await item.getByRole("button", { name: "Edit" }).click();
  const editor = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Save" }) });
  await editor.getByLabel("Title").fill(editedTitle);
  await editor.getByRole("button", { name: "Save" }).click();

  const editedItem = page.getByRole("listitem").filter({ hasText: editedTitle });
  await expect(editedItem).toBeVisible();

  // Delete is author-only; removing it invalidates the list again.
  await editedItem.getByRole("button", { name: "Delete" }).click();
  await expect(editedItem).toHaveCount(0);
});

test("publishing while logged out returns Unauthorized", async ({ page }) => {
  await openPostsPage(page);
  await fillPostForm(page, "Should fail", "No session.");
  await page.getByRole("button", { name: "Publish post" }).click();

  // The action returns the typed { error: "Unauthorized" }, surfaced in an alert
  // whose text is exactly "Unauthorized" — `exact` distinguishes it from the static
  // "…publishing returns “Unauthorized”." helper copy (and Next's empty route
  // announcer, which also has role="alert").
  await expect(page.getByText("Unauthorized", { exact: true })).toBeVisible();
});
