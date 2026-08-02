import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import {
  deleteCalendarFixtures,
  getEventReminders,
  seedCalendar,
  seedEvents,
  setUserTimeZone,
} from "./support/db";

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
  // Explicit rather than `test.slow()`: this is one long LINEAR flow — create, edit,
  // make it repeat, edit one occurrence, split, skip a date, delete by scope, delete
  // both series — deliberately kept in a single test because every `test()` costs a
  // signup against Better Auth's 5-per-60 s limiter. The budget is for its length, not
  // for slowness.
  test.setTimeout(180_000);
  const trpcStatuses: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/trpc/") && response.status() !== 200) {
      trpcStatuses.push(`${response.status()} ${url.slice(url.indexOf("/api/trpc/"), 120)}`);
    }
  });
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

    // --- Edit it, and make it repeat across the transition -------------------
    // One save, not two, and the reason is the budget: `calendar.range` is
    // rate-limited at 20/min per user, every month-arrow press is one read, and
    // `/calendar` always opens on today — so an eight-month walk plus one refetch per
    // save is most of the allowance. This test spends it on coverage, not on
    // round trips.
    //
    // The start moves to Sunday 2027-03-07 in the same edit, because the weekly preset
    // is derived from the start the user is looking at. 03-07 is before Havana's
    // transition and 03-21 is after it.
    await chip.click();
    const editor = page.getByRole("dialog");
    await editor.getByTestId("event-title").fill("Standup (moved)");
    await editor.getByTestId("event-start").fill("2027-03-07T09:00");
    await editor.getByTestId("event-end").fill("2027-03-07T09:30");
    await editor.getByTestId("event-repeat").click();
    // Radix renders its listbox in a portal, so the option is not inside the dialog.
    await page.getByRole("option", { name: "Every week" }).click();
    // The prose summary, rendered from the same pure locale-safe module the detail
    // page uses — asserted here so the grid flow never has to leave for it.
    await expect(editor.getByTestId("recurrence-summary")).toContainText("Every week");
    await editor.getByTestId("event-save").click();
    await expect(editor).toBeHidden();

    await expect(page.getByRole("button", { name: /Standup \(moved\)/ })).toHaveCount(4);

    // **The assertion this fixture exists for.** Both chips must read the same wall
    // time even though Havana's UTC offset changed between them. An expander working
    // in instants reports a uniform 7 days and is silently an hour wrong from 03-14 on.
    const before = await chipText(page, "2027-03-07");
    const after = await chipText(page, "2027-03-21");
    expect(after).toBe(before);

    // --- Reminders round-trip, and a re-save leaves them ALONE ---------------
    // Added in place (Phase 5) rather than as a new `test()`: another block costs another
    // signup against Better Auth's 5-per-60s limiter.
    await occurrenceChip(page, "2027-03-07").click();
    const reminderEditor = page.getByRole("dialog").first();
    await reminderEditor.getByTestId("event-reminder-add").click();
    await expect(reminderEditor.getByTestId("event-reminder-list")).toContainText("15 minutes");
    await reminderEditor.getByTestId("event-save").click();
    await chooseScope(page, "all");
    // **Wait for the COMPOSER to close, not just the scope dialog.** `chooseScope` returns
    // as soon as the scope dialog hides, which is the confirm click — the Server Action has
    // not committed yet. Every other step here happens to wait by asserting on the refetched
    // grid; this one reads the database directly, so it has to wait explicitly. Without it
    // the read races the write and returns an empty list, which is exactly what CI caught.
    await expect(reminderEditor).toBeHidden();

    const afterFirstSave = await getEventReminders(user.email, "Standup (moved)");
    expect(afterFirstSave).toHaveLength(1);
    // The composer's defaults: 15 minutes before, in-app. Negative because the column is
    // signed and "before" is the only direction Phase 5 offers.
    expect(afterFirstSave[0]).toMatchObject({
      channel: "in-app",
      anchor: "start",
      offsetMinutes: -15,
    });

    // **The assertion this step exists for.** Re-open, change nothing about the reminders,
    // save again — the row's ID must be UNCHANGED. A delete-and-reinsert would mint a new
    // id, and `calendar_reminder_deliveries` cascades on it, so the ledger that stops a
    // re-send would vanish and the next sweep would re-deliver every occurrence still
    // inside the grace window. A title edit would spam the user, and nothing else here
    // would notice.
    await occurrenceChip(page, "2027-03-07").click();
    const resaveEditor = page.getByRole("dialog").first();
    await expect(resaveEditor.getByTestId("event-reminder-list")).toContainText("15 minutes");
    await resaveEditor.getByTestId("event-save").click();
    await chooseScope(page, "all");
    await expect(resaveEditor).toBeHidden();

    const afterResave = await getEventReminders(user.email, "Standup (moved)");
    expect(afterResave).toHaveLength(1);
    expect(afterResave[0]?.id).toBe(afterFirstSave[0]?.id);

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

    // --- Split the series from an occurrence ---------------------------------
    // The most complex write in the phase, and the only one no constraint can check.
    // Cutting at 03-14 bounds the old master, creates a new one with a NEW uid, and
    // re-parents the 03-21 override onto it — rewriting that override's uid, without
    // which the split manufactures the corruption the schema leaves writer-enforced.
    await openOccurrence(page, "2027-03-14");
    const splitEditor = page.getByRole("dialog").first();
    await splitEditor.getByTestId("event-title").fill("Second half");
    await splitEditor.getByTestId("event-save").click();
    await chooseScope(page, "thisAndFollowing");

    // One assertion set, four facts: the first half kept its own title and stopped at
    // the cut; the second half starts there; and the override SURVIVED the re-parent
    // and is still suppressed from its new master's expansion rather than painted twice.
    await expect(occurrenceChip(page, "2027-03-07")).toHaveText(/Standup \(moved\)/);
    await expect(occurrenceChip(page, "2027-03-14")).toHaveText(/Second half/);
    await expect(occurrenceChip(page, "2027-03-21")).toHaveText(/Just this one/);
    await expect(occurrenceChip(page, "2027-03-28")).toHaveText(/Second half/);
    await expect(page.getByRole("button", { name: /Second half/ })).toHaveCount(2);

    // --- Delete this and the following ones ----------------------------------
    const secondHalfId = await occurrenceChip(page, "2027-03-14").getAttribute("data-event-id");
    expect(secondHalfId).toBeTruthy();

    await openOccurrence(page, "2027-03-21");
    await page.getByRole("dialog").first().getByTestId("event-delete").click();
    await chooseScope(page, "thisAndFollowing");

    // Later cells vanish, earlier ones remain — including the override, which is
    // hard-deleted along with the occurrences it belonged to.
    await expect(occurrenceChip(page, "2027-03-07")).toHaveCount(1);
    await expect(occurrenceChip(page, "2027-03-14")).toHaveCount(1);
    await expect(occurrenceChip(page, "2027-03-21")).toHaveCount(0);
    await expect(occurrenceChip(page, "2027-03-28")).toHaveCount(0);

    // --- Delete a whole series from the grid, by scope ------------------------
    await openOccurrence(page, "2027-03-14");
    await page.getByRole("dialog").first().getByTestId("event-delete").click();
    await chooseScope(page, "all");

    // The second series is gone entirely; the first — a genuinely separate series
    // since the split — is untouched. That is the split's real proof: one id's
    // deletion cannot reach the other's occurrences.
    await expect(occurrenceChip(page, "2027-03-14")).toHaveCount(0);
    await expect(occurrenceChip(page, "2027-03-07")).toHaveCount(1);

    // A 429 here renders as an EMPTY GRID with no message, which is indistinguishable
    // from "the write worked". Asserting it explicitly turns that into a named
    // failure instead of a mystifying `toHaveCount(0)`.
    expect(trpcStatuses.join("\n")).toBe("");

    // --- Skip a date, then delete the series, from the detail route -----------
    // The one trip off the grid, and it comes LAST on purpose: returning would cost
    // another eight-month walk, and the reads budget is already spent.
    const firstHalfId = await occurrenceChip(page, "2027-03-07").getAttribute("data-event-id");
    expect(firstHalfId).toBeTruthy();
    // Every chip answers with its MASTER's id — the occurrence-identity contract — so
    // this is a series' own page, never an override's, and the split produced two
    // genuinely distinct ids.
    expect(firstHalfId).not.toBe(secondHalfId);

    await page.goto(`/calendar/event/${firstHalfId}`);
    await expect(page.getByRole("heading", { name: "Standup (moved)" })).toBeVisible();
    await expect(page.getByTestId("recurrence-summary")).toContainText("Every week");

    await page.getByTestId("recurrence-date").fill("2027-03-07T09:00");
    await page.getByTestId("recurrence-skip").click();
    // The toast is the assertion: `setRecurrenceDate` reached Postgres and came back
    // with data. Waiting for it also stops the navigation below from aborting the
    // in-flight Server Action.
    await expect(page.getByText("That date is now skipped.")).toBeVisible();

    await page.getByRole("button", { name: "Delete event" }).click();
    await page.waitForURL("**/calendar");
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
