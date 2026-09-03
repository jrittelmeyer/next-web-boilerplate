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
/**
 * No account, ever — that is the point of the phase. ⚠️ Also load-bearing for the
 * cancellation-fan-out sensor at the bottom: an external's attendee row carries
 * `user_id NULL`, which is exactly what the bare-`ne()` regression (audit F4) drops.
 * Give this guest an account and that sensor stops discriminating.
 */
const guest = `rsvp-guest-${Date.now()}@example.com`;

/**
 * The 15th of the current month, so the chip is on the grid the page opens on.
 * "Current" means in `EVENT_ZONE`, not the runner's clock: `/calendar` opens on
 * today in the organizer's stored zone (`calendar/page.tsx` →
 * `instantToCivil(Date.now(), preferences.timeZone)`), so deriving this from
 * runner-local UTC goes red for 00:00-04:00 UTC on the 1st of every month, when
 * the runner has already rolled to the new month but the grid hasn't (diagnosed
 * 2026-09-01, `3e68733`). `now` is injectable so the proof below can pin that
 * exact failing instant instead of waiting for or faking the real date.
 */
function dayInThisMonth(hour: number, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; slicing off the day keeps the fixed "15th" below —
  // only the year/month should track `now`, not the actual day it's called on.
  const yearMonth = new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_ZONE })
    .format(now)
    .slice(0, 7);
  return `${yearMonth}-15T${String(hour).padStart(2, "0")}:00`;
}

test("dayInThisMonth derives the month in EVENT_ZONE, not the runner's UTC clock", () => {
  // 2026-09-01T02:37:00Z is the exact instant `3e68733` attempt 1 went red on: UTC has
  // already rolled to September, but America/New_York is still 2026-08-31 22:37, which
  // is what the grid (opened on August) actually shows. The old runner-clock logic
  // returned "2026-09-15…", off by a month from what was on screen.
  const utcMidnightAfterMonthRoll = new Date("2026-09-01T02:37:00Z");
  expect(dayInThisMonth(9, utcMidnightAfterMonthRoll)).toBe("2026-08-15T09:00");
});

test.afterAll(async () => {
  await deleteInvitationJobs(guest);
  await deleteCalendarFixtures(organizer.email);
});

test("an external guest is invited, answers signed-out, and is re-asked when the time moves", async ({
  page,
  browser,
}) => {
  // 180s covered the original flow; the deletion sensor adds three UI round-trips
  // and two queue polls.
  test.setTimeout(210_000);
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

    // The email's Yes/No/Maybe carry `?intent=`, which must survive the token-for-cookie
    // redirect or the preselect the templates promise silently never happens. It only
    // PRESELECTS — a mail scanner following the link must not record an answer — so the
    // stored status is still untouched here.
    const preselected = await guestPage.goto(`${guestPage.url()}?intent=accepted`);
    expect(preselected?.status()).toBe(200);
    await expect(guestPage.getByTestId("rsvp-accepted")).toHaveAttribute("aria-pressed", "true");
    expect(await getAttendeeStatus(eventId as string, guest)).toBe("needs-action");

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

    // --- Deleting the event tells the guest whose ONLY notice is the email ------
    // The sensor audit 08-06 F2 asked for. `softDeleteEvent`'s recipient predicate
    // (calendar.ts:1745) is NULL-safe — `or(isNull(user_id), ne(user_id, actor))` —
    // and an external guest sits in the `isNull` arm. Revert it to a bare `ne()` and
    // `NULL <> $actor` filters them out of `guestEmails`, so the `reason:"cancelled"`
    // job below is never enqueued and the poll times out red. First, re-add the guest
    // (the revoke step above removed their row).
    await page.goto("/calendar");
    await page
      .getByRole("button", { name: /Stand-up/ })
      .first()
      .click();
    const readder = page.getByRole("dialog");
    await readder.getByTestId("event-attendees").fill(guest);
    await readder.getByTestId("event-attendees").press("Enter");
    await expect(readder.getByTestId("event-attendee-chips")).toContainText(guest);
    await readder.getByTestId("event-save").click();
    await expect(readder).toBeHidden();

    // A second invite means the re-added row exists and has a fresh token.
    await expect
      .poll(
        async () => (await getInvitationJobs(guest)).filter((job) => job.kind === "invite").length,
        { timeout: 15_000 },
      )
      .toBe(2);
    await page.goto(`/calendar/event/${eventId}`);
    const readdedLink = page.getByTestId(`rsvp-link-${guest}`);
    await expect(readdedLink).toBeVisible();
    const readdedRsvpUrl = await readdedLink.inputValue();

    // A one-off has no scopes, so the delete button deletes directly — no chooser.
    await page.goto("/calendar");
    await page
      .getByRole("button", { name: /Stand-up/ })
      .first()
      .click();
    const deleter = page.getByRole("dialog");
    await deleter.getByTestId("event-delete").click();
    await expect(deleter).toBeHidden();

    // `reason:"cancelled"` distinguishes the deletion from the earlier REMOVAL cancel
    // (`reason:"removed"`, no attachment) still sitting in the queue from the revoke step.
    await expect
      .poll(
        async () =>
          (await getInvitationJobs(guest)).some(
            (job) => job.kind === "cancel" && job.reason === "cancelled",
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
    const cancel = (await getInvitationJobs(guest)).find(
      (job) => job.kind === "cancel" && job.reason === "cancelled",
    );
    const cancelIcs = cancel?.ics ?? "";
    // STATUS:CANCELLED is derived from `deleted_at` at emission time, and the SEQUENCE
    // must have risen past the rename's 2 or a conforming client ignores the attachment.
    expect(cancelIcs).toContain("METHOD:PUBLISH");
    expect(cancelIcs).toContain("STATUS:CANCELLED");
    expect(Number(/SEQUENCE:(\d+)/.exec(cancelIcs)?.[1])).toBeGreaterThanOrEqual(3);

    // And the re-added guest's link dies with the event: the RSVP landing read carries
    // `isNull(calendar_events.deleted_at)` (server/calendar/rsvp.ts) — this is its
    // behavioral sensor, same indistinguishable copy as revoked and forged above.
    const dead = await guestContext.newPage();
    const deadResponse = await dead.goto(readdedRsvpUrl);
    expect(deadResponse?.status()).toBe(200);
    await expect(
      dead.getByRole("heading", { name: "This invitation link is no longer valid" }),
    ).toBeVisible();
    await dead.close();
  } finally {
    await guestContext.close();
  }
});
