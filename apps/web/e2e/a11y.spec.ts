import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import { promoteToAdmin } from "./support/db";

// Accessibility checks (Step 29, expanded in P3-2) with axe-core. We gate on the two
// highest-impact levels — `critical` + `serious`, the WCAG-blocking issues — so the
// suite fails on a real regression without churning on minor/cosmetic advisories.
// Coverage: the public pages (`/` is DB-free; /posts, /login, /signup read the
// session) plus the signed-in /account and /admin surfaces, so the file needs
// Postgres (DB-backed E2E lane).
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

async function blockingViolations(page: Page, url: string) {
  await page.goto(url);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));
}

function summarize(violations: Awaited<ReturnType<typeof blockingViolations>>): string {
  return violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} node(s))`).join("\n");
}

test("landing page has no critical or serious a11y violations", async ({ page }) => {
  const violations = await blockingViolations(page, "/");
  expect(violations, `Accessibility violations on /:\n${summarize(violations)}`).toEqual([]);
});

test("posts page has no critical or serious a11y violations", async ({ page }) => {
  const violations = await blockingViolations(page, "/posts");
  expect(violations, `Accessibility violations on /posts:\n${summarize(violations)}`).toEqual([]);
});

test("login page has no critical or serious a11y violations", async ({ page }) => {
  const violations = await blockingViolations(page, "/login");
  expect(violations, `Accessibility violations on /login:\n${summarize(violations)}`).toEqual([]);
});

test("signup page has no critical or serious a11y violations", async ({ page }) => {
  const violations = await blockingViolations(page, "/signup");
  expect(violations, `Accessibility violations on /signup:\n${summarize(violations)}`).toEqual([]);
});

test("signed-in account, admin, and audit-log pages have no critical or serious a11y violations", async ({
  page,
}) => {
  // One signup covers ALL signed-in surfaces, keeping this file (which runs first
  // alphabetically, ahead of the account-* signups) to a single hit on Better Auth's
  // 5-per-60s sign-up limiter. test.slow() triples the budget: the signup round-trip
  // plus three full-page axe scans can be slow under load.
  test.slow();

  const user = makeTestUser("a11y");
  await signUp(page, user);
  // Promote out-of-band (the sanctioned direct-DB path, as in admin.spec) so /admin
  // renders; requireAdmin reads the role fresh from the DB, so no re-login is needed.
  await promoteToAdmin(user.email);

  const accountViolations = await blockingViolations(page, "/account");
  expect(
    accountViolations,
    `Accessibility violations on /account:\n${summarize(accountViolations)}`,
  ).toEqual([]);

  const adminViolations = await blockingViolations(page, "/admin");
  expect(
    adminViolations,
    `Accessibility violations on /admin:\n${summarize(adminViolations)}`,
  ).toEqual([]);

  // The audit read UI (B2). The signup above wrote a `user.signed_in` row, so this
  // scans a populated list — but the empty state is a11y-clean too.
  const auditViolations = await blockingViolations(page, "/admin/audit");
  expect(
    auditViolations,
    `Accessibility violations on /admin/audit:\n${summarize(auditViolations)}`,
  ).toEqual([]);
});
