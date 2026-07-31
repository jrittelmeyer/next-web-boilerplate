import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import { deleteCalendarFixtures, seedCalendar, seedEvents, setUserTimeZone } from "./support/db";

/**
 * Calendar Phase 1 end-to-end: create a calendar, create / edit / soft-delete an
 * event, and — the reason this file is worth its runtime — assert that an all-day
 * event lands on exactly one cell under conditions that break the naive
 * implementation.
 *
 * **The fixture is chosen to falsify, not to pass.** 2027-03-14 in `America/Havana`
 * is a DST transition **at midnight**: local 00:00 does not exist that day, so the
 * all-day event's own start resolves into the gap and lands at `2027-03-14T05:00Z`,
 * with its exclusive end at `2027-03-15T04:00Z`. The viewer sits in
 * `Pacific/Auckland` (UTC+13). An implementation that placed the all-day event by
 * converting those instants into the viewer's zone would read 14 March 18:00 →
 * 15 March 17:00 and paint **two** cells. Placing it by its wall dates — which is
 * what `lib/calendar/grid.ts` does, and what the whole all-day convention exists for
 * — paints exactly one.
 *
 * `America/New_York` would have proved nothing here: it transitions at 02:00, so an
 * all-day event's midnight is never in the gap and the assertion would pass for the
 * wrong reason.
 *
 * DB-backed lane. One signup per file keeps this within Better Auth's 5-per-60s
 * sign-up limiter.
 */

const HAVANA_DST_DATE = "2027-03-14";
const VIEWER_ZONE = "Pacific/Auckland";
const EVENT_ZONE = "America/Havana";

test("an all-day event on a midnight DST transition lands on exactly one cell", async ({
  page,
}) => {
  test.slow();
  const user = makeTestUser("calendar-allday");
  await signUp(page, user);
  await setUserTimeZone(user.email, VIEWER_ZONE);

  const calendarId = await seedCalendar(user.email, {
    name: "Havana",
    timeZone: EVENT_ZONE,
    isPrimary: true,
  });
  await seedEvents(calendarId, [
    {
      title: "Transition day",
      // Exclusive end, RFC 5545 style: one all-day event on the 14th.
      startWall: `${HAVANA_DST_DATE} 00:00:00`,
      endWall: "2027-03-15 00:00:00",
      timeZone: EVENT_ZONE,
      allDay: true,
    },
  ]);

  try {
    await page.goto("/calendar");
    await page.getByRole("grid").waitFor();

    // Page to March 2027 from whatever month "today" is.
    await gotoMonth(page, 2027, 3);

    const chips = page.getByRole("button", { name: "Transition day" });
    await expect(chips).toHaveCount(1);

    const cell = page.locator(`[data-testid="calendar-day-cell"][data-date="${HAVANA_DST_DATE}"]`);
    await expect(cell.getByRole("button", { name: "Transition day" })).toBeVisible();

    // The specific wrong answer this fixture exists to catch.
    const nextDay = page.locator('[data-testid="calendar-day-cell"][data-date="2027-03-15"]');
    await expect(nextDay.getByRole("button", { name: /Transition day/ })).toHaveCount(0);
  } finally {
    await deleteCalendarFixtures(user.email);
  }
});

/**
 * One signed-in flow, end to end: a calendar, a one-off, then the same event made
 * weekly across a DST transition and edited and deleted **by scope**.
 *
 * Extended in place rather than split into more `test()` blocks: each one costs a
 * signup against Better Auth's 5-per-60 s limiter, and this file already spends three.
 *
 * The calendar sits in **`America/Havana`, and so does the viewer** — both halves
 * matter. Havana transitions at **midnight** on 2027-03-14, so a series that straddles
 * it changes offset between two occurrences; and because the viewer's zone matches the
 * event's, "did every occurrence keep its wall time?" is a question the rendered chips
 * can actually answer. With a different viewer zone the chips would agree for the wrong
 * reason, and `America/New_York` transitions at 02:00, where a 09:00 series never sees
 * the boundary from the inside.
 */
