import { expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import { seedCalendar } from "./support/db";

/**
 * `calendar.range`'s error state: proves a 429 renders `CalendarWorkspace`'s own error
 * message, not a blank month grid indistinguishable from "no events this month" — the
 * defect `docs/MAINTENANCE.md` used to track and `docs/context/calendar/api.md` now
 * documents as fixed.
 *
 * **Its own file, its own signup.** `calendar.spec.ts` and `calendar-invites.spec.ts`
 * both run close to their `calendar.range` read budget already (20/min per user); tripping
 * the bucket deliberately here would either need to happen inside one of those files (and
 * then contend with their own assertions) or spend a chunk of their remaining budget. A
 * dedicated file with one signup keeps this test's bucket-exhaustion entirely its own.
 *
 * **The bucket is tripped via 21 direct `page.request.get` calls, not 21 UI month-arrow
 * clicks.** Same raw batch+superjson envelope `calendar-invites.spec.ts` already uses to
 * drive `calendar.range` directly — deterministic (no click/render/network race across 21
 * round trips) and it reuses the same authenticated session cookie the page itself holds.
 */

const user = makeTestUser("range-error");

async function requestRange(page: Page, calendarId: string): Promise<number> {
  const nowMs = Date.now();
  const input = {
    0: {
      json: {
        calendarIds: [calendarId],
        fromMs: nowMs - 2 * 86_400_000,
        toMs: nowMs + 2 * 86_400_000,
      },
    },
  };
  const response = await page.request.get(
    `/api/trpc/calendar.range?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`,
  );
  return response.status();
}

test("a 429 on calendar.range renders the error message, not a blank grid", async ({ page }) => {
  await signUp(page, user);
  const calendarId = await seedCalendar(user.email, {
    name: "Range error probe",
    timeZone: "UTC",
  });

  // `userRateLimitedProcedure`'s bucket is 20/min per user per procedure
  // (`apps/web/src/server/trpc/trpc.ts`) — the 21st call in this window must be the one
  // that trips it.
  const statuses: number[] = [];
  for (let i = 0; i < 21; i++) {
    statuses.push(await requestRange(page, calendarId));
  }
  expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);

  // The page's own query is in the SAME bucket (same user, same procedure path), so
  // loading /calendar now must still be inside the tripped window.
  await page.goto("/calendar");
  await expect(page.getByText("This month's events could not be loaded.")).toBeVisible();
  // Never both: the grid's day cells and the error message are mutually exclusive —
  // this is the assertion that would fail under the old `?? []` behaviour, where the
  // grid still rendered (empty) alongside no message at all.
  await expect(page.getByTestId("calendar-event-chip")).toHaveCount(0);
});
