import { expect, test } from "@playwright/test";
import { makeTestUser, signIn, signUp } from "./support/auth";
import { seedNotifications } from "./support/db";

// Realtime notifications over SSE (Tier 4 · A22), driven across TWO browser contexts —
// two real signed-in devices for the SAME user. The proof of the realtime path: device
// B triggers `sendTestNotification`, and device A — which never reloads — receives the
// notification LIVE over its open EventSource. Two connections served by the one
// process's single Postgres LISTEN client + per-user registry exercises the exact
// NOTIFY → listener → in-process fan-out path. DB-backed → e2e lane.

test("a notification sent from one device appears live on another", async ({ browser }) => {
  const user = makeTestUser("notifications");

  // Device A signs up (first session) and opens the feed.
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signUp(pageA, user);
  await pageA.goto("/notifications");

  // Device B signs in (second session) and opens the feed.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, user);
  await pageB.goto("/notifications");

  // A starts empty and its stream must be connected before we send, so the push can't
  // race ahead of the subscription. The status badge flips to "Live" once EventSource
  // opens.
  await expect(pageA.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(pageA.getByText("Live", { exact: true })).toBeVisible();
  const items = pageA.getByRole("listitem").filter({ hasText: "Test notification" });
  await expect(items).toHaveCount(0);

  // B sends a test notification (also waits for B's own stream to be live first).
  await expect(pageB.getByText("Live", { exact: true })).toBeVisible();
  await pageB.getByRole("button", { name: "Send test notification" }).click();

  // A — which has NOT navigated or reloaded — receives it live over SSE: a new unread
  // row appears and the unread badge lights up. The badge reads the AUTHORITATIVE
  // notification.unreadCount, which the SSE push invalidates → refetches. `expect`
  // auto-retries until the push lands.
  await expect(items).toHaveCount(1);
  await expect(pageA.getByText(/1 unread/)).toBeVisible();

  // The sender's own tab also receives its notification through the realtime channel.
  await expect(pageB.getByRole("listitem").filter({ hasText: "Test notification" })).toHaveCount(1);

  // A second send: the badge climbs to 2 as the second push invalidates + refetches the
  // server count — proving the badge is sourced from notification.unreadCount and its
  // invalidation fires on every push, not just the first.
  await pageB.getByRole("button", { name: "Send test notification" }).click();
  await expect(items).toHaveCount(2);
  await expect(pageA.getByText(/2 unread/)).toBeVisible();

  // Marking all read on A clears its unread badge: markAllRead sets the authoritative
  // unread count straight to 0 (setQueryData), no reload.
  await pageA.getByRole("button", { name: "Mark all read" }).click();
  await expect(pageA.getByText(/unread/)).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});

// Reconnect backfill (Tier 4 · A23). While A's EventSource is dropped, the server tears
// down A's subscription, so a notification B sends in that gap is NEVER pushed to A. The
// proof of the backfill: when A's stream re-opens it invalidates the feed query, so the
// missed row appears WITHOUT a reload — it could only arrive via the reconnect backfill,
// since it was never delivered live. Fails without A23.
//
// The drop is driven at the network edge, not with `context.setOffline()` — CDP offline
// emulation doesn't sever an established localhost keep-alive stream. A's FIRST connect is
// served a self-closing response so EventSource opens (latching the component's
// `hasConnected` flag) then retries; that retry is HELD open by a gate so B's send lands
// in the gap, then released so the reconnect hits the real server and triggers the backfill.
test("a notification missed while offline is backfilled on reconnect", async ({ browser }) => {
  const user = makeTestUser("notif-backfill");

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signUp(pageA, user);

  let connectAttempts = 0;
  let releaseReconnect: () => void = () => {};
  const reconnectHeld = new Promise<void>((resolve) => {
    releaseReconnect = resolve;
  });
  await pageA.route("**/api/notifications/stream", async (route) => {
    connectAttempts += 1;
    if (connectAttempts === 1) {
      // Open-then-close: a valid but immediately-ended SSE response. EventSource fires
      // `onopen` (so the component latches hasConnected = true) then auto-reconnects.
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: ": connected\n\n",
      });
      return;
    }
    // Hold the first reconnect open so A stays disconnected across B's send; later
    // reconnects (after release) pass straight through to the real stream.
    if (connectAttempts === 2) await reconnectHeld;
    await route.continue();
  });

  await pageA.goto("/notifications");

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, user);
  await pageB.goto("/notifications");

  // A opened then dropped and its reconnect is held: it shows the offline state and its
  // feed is still empty (nothing was ever delivered to it).
  await expect(pageA.getByText(/Reconnecting/)).toBeVisible({ timeout: 15_000 });
  const itemsA = pageA.getByRole("listitem").filter({ hasText: "Test notification" });
  await expect(itemsA).toHaveCount(0);

  // B (live) sends while A's stream is down — A gets no push (its reconnect is held open).
  await expect(pageB.getByText("Live", { exact: true })).toBeVisible();
  await pageB.getByRole("button", { name: "Send test notification" }).click();
  await expect(pageB.getByRole("listitem").filter({ hasText: "Test notification" })).toHaveCount(1);

  // Release A's reconnect: it hits the real server, `onopen` fires again, and the re-open
  // backfill invalidates the feed — the row B sent during the gap now appears on A even
  // though it was never pushed there. This can ONLY arrive via the reconnect backfill.
  releaseReconnect();
  await expect(pageA.getByText("Live", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(itemsA).toHaveCount(1, { timeout: 15_000 });
  await expect(pageA.getByText(/1 unread/)).toBeVisible();

  await contextA.close();
  await contextB.close();
});

// Keyset "Load more" (Tier 4 · A25). The feed shows the first NOTIFICATIONS_PAGE_SIZE (20)
// rows; older ones are reachable via the (created_at, id) cursor. Seed > 20 rows directly
// (far faster/stabler than 25 live sends), then prove the first page caps at 20, the oldest
// row is initially absent, and "Load more" reveals the second page.
test("older notifications are reachable via 'Load more'", async ({ page }) => {
  const user = makeTestUser("notif-page");
  await signUp(page, user);

  // 25 > NOTIFICATIONS_PAGE_SIZE (20), so the keyset cursor has exactly one more page.
  await seedNotifications(user.email, 25);

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();

  // First page hydrates from the RSC prefetch: exactly 20 rows, and the oldest seeded row
  // (#24) lives on page 2 — not yet fetched, so not in the DOM.
  const rows = page.getByRole("listitem").filter({ hasText: "Seeded notification" });
  await expect(rows).toHaveCount(20);
  await expect(page.getByText("Seeded notification 24", { exact: true })).toHaveCount(0);

  // "Load more" fetches the next keyset page client-side; the older rows append.
  // dispatchEvent rather than click(): the non-modal analytics-consent banner is fixed to
  // the viewport bottom and overlaps this button when PostHog is configured (local .env;
  // absent in CI). A normal (or even force) click dispatches at the button's COORDINATES,
  // which the banner covers — so it lands on the banner. dispatchEvent fires React's
  // onClick directly on the element regardless of the overlay; the 20→25 count assertion
  // below still proves the click actually triggered fetchNextPage.
  await page.getByRole("button", { name: "Load more" }).dispatchEvent("click");
  await expect(rows).toHaveCount(25);
  await expect(page.getByText("Seeded notification 24", { exact: true })).toBeVisible();

  // No third page: getNextPageParam returns null once the cursor is exhausted, so the
  // button unmounts.
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});