test("create a calendar, then create, edit and delete an event through the UI", async ({
  page,
}) => {
  test.slow();
  const user = makeTestUser("calendar-crud");
  await signUp(page, user);
  await setUserTimeZone(user.email, EVENT_ZONE);

  try {
    await page.goto("/calendar");

    // --- Create a calendar --------------------------------------------------
    await page.getByRole("button", { name: "New", exact: true }).click();
    const calendarDialog = page.getByRole("dialog");
    await calendarDialog.getByLabel("Name").fill("Work");
    await calendarDialog.getByLabel("Time zone").fill(EVENT_ZONE);
    await calendarDialog.getByRole("button", { name: "Save" }).click();
    await expect(calendarDialog).toBeHidden();
    // Scoped to the rail, not `page.getByText("Work")`: the success toast says
    // "Created Work." and a bare text match resolves to both (strict-mode violation).
    const rail = page.getByRole("region", { name: "Calendars" });
    await expect(rail.getByText("Work", { exact: true })).toBeVisible();

    // --- Create an event ----------------------------------------------------
    await page.getByRole("button", { name: "New event" }).click();
    const composer = page.getByRole("dialog");
    await composer.getByTestId("event-title").fill("Standup");
    await composer.getByTestId("event-start").fill("2027-03-15T09:00");
    await composer.getByTestId("event-end").fill("2027-03-15T09:30");
    await composer.getByTestId("event-start-tzid").fill(EVENT_ZONE);
    await composer.getByTestId("event-save").click();
    await expect(composer).toBeHidden();

    await gotoMonth(page, 2027, 3);
    const chip = page.getByRole("button", { name: /Standup/ });
    await expect(chip).toHaveCount(1);

    // --- Edit it ------------------------------------------------------------
    await chip.click();
    const editor = page.getByRole("dialog");
    await editor.getByTestId("event-title").fill("Standup (moved)");
    await editor.getByTestId("event-save").click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole("button", { name: /Standup \(moved\)/ })).toHaveCount(1);

    // --- Make it repeat, across the transition ------------------------------
    // The start moves to Sunday 2027-03-07 first, because the weekly preset is derived
    // from the start the user is looking at. 03-07 is before Havana's transition and
    // 03-21 is after it.
    await page.getByRole("button", { name: /Standup \(moved\)/ }).click();
    const repeatEditor = page.getByRole("dialog");
    await repeatEditor.getByTestId("event-start").fill("2027-03-07T09:00");
    await repeatEditor.getByTestId("event-end").fill("2027-03-07T09:30");
    await repeatEditor.getByTestId("event-repeat").click();
    // Radix renders its listbox in a portal, so the option is not inside the dialog.
    await page.getByRole("option", { name: "Every week" }).click();
    await repeatEditor.getByTestId("event-save").click();
    await expect(repeatEditor).toBeHidden();

    await expect(page.getByRole("button", { name: /Standup \(moved\)/ })).toHaveCount(4);

    // **The assertion this fixture exists for.** Both chips must read the same wall
    // time even though Havana's UTC offset changed between them. An expander working
    // in instants reports a uniform 7 days and is silently an hour wrong from 03-14 on.
    const before = await chipText(page, "2027-03-07");
    const after = await chipText(page, "2027-03-21");
    expect(after).toBe(before);

    // --- Edit ONE occurrence -------------------------------------------------
    await openOccurrence(page, "2027-03-21");
    const scopedEditor = page.getByRole("dialog").first();
    await scopedEditor.getByTestId("event-title").fill("Just this one");
    await scopedEditor.getByTestId("event-save").click();
    await chooseScope(page, "this");

    // Exactly one cell changed; the other three still carry the series' title.
    await expect(page.getByRole("button", { name: /Just this one/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Standup \(moved\)/ })).toHaveCount(3);
    await expect(occurrenceChip(page, "2027-03-21")).toHaveText(/Just this one/);

    // --- Delete this and the following ones ----------------------------------
    await openOccurrence(page, "2027-03-21");
    await page.getByRole("dialog").first().getByTestId("event-delete").click();
    await chooseScope(page, "thisAndFollowing");

    // Later cells vanish, earlier ones remain — including the override, which is
    // hard-deleted along with the occurrences it belonged to.
    await expect(occurrenceChip(page, "2027-03-07")).toHaveCount(1);
    await expect(occurrenceChip(page, "2027-03-14")).toHaveCount(1);
    await expect(occurrenceChip(page, "2027-03-21")).toHaveCount(0);
    await expect(occurrenceChip(page, "2027-03-28")).toHaveCount(0);

    // --- Soft-delete the whole series from the detail route -------------------
    // Every chip answers with its MASTER's id — the occurrence-identity contract — so
    // this is the series' own page, not an override's.
    const eventId = await occurrenceChip(page, "2027-03-07").getAttribute("data-event-id");
    expect(eventId).toBeTruthy();

    await page.goto(`/calendar/event/${eventId}`);
    await expect(page.getByRole("heading", { name: "Standup (moved)" })).toBeVisible();
    // The detail page reads the series in prose, from the same locale-safe module the
    // composer's summary uses.
    await expect(page.getByTestId("recurrence-summary")).toContainText("Every week");
    await page.getByRole("button", { name: "Delete event" }).click();
    await page.waitForURL("**/calendar");

    await gotoMonth(page, 2027, 3);
    // The master AND its remaining occurrences: a soft-deleted master whose overrides
    // stayed live is exactly what `deleteEvent`'s transaction exists to prevent.
    await expect(page.getByRole("button", { name: /Standup/ })).toHaveCount(0);
  } finally {
    await deleteCalendarFixtures(user.email);
  }
});

/** The chips in one day cell. Their count is the assertion for a scoped delete. */
function occurrenceChip(page: import("@playwright/test").Page, date: string) {
  return page
    .locator(`[data-testid="calendar-day-cell"][data-date="${date}"]`)
    .locator('[data-testid="calendar-event-chip"]');
}

