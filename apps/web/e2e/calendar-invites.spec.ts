import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";
import {
  deleteCalendarFixtures,
  getAttendeeStatus,
  getAttendeeUserId,
  seedAttendee,
  seedCalendar,
  seedEvents,
  setEmailVerified,
  setUserTimeZone,
} from "./support/db";

/**
 * The Phase-3 invitation loop, across two real accounts: invite → live on the guest's feed
 * → accept → live on the organizer's feed → the guest can read the event they were invited
 * to, **and only that one**.
 *
 * **Two signups, and the shape is built around that budget.** `/sign-up/email` is 5 per
 * 60 s, sliding, DB-backed and keyed `<ip>|<path>`, shared by every worker and both web
 * servers; the suite already spends most of it. CI retries are 2, so one flaky run of this
 * file costs up to six signups — which is why it is a single `test()` rather than four, and
 * why the second invitation is seeded rather than driven.
 *
 * **Each context gets a SECOND page, parked on `/notifications` and never navigated.**
 * `NotificationsFeed` mounts in exactly one place, so the page that drives the invite has
 * no EventSource open by the time the response comes back — an earlier draft of this shape
 * asserted a live push against a page that was not listening. A second page in the same
 * context is the same session, so it costs no signup.
 *
 * **Both parked pages wait for the "Live" badge before anything is sent.** Delivery is
 * at-least-once *while connected*: a NOTIFY that lands before `bus.subscribe` runs is gone,
 * and the failure would look like a missing feature.
 *
 * ⚠️ **`/calendar/event/[id]` answers HTTP 200 for a refusal.** The route is
 * partially-prerendered, so the shell flushes before the dynamic segment reaches
 * `notFound()` — measured, and true for a nonexistent id too. The refusal below is
 * therefore asserted on rendered CONTENT. A `status() === 404` assertion would fail for the
 * wrong reason and read like an ACL hole.
 */

test.describe.configure({ mode: "serial" });

const organizer = makeTestUser("invite-organizer");
const guest = makeTestUser("invite-guest");

let contextA: BrowserContext;
let contextB: BrowserContext;
/** The organizer's driving page, and their parked feed. */
let pageA: Page;
let feedA: Page;
/** The guest's driving page, and their parked feed. */
let pageB: Page;
let feedB: Page;

/** Every non-200 tRPC response either page sees. A 429 renders as an EMPTY LIST. */
const trpcStatuses: string[] = [];

function watchTrpc(page: Page) {
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/trpc/") && response.status() !== 200) {
      trpcStatuses.push(`${response.status()} ${url.slice(url.indexOf("/api/trpc/"), 120)}`);
    }
  });
}

