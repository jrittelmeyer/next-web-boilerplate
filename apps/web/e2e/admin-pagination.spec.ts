import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import { deleteBaitUsers, promoteToAdmin, seedBaitUsers } from "./support/db";

// Keyset pagination E2E for /admin (P3-5). Separate file from admin.spec.ts on
// purpose — that spec's nav-click step is a known local flake (TESTING.md), so this
// one stays independent and uses FULL-PAGE gotos only (the goto path has never
// flaked; the Older/Newest hrefs are read and goto'd rather than clicked).
//
// ONE test = ONE signup (stays inside Better Auth's 5/60s sign-up limiter alongside
// the other suites) + promoteToAdmin, with ~25 inert bait users seeded by direct DB
// insert (support/db.ts — the sanctioned out-of-band path). Assertions are
// deliberately independent of how many OTHER users earlier suites accumulated in
// the shared DB: the freshly signed-up admin is always the newest row (page 1,
// first), full pages always hold exactly PAGE_SIZE rows, and the cross-page
// email-uniqueness walk proves no row is skipped or repeated whatever the total.

const BAIT_PREFIX = "e2e-admin-pagination-bait";
const BAIT_COUNT = 25; // PAGE_SIZE is 20 → guarantees at least a second page
const PAGE_SIZE = 20; // mirrors admin/page.tsx
const MAX_PAGES = 25; // walk bound; 25×20 = 500 rows, far past any accumulated DB

test.beforeAll(async () => {
  await deleteBaitUsers(BAIT_PREFIX); // leftovers from an aborted local run
  await seedBaitUsers(BAIT_PREFIX, BAIT_COUNT);
});

test.afterAll(async () => {
  await deleteBaitUsers(BAIT_PREFIX);
});

test("admin pages through users with Older/Newest links; garbled and past-the-end cursors degrade to a valid page", async ({
  page,
}) => {
  // One signup + a multi-page walk + two degraded-cursor probes — give it room.
  test.slow();

  const admin = makeTestUser("admin-pagination");
  await signUp(page, admin);
  await promoteToAdmin(admin.email);

  // ---- Page 1: full page, admin (newest row) first, Older present, Newest absent.
  await page.goto("/admin");
  await expect(page.getByText("Admin area")).toBeVisible();
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(PAGE_SIZE);
  await expect(rows.first()).toContainText(admin.email);
  await expect(page.getByRole("link", { name: "Older →" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Newest" })).toHaveCount(0);

  // ---- Walk every page via goto of the Older href. Emails are unique in the DB, so
  // a repeat across pages = overlap and a missing bait email = a skipped row.
  const seenEmails = new Set<string>();
  let pagesVisited = 0;
  let nextUrl: string | null = "/admin";
  while (nextUrl && pagesVisited < MAX_PAGES) {
    await page.goto(nextUrl);
    pagesVisited += 1;

    await expect(rows.first()).toBeVisible();
    const emails = await rows.locator("p.text-muted-foreground").allTextContents();
    for (const email of emails) {
      expect(seenEmails.has(email), `email repeated across pages: ${email}`).toBe(false);
      seenEmails.add(email);
    }

    // A cursored page always offers the way back.
    if (pagesVisited > 1) {
      await expect(page.getByRole("link", { name: "← Newest" })).toBeVisible();
    }

    const older = page.getByRole("link", { name: "Older →" });
    if ((await older.count()) > 0) {
      // Every non-final page is exactly full — the probe row never renders.
      expect(emails.length).toBe(PAGE_SIZE);
      nextUrl = await older.getAttribute("href");
      expect(nextUrl).toBeTruthy();
    } else {
      nextUrl = null;
    }
  }
  expect(nextUrl, "walk did not terminate — Older link still present").toBeNull();

  // Every bait row surfaced exactly once somewhere in the walk (Set rejects repeats).
  for (let i = 0; i < BAIT_COUNT; i++) {
    expect(seenEmails.has(`${BAIT_PREFIX}-${i}@example.com`)).toBe(true);
  }
  expect(seenEmails.has(admin.email)).toBe(true);

  // ---- Garbled cursor → decodes to null → page 1 (no active-cursor Newest link).
  await page.goto("/admin?after=not-a-cursor");
  await expect(rows).toHaveCount(PAGE_SIZE);
  await expect(rows.first()).toContainText(admin.email);
  await expect(page.getByRole("link", { name: "← Newest" })).toHaveCount(0);

  // ---- Well-formed but past-the-end cursor (older than every row) → the empty page
  // renders gracefully with the recovery link, not an error.
  await page.goto(`/admin?after=${encodeURIComponent("1970-01-01T00:00:00.000Z_x")}`);
  await expect(page.getByText("No users on this page.")).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← Newest" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Older →" })).toHaveCount(0);
});
