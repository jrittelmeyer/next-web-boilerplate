import { expect, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import {
  deleteCalendarFixtures,
  deleteInvitationJobs,
  getAttendeeStatus,
  getEventIdByTitle,
  getInvitationJobs,
  setUserTimeZone,
} from "./support/db";

/**
 * Phase 4 end to end: an organizer invites an address with **no account**, that person
 * answers from a signed-out browser, and a reschedule marks their answer stale without
 * destroying it.
 *
 * **One signup, deliberately.** `/sign-up/email` is 5 per 60 s, DB-backed and shared by
 * every worker and both web servers, and this suite already spends most of it. Phase 4's
 * subject is the *external* guest, so the second account this test would otherwise need is
 * exactly the thing under test not needing one.
 *
 * **The `.ics` is asserted from `pgboss.job`, not from a captured email, and that is not a
 * shortcut.** The Playwright `webServer` array runs two Next servers and nothing that drains
 * the queue, so an assertion waiting on a captured send would hang for its full timeout and
 * throw. Reading the enqueued payload proves what actually carries risk — that the writer
 * assembled the right calendar for the right person — one step before delivery, which the
 * live-verify pass covers against a real inbox.
 *
 * **The event lives in the CURRENT month** so the grid needs no month walk: `calendar.range`
 * is 20/min per user and every month arrow spends one.
 *
 * ⚠️ **`/rsvp/...` answers HTTP 200 for every refusal**, by design — a 404 would confirm
 * which invitations exist. The refusals below are asserted on rendered CONTENT plus an
 * explicit 200, never on a status code alone.
 *
 * ⚠️ Requires the app to run with **email unconfigured** (the default `:3000` lane): that is
 * what makes the organizer's event page surface a copyable RSVP link per guest, which is
 * both the D6 fallback under test and how this spec obtains a real token.
 */

test.describe.configure({ mode: "serial" });

const EVENT_ZONE = "America/New_York";
const organizer = makeTestUser("rsvp-organizer");
/** No account, ever — that is the point of the phase. */
const guest = `rsvp-guest-${Date.now()}@example.com`;

/** The 15th of the current month, so the chip is on the grid the page opens on. */
function dayInThisMonth(hour: number): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-15T${String(hour).padStart(2, "0")}:00`;
}

test.afterAll(async () => {
  await deleteInvitationJobs(guest);
  await deleteCalendarFixtures(organizer.email);
});

test("an external guest is invited, answers signed-out, and is re-asked when the time moves", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signUp(page, organizer);
  await setUserTimeZone(organizer.email, EVENT_ZONE);
  await page.goto("/calendar");

  // --- A calendar and an event with one external guest ------------------------
  await page.getByRole("button", { name: "New", exact: true }).click();
  const calendarDialog = page.getByRole("dialog");
  await calendarDialog.getByLabel("Name").fill("Work");
  await calendarDialog.getByLabel("Time zone").fill(EVENT_ZONE);
  await calendarDialog.getByRole("button", { name: "Save" }).click();
  await expect(calendarDialog).toBeHidden();

  await page.getByRole("button", { name: "New event" }).click();
  const composer = page.getByRole("dialog");
  await composer.getByTestId("event-title").fill("Standup");
  await composer.getByTestId("event-start").fill(dayInThisMonth(9));
  await composer.getByTestId("event-end").fill(dayInThisMonth(10));
  await composer.getByTestId("event-start-tzid").fill(EVENT_ZONE);
  await composer.getByTestId("event-attendees").fill(guest);
  await composer.getByTestId("event-attendees").press("Enter");
  await expect(composer.getByTestId("event-attendee-chips")).toContainText(guest);
  await composer.getByTestId("event-save").click();
  await expect(composer).toBeHidden();

  const eventId = await getEventIdByTitle(organizer.email, "Standup");
  expect(eventId).not.toBeNull();

  // --- The invitation that was enqueued ---------------------------------------
  await expect
    .poll(async () => (await getInvitationJobs(guest)).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [invite] = await getInvitationJobs(guest);

  expect(invite?.kind).toBe("invite");
  expect(invite?.eventTitle).toBe("Standup");
  // The zone is named because an external guest has no stored one of their own.
  expect(invite?.when).toContain(EVENT_ZONE);

  const ics = invite?.ics ?? "";
  expect(ics).toContain("METHOD:PUBLISH");
  expect(ics).toContain("SEQUENCE:0");
  expect(ics).toContain(`DTSTART;TZID=${EVENT_ZONE}:`);
  // The whole iTIP decision, asserted where a regression would show: an ATTENDEE line is
  // what makes Gmail render reply buttons that reach nothing.
  expect(ics).not.toContain("ATTENDEE");
  // CRLF, and no physical line over 75 octets.
  expect(ics.endsWith("\r\n")).toBe(true);
  for (const line of ics.split("\r\n")) {
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  }

  // --- The copyable link the organizer sees while email is unconfigured --------
  await page.goto(`/calendar/event/${eventId}`);
  const linkInput = page.getByTestId(`rsvp-link-${guest}`);
  await expect(linkInput).toBeVisible();
  const rsvpUrl = await linkInput.inputValue();
  const token = rsvpUrl.slice(rsvpUrl.lastIndexOf("/rsvp/") + "/rsvp/".length);
  // The defect this assertion exists for: `proxy.ts`'s matcher excludes any path containing
  // a dot, so a dotted token never reaches the route and every invitation 404s. A fixture
  // token would pass this; only a real minted one proves it.
  expect(token).not.toContain(".");

  // --- The guest answers, signed out ------------------------------------------
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  try {
    const response = await guestPage.goto(rsvpUrl);
    expect(response?.status()).toBe(200);
    // The token is exchanged for a cookie and dropped from the URL, so it cannot reach
    // analytics, a Referer, or the browser's history.
    await expect(guestPage).toHaveURL(/\/rsvp\/s\//);
    expect(guestPage.url()).not.toContain(token);

    await expect(guestPage.getByRole("heading", { name: "Standup" })).toBeVisible();
    await guestPage.getByTestId("rsvp-declined").click();
    await expect(guestPage.getByText("You declined.").first()).toBeVisible();
    expect(await getAttendeeStatus(eventId as string, guest)).toBe("declined");

    // --- The organizer moves the time -----------------------------------------
    await page.goto("/calendar");
    await page
      .getByRole("button", { name: /Standup/ })
      .first()
      .click();
    const editor = page.getByRole("dialog");
    await editor.getByTestId("event-start").fill(dayInThisMonth(14));
    await editor.getByTestId("event-end").fill(dayInThisMonth(15));
    await editor.getByTestId("event-save").click();
    await expect(editor).toBeHidden();

    // The answer SURVIVES and is marked stale — the whole reason `reask_at` exists rather
    // than a reset, which would have overwritten it with no way back.
    expect(await getAttendeeStatus(eventId as string, guest)).toBe("declined");
    await page.goto(`/calendar/event/${eventId}`);
    await expect(page.getByTestId("attendee-stale")).toBeVisible();

    await expect
      .poll(
        async () => (await getInvitationJobs(guest)).filter((job) => job.kind === "update").length,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    const move = (await getInvitationJobs(guest)).find((job) => job.kind === "update");
    expect(move?.reask).toBe(true);
    // A client IGNORES a re-import whose UID matches and whose SEQUENCE has not risen.
    expect(move?.ics).toContain("SEQUENCE:1");

    // --- A title-only edit resends but must NOT re-ask -------------------------
    await page.goto("/calendar");
    await page
      .getByRole("button", { name: /Standup/ })
      .first()
      .click();
    const renamer = page.getByRole("dialog");
    await renamer.getByTestId("event-title").fill("Stand-up");
    await renamer.getByTestId("event-save").click();
    await expect(renamer).toBeHidden();

    await expect
      .poll(
        async () => (await getInvitationJobs(guest)).some((job) => job.eventTitle === "Stand-up"),
        { timeout: 15_000 },
      )
      .toBe(true);
    const renamed = (await getInvitationJobs(guest)).find(
      (job) => job.kind === "update" && job.eventTitle === "Stand-up",
    );
    // The assertion that fails if the three change booleans ever collapse into one level:
    // a typo fix would then mark every guest stale.
    expect(renamed?.reask).toBe(false);
    expect(renamed?.ics).toContain("SEQUENCE:2");

    // --- Revoking the guest kills the link, indistinguishably ------------------
    await page.goto("/calendar");
    await page
      .getByRole("button", { name: /Stand-up/ })
      .first()
      .click();
    const remover = page.getByRole("dialog");
    await remover.getByRole("button", { name: `Remove ${guest}` }).click();
    await remover.getByTestId("event-save").click();
    await expect(remover).toBeHidden();
    expect(await getAttendeeStatus(eventId as string, guest)).toBeNull();

    const revoked = await guestContext.newPage();
    const revokedResponse = await revoked.goto(rsvpUrl);
    // 200, never 404: a 404 would answer "does this invitation exist?" for anyone asking.
    expect(revokedResponse?.status()).toBe(200);
    await expect(
      revoked.getByRole("heading", { name: "This invitation link is no longer valid" }),
    ).toBeVisible();
    await expect(revoked.getByTestId("rsvp-accepted")).toBeHidden();
    await revoked.close();

    // A never-valid token renders the identical page — same status, same copy.
    const forged = await guestContext.newPage();
    const forgedResponse = await forged.goto(`${new URL(rsvpUrl).origin}/rsvp/${"A".repeat(73)}`);
    expect(forgedResponse?.status()).toBe(200);
    await expect(
      forged.getByRole("heading", { name: "This invitation link is no longer valid" }),
    ).toBeVisible();
    await forged.close();
  } finally {
    await guestContext.close();
  }
});