test.beforeAll(async ({ browser }) => {
  contextA = await browser.newContext();
  pageA = await contextA.newPage();
  watchTrpc(pageA);
  await signUp(pageA, organizer); // signup 1 of 2
  await setUserTimeZone(organizer.email, "UTC");

  contextB = await browser.newContext();
  pageB = await contextB.newPage();
  watchTrpc(pageB);
  await signUp(pageB, guest); // signup 2 of 2
  await setUserTimeZone(guest.email, "UTC");
  // **The guest is verified; the organizer deliberately is not.** In-app invitations are
  // a verified-accounts feature — an address nobody has proved resolves to no account and
  // stays an external row (audit F6) — and these lanes run email-unconfigured, so nothing
  // would ever set this flag on its own. The organizer needs no verification: they own
  // the calendar, and every flow they drive answers by `user_id`, never by address. That
  // asymmetry is what the assertion after the save is for.
  await setEmailVerified(guest.email);

  // The parked feeds. Never navigated again, so anything that appears on them arrived
  // over the open EventSource and nowhere else.
  feedA = await contextA.newPage();
  feedB = await contextB.newPage();
  await feedA.goto("/notifications");
  await feedB.goto("/notifications");
  await expect(feedA.getByText("Live", { exact: true })).toBeVisible();
  await expect(feedB.getByText("Live", { exact: true })).toBeVisible();

  const calendarId = await seedCalendar(organizer.email, {
    name: "Invites",
    timeZone: "UTC",
    isPrimary: true,
  });

  // The day is read off the grid rather than computed from the clock: the grid opens on
  // *its* idea of today, and the 15th of whatever month it is showing is in-month on every
  // run without any zone reasoning. Seeding a date this file worked out itself would be one
  // month-boundary away from an empty grid and a mystifying failure.
  await pageA.goto("/calendar");
  await pageA.getByRole("grid").waitFor();
  const dates = await pageA
    .locator('[data-testid="calendar-day-cell"][data-in-month="true"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-date") ?? ""));
  const day = dates.find((date) => date.endsWith("-15"));
  if (!day) throw new Error("the grid showed no 15th");

  await seedEvents(calendarId, [
    { title: "Standup", startWall: `${day} 09:00:00`, endWall: `${day} 09:30:00`, timeZone: "UTC" },
    { title: "Retro", startWall: `${day} 11:00:00`, endWall: `${day} 11:30:00`, timeZone: "UTC" },
    {
      title: "Private planning",
      startWall: `${day} 14:00:00`,
      endWall: `${day} 14:30:00`,
      timeZone: "UTC",
    },
  ]);
});

test.afterAll(async () => {
  await deleteCalendarFixtures(organizer.email);
  await contextA?.close();
  await contextB?.close();
});

test("an invitation arrives live, is answered, and grants read on that event alone", async () => {
  // One long linear flow across four pages, deliberately not split: every `test()` costs a
  // signup, and a retry re-runs `beforeAll`.
  test.setTimeout(180_000);

  await pageA.reload();
  await pageA.getByRole("grid").waitFor();
  const standupId = await eventId(pageA, "Standup");
  const retroId = await eventId(pageA, "Retro");
  const privateId = await eventId(pageA, "Private planning");
  // Chips answer with their MASTER's id, which is the id attendees hang off.
  expect(new Set([standupId, retroId, privateId]).size).toBe(3);

  // A second invitation, seeded out of band, so the accept below can be shown to touch
  // exactly one row. It also gives the list something to order.
  await seedAttendee(retroId, guest.email);

  // --- The one UI-driven write: invite the guest to Standup ------------------
  await pageA.locator('[data-testid="calendar-event-chip"]').filter({ hasText: "Standup" }).click();
  const composer = pageA.getByRole("dialog");
  await composer.getByTestId("event-save").waitFor();
  await composer.getByTestId("event-attendees").fill(guest.email);
  await composer.getByTestId("event-attendees").press("Enter");
  // Enter adds a chip; without the composer's `preventDefault` it would submit the form
  // with an empty guest list instead, which is a silent no-op rather than a visible break.
  await expect(composer.getByTestId("event-attendee-chips")).toContainText(guest.email);
  // A second guest in the SAME save: the organizer's own address, which is an unverified
  // account. Free — no extra signup, no extra save — and it is the only automated check
  // that the shipped writer still refuses to resolve an unproved address (audit F6).
  await composer.getByTestId("event-attendees").fill(organizer.email);
  await composer.getByTestId("event-attendees").press("Enter");
  await expect(composer.getByTestId("event-attendee-chips")).toContainText(organizer.email);
  await composer.getByTestId("event-save").click();
  await expect(composer).toBeHidden();

  // Both rows exist; only the proved address became an identity. Read from the column
  // because nothing else can see the difference — same chip, same invitation email, and
  // the unit suite's mocks discard the predicate that decides it. Drop `emailVerified`
  // from `resolveAttendeeUserIds` and this is the assertion that goes red.
  expect(await getAttendeeUserId(standupId, guest.email)).toEqual({
    userId: expect.any(String),
  });
  expect(await getAttendeeUserId(standupId, organizer.email)).toEqual({ userId: null });

  // --- The guest's parked feed receives it live ------------------------------
  const invited = `${organizer.email} invited you to Standup`;

  // The toast first, because it is the ephemeral one — sonner dismisses it after a few
  // seconds. It is also the render path that regressed once already: before the two-slot
  // `body` contract it printed the actor's bare email address.
  await expect(feedB.locator("[data-sonner-toast]").filter({ hasText: invited })).toBeVisible();

  // …and the durable one: a feed row on a page that has never navigated or reloaded. The
  // row is a `next/link` to the event, which is `notifications.link` surviving the Zod
  // regex, the `notifications_link_same_origin` CHECK and the locale-aware `Link`.
  const inviteRow = feedB.getByRole("listitem").filter({ hasText: invited });
  await expect(inviteRow).toHaveCount(1);
  await expect(inviteRow.getByRole("link")).toHaveAttribute(
    "href",
    new RegExp(`/calendar/event/${standupId}$`),
  );

  // --- The guest answers, from /calendar/invites -----------------------------
  await pageB.goto("/calendar/invites");
  const invites = pageB.getByTestId("invites-list");
  await expect(invites.locator("li")).toHaveCount(2);
  // Soonest first — `listInvites` orders `(start_at, id)` ascending and applies no time
  // filter, so an invitation's position never depends on the request clock.
  await expect(invites.locator("li").first()).toContainText("Standup");

  // Scoped to the row: with two invitations on screen there are two of every RSVP button,
  // and a bare `getByTestId` would be a strict-mode violation.
  const standupInvite = invites.locator("li").filter({ hasText: "Standup" });
  await standupInvite.getByTestId("rsvp-accepted").click();
  await expect(pageB.getByText("You are going.")).toBeVisible();
  await expect(standupInvite.getByTestId("rsvp-accepted")).toHaveAttribute("aria-pressed", "true");

  // Postgres, not the optimistic button: the answer landed on the row it was for, and
  // `respondToEvent`'s UPDATE reached no other invitation this person holds.
  expect(await getAttendeeStatus(standupId, guest.email)).toBe("accepted");
  expect(await getAttendeeStatus(retroId, guest.email)).toBe("needs-action");

  // --- The organizer's parked feed hears about it live -----------------------
  const accepted = `${guest.email} accepted Standup`;
  await expect(feedA.locator("[data-sonner-toast]").filter({ hasText: accepted })).toBeVisible();
  await expect(feedA.getByRole("listitem").filter({ hasText: accepted })).toHaveCount(1);

  // --- Attendance grants read on THAT event, and nothing else ----------------
  // The reason `getEventAccess` exists: before it, both this route and `calendar.byId`
  // authorized on `calendars.user_id = me`, so an invitee got `notFound()` on the very
  // event they were invited to.
  await pageB.goto(`/calendar/event/${standupId}`);
  await expect(pageB.getByRole("heading", { name: "Standup" })).toBeVisible();
  const guestList = pageB.getByTestId("event-guest-list");
  await expect(guestList).toContainText(guest.email);
  await expect(guestList).toContainText("Going");

  // The other event on the same calendar, owned by the same organizer, with no attendee
  // row for this person. Access is per EVENT, not per calendar — and the refusal is
  // asserted on content because the route answers 200 (see the file docblock).
  await pageB.goto(`/calendar/event/${privateId}`);
  await expect(pageB.getByText("Page not found")).toBeVisible();
  await expect(pageB.getByText("Private planning")).toHaveCount(0);

  // A 429 on any of the reads above renders as an empty list with no message, which is
  // indistinguishable from "there was nothing there" — the trap `calendar.spec.ts` already
  // paid for. `listInvites` shares the same 20/min per-user calendar budget.
  expect(trpcStatuses.join("\n")).toBe("");
});

/** A seeded event's master id, read off its grid chip — `seedEvents` returns void. */
async function eventId(page: Page, title: string): Promise<string> {
  const id = await page
    .locator('[data-testid="calendar-event-chip"]')
    .filter({ hasText: title })
    .first()
    .getAttribute("data-event-id");
  if (!id) throw new Error(`no grid chip for "${title}"`);
  return id;
}