/**
 * A chip's rendered text — the time as the viewer sees it, plus the title.
 *
 * Compared against another chip rather than against a literal, so the assertion does
 * not pin next-intl's `timeOnly` format or the locale's 12/24-hour choice. What is
 * under test is that the two are *equal*, which is precisely the DST property.
 */
async function chipText(page: import("@playwright/test").Page, date: string): Promise<string> {
  return (await occurrenceChip(page, date).first().innerText()).trim();
}

async function openOccurrence(page: import("@playwright/test").Page, date: string): Promise<void> {
  await occurrenceChip(page, date).first().click();
  await page.getByRole("dialog").first().getByTestId("event-save").waitFor();
}

/**
 * Answer the scope prompt.
 *
 * By test id, not `getByRole("dialog")`: the scope dialog opens *on top of* the
 * composer, so two dialogs are in the tree and a role query is ambiguous.
 */
async function chooseScope(
  page: import("@playwright/test").Page,
  scope: "this" | "thisAndFollowing" | "all",
): Promise<void> {
  const dialog = page.getByTestId("edit-scope-dialog");
  await dialog.waitFor();
  await dialog.getByTestId(`edit-scope-${scope}`).check();
  await dialog.getByTestId("edit-scope-confirm").click();
  await expect(dialog).toBeHidden();
}

test("the month grid is a single tab stop and arrow keys move within it", async ({ page }) => {
  test.slow();
  const user = makeTestUser("calendar-keys");
  await signUp(page, user);
  await setUserTimeZone(user.email, "UTC");
  const calendarId = await seedCalendar(user.email, {
    name: "Keys",
    timeZone: "UTC",
    isPrimary: true,
  });
  await seedEvents(calendarId, [
    {
      title: "Busy day",
      startWall: "2027-03-10 09:00:00",
      endWall: "2027-03-10 10:00:00",
      timeZone: "UTC",
    },
    {
      title: "Also busy",
      startWall: "2027-03-10 11:00:00",
      endWall: "2027-03-10 12:00:00",
      timeZone: "UTC",
    },
  ]);

  try {
    await page.goto("/calendar");
    await page.getByRole("grid").waitFor();
    await gotoMonth(page, 2027, 3);

    // Exactly one cell is in the tab order, no matter how many events the month has.
    // That is the whole point of the roving tabindex: chips are tabIndex={-1}.
    const cells = page.locator('[data-testid="calendar-day-cell"]');
    await expect(cells).not.toHaveCount(0);
    await expect(page.locator('[data-testid="calendar-day-cell"][tabindex="0"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="calendar-event-chip"][tabindex="0"]')).toHaveCount(0);

    // ArrowRight moves the tab stop one day on.
    const first = page.locator('[data-testid="calendar-day-cell"][tabindex="0"]');
    const startDate = await first.getAttribute("data-date");
    await first.focus();
    await page.keyboard.press("ArrowRight");
    const moved = await page
      .locator('[data-testid="calendar-day-cell"][tabindex="0"]')
      .getAttribute("data-date");
    expect(moved).not.toBe(startDate);
    await expect(page.locator('[data-testid="calendar-day-cell"][tabindex="0"]')).toHaveCount(1);

    // Enter opens the day popover — the focus-trapped surface where the day's chips
    // become reachable normally.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    await deleteCalendarFixtures(user.email);
  }
});

/**
 * Page the grid to a target month with the toolbar's own controls.
 *
 * Deliberately not a URL parameter: the month lives in client state precisely so
 * paging costs no navigation, and a spec that reached it by URL would be testing a
 * route that does not exist.
 */
async function gotoMonth(
  page: import("@playwright/test").Page,
  year: number,
  month: number,
): Promise<void> {
  await page.getByRole("grid").waitFor();
  for (let step = 0; step < 60; step += 1) {
    const current = await currentMonth(page);
    if (!current) throw new Error("could not read the grid's month");
    if (current.year === year && current.month === month) return;
    const forward = (year - current.year) * 12 + (month - current.month) > 0;
    await page.getByRole("button", { name: forward ? "Next month" : "Previous month" }).click();
    // The grid remounts on a month change (the key in calendar-workspace), so wait
    // for the rendered dates to actually move rather than for a fixed delay.
    await expect.poll(async () => (await currentMonth(page))?.month).not.toBe(current.month);
  }
  throw new Error(`could not reach ${year}-${month}`);
}

/**
 * The month the grid is showing, read from the dates it renders rather than from its
 * localized label — the label is translated, the `data-date` attributes are not.
 */
async function currentMonth(
  page: import("@playwright/test").Page,
): Promise<{ year: number; month: number } | null> {
  const dates = await page
    .locator('[data-testid="calendar-day-cell"][data-in-month="true"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-date") ?? ""));
  const first = dates.find(Boolean);
  if (!first) return null;
  return { year: Number(first.slice(0, 4)), month: Number(first.slice(5, 7)) };
}
