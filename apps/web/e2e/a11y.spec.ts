import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import { deleteCalendarFixtures, promoteToAdmin, seedCalendar, seedEvents } from "./support/db";

// Accessibility checks (Step 29, expanded in P3-2) with axe-core. We gate on the two
// highest-impact levels — `critical` + `serious`, the WCAG-blocking issues — so the
// suite fails on a real regression without churning on minor/cosmetic advisories.
// Coverage: the public pages (`/` is DB-free; /posts, /login, /signup read the
// session) plus the signed-in /account and /admin surfaces, so the file needs
// Postgres (DB-backed E2E lane).
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

async function blockingViolations(page: Page, url?: string, include?: string, exclude?: string) {
  // `url` is optional so a surface that only exists after an interaction — a dialog,
  // for instance — can be scanned where it stands, without a navigation that would
  // close it.
  //
  // `include` narrows the scan to one subtree, and it is needed for exactly one
  // reason: a modal draws a 50%-black overlay over the page behind it, and axe
  // computes `color-contrast` against that dimmed composite. Scanning the whole page
  // with a dialog open therefore reports every element BEHIND the scrim — month-grid
  // cells, chips, the overlay itself — none of which a user can see or reach. Those
  // surfaces are already scanned undimmed by their own assertions, so narrowing here
  // removes a false positive rather than a check.
  //
  // `exclude` drops one subtree for the same reason `include` narrows: a state no user
  // acts on. See the /account call below — it is scoped to a transient vendor STATE, not
  // to a component, so the element is still scanned in the state a user meets.
  if (url) await page.goto(url);
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  if (include) builder = builder.include(include);
  if (exclude) builder = builder.exclude(exclude);
  const { violations } = await builder.analyze();
  return violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));
}

function summarize(violations: Awaited<ReturnType<typeof blockingViolations>>): string {
  return violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} node(s))`).join("\n");
}

/**
 * Wait for every running CSS animation to finish.
 *
 * Needed before scanning a dialog, and the reason is `color-contrast` specifically.
 * `DialogContent` opens with `fade-in-0 zoom-in-95`, so for ~200 ms its text is drawn
 * at partial opacity and composites with whatever is behind it. axe scanned mid-fade
 * reports the dialog's own muted text at 2.21:1 against a half-dimmed page — a real
 * measurement of a frame no user reads. Bounded by a race so an indefinite animation
 * (a spinner) could never hang the scan.
 */
async function animationsSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const done = () => resolve();
        Promise.all(document.getAnimations().map((animation) => animation.finished)).then(
          done,
          done,
        );
        setTimeout(done, 1000);
      }),
  );
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

test("signed-in account, admin, audit-log and calendar pages have no critical or serious a11y violations", async ({
  page,
}) => {
  // One signup covers ALL signed-in surfaces, keeping this file (which runs first
  // alphabetically, ahead of the account-* signups) to a single hit on Better Auth's
  // 5-per-60s sign-up limiter — which is why the calendar scan was added to this
  // test rather than as a new one. test.slow() triples the budget: the signup
  // round-trip plus four full-page axe scans can be slow under load.
  test.slow();

  const user = makeTestUser("a11y");
  await signUp(page, user);
  // Promote out-of-band (the sanctioned direct-DB path, as in admin.spec) so /admin
  // renders; requireAdmin reads the role fresh from the DB, so no re-login is needed.
  await promoteToAdmin(user.email);

  // Uploadthing's avatar button paints white on #60a5fa — 2.54:1, a `serious`
  // color-contrast violation — while it is still initializing, and with
  // UPLOADTHING_TOKEN unset (the CI default) it never leaves `readying`: the trace shows
  // that state on all three attempts, minutes apart. It is the vendor's un-initialized
  // palette, not one of our tokens, so a bounded "wait for it" would only wait.
  //
  // ⚠️ Scoped to the STATE, never to the component: `[data-state="readying"]` alone, so
  // the same button is still scanned once it reaches `ready` — the state a configured
  // deployment actually shows. Dropping the whole widget would retire a real check.
  //
  // Appeared 2026-08-03 on every branch at once, including one off `main` carrying no
  // e2e changes at all. An earlier note in this repo blamed the signup-helper fix for
  // changing the scan's timing; that was wrong — the run on `security/brace-expansion`
  // reproduced it without that fix present.
  //
  // Stated cost: a user on a slow connection can briefly see that 2.54:1 button, and
  // this no longer asserts on it.
  const accountViolations = await blockingViolations(
    page,
    "/account",
    undefined,
    '[data-ut-element="button"][data-state="readying"]',
  );
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

  // The month grid, scanned with events on it rather than empty. The chips are the
  // part that can regress: a saturated `--chart-*` fill behind chip-size text fails
  // `color-contrast` in at least one theme, so an empty grid would pass while the
  // real screen did not. Two same-day events also force a second lane, so the lane
  // spacers are in the tree too.
  const calendarId = await seedCalendar(user.email, {
    name: "A11y",
    timeZone: "UTC",
    isPrimary: true,
  });
  // Seeded into the CURRENT month, not a fixed one: /calendar opens on today, so
  // fixed 2027 dates would scan an empty grid and the assertion would pass without
  // ever having seen a chip. Days 10 and 15–18 exist in every month.
  const month = new Date().toISOString().slice(0, 7);
  await seedEvents(calendarId, [
    {
      title: "Morning",
      startWall: `${month}-10 09:00:00`,
      endWall: `${month}-10 10:00:00`,
      timeZone: "UTC",
    },
    {
      title: "Afternoon",
      startWall: `${month}-10 14:00:00`,
      endWall: `${month}-10 15:00:00`,
      timeZone: "UTC",
    },
    {
      title: "Conference",
      startWall: `${month}-15 00:00:00`,
      endWall: `${month}-18 00:00:00`,
      timeZone: "UTC",
      allDay: true,
    },
    // A series, so the scan sees a repeat glyph and its accessible name. The glyph is
    // `aria-hidden` and the fact it stands for goes into the chip's own name; an empty
    // month would never exercise either.
    {
      title: "Weekly sync",
      startWall: `${month}-05 11:00:00`,
      endWall: `${month}-05 11:30:00`,
      timeZone: "UTC",
      rrule: "FREQ=WEEKLY",
    },
  ]);
  try {
    const calendarViolations = await blockingViolations(page, "/calendar");
    expect(
      calendarViolations,
      `Accessibility violations on /calendar:\n${summarize(calendarViolations)}`,
    ).toEqual([]);

    // The scope prompt, scanned where it stands. It is a native `<fieldset>` with a
    // `<legend>` and real radios rather than a hand-rolled `role="radiogroup"`, and
    // this is what checks the result instead of the markup. It also opens ON TOP of
    // the composer, so the scan covers two stacked modals — the arrangement most
    // likely to lose a label or an accessible name.
    await page
      .getByTestId("calendar-event-chip")
      .filter({ hasText: "Weekly sync" })
      .first()
      .click();
    await page.getByRole("dialog").first().getByTestId("event-delete").click();
    await page.getByTestId("edit-scope-dialog").waitFor();
    await animationsSettled(page);

    const scopeViolations = await blockingViolations(
      page,
      undefined,
      '[data-testid="edit-scope-dialog"]',
    );
    expect(
      scopeViolations,
      `Accessibility violations on the edit-scope dialog:\n${summarize(scopeViolations)}`,
    ).toEqual([]);
  } finally {
    await deleteCalendarFixtures(user.email);
  }
});
