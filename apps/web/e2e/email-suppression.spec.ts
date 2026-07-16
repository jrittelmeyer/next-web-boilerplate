import { expect, test } from "@playwright/test";
import { resetMagicLinkRateLimit } from "./support/db";
import { waitForCapturedEmail } from "./support/email-capture";
import { signResendWebhook } from "./support/resend-webhook";

// Email bounce/complaint suppression E2E (path-to-100 #8). Runs ONLY in the
// `chromium-email` project against the :3001 email-capture server, which also
// carries the fake RESEND_WEBHOOK_SECRET (playwright.config.ts) — so this drives the
// REAL chain end-to-end with no provider and no network: a SELF-SIGNED Permanent
// bounce through the route's actual svix HMAC verification → `email_suppressions`
// row → the send helper's consult skips the suppressed recipient (no capture file)
// while a control recipient still gets its send captured. CI-honest, no new dep.
//
// NOTE: suppression rows persist across runs by design (the do-not-send list has no
// cleanup cascade), so every run uses unique per-run addresses.

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Same reset as magic-link.spec.ts: the DB-persisted 3/min send limiter would
  // otherwise carry counts across back-to-back local runs / serial retries. We do
  // NOT reset the capture dir here — magic-link.spec.ts may run concurrently in
  // this project and poll it; per-run unique addresses make sharing safe.
  await resetMagicLinkRateLimit();
});

test("a permanent bounce suppresses future sends; a control address still sends", async ({
  page,
  request,
}) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const bounced = `e2e-suppressed-${unique}@example.com`;
  const control = `e2e-suppress-control-${unique}@example.com`;

  // 1) Deliver a signed Permanent-bounce event, exactly as Resend/svix would.
  //    The signature covers the raw bytes, so serialize once and sign that string.
  const body = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      created_at: new Date().toISOString(),
      email_id: `e2e-bounce-${unique}`,
      from: "E2E <e2e@example.com>",
      to: [bounced],
      subject: "Welcome!",
      bounce: {
        message: "The recipient's email provider rejected the message permanently.",
        subType: "General",
        type: "Permanent",
      },
    },
  });
  const webhookResponse = await request.post("/api/resend/webhook", {
    headers: signResendWebhook(body),
    data: body,
  });
  expect(webhookResponse.status()).toBe(200);
  expect(await webhookResponse.json()).toEqual({ received: true });

  // A tampered replay must be rejected by the same verification path (sanity-check
  // that the 200 above actually came from a VERIFIED delivery, not a permissive route).
  const tampered = await request.post("/api/resend/webhook", {
    headers: { ...signResendWebhook(body), "svix-signature": "v1,dGFtcGVyZWQ=" },
    data: body,
  });
  expect(tampered.status()).toBe(400);

  // 2) Request a magic link for the SUPPRESSED address. The UI must stay neutral
  //    ("Check your inbox" — no enumeration of suppression state)…
  await page.goto("/login");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByLabel("Email").fill(bounced);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();

  // 3) …then request one for the CONTROL address the same way.
  await page.goto("/login");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByLabel("Email").fill(control);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();

  // 4) The control's send IS captured. Sends are processed in request order, so once
  //    it lands, the earlier suppressed request has already taken its path — asserting
  //    "no capture for the bounced address" needs no arbitrary settle time.
  const captured = await waitForCapturedEmail(control);
  expect(captured.action).toBe("magic-link sign-in");

  // 5) The suppressed address produced NO capture file: the consult short-circuited
  //    the send before the capture seam (packages/email/src/send.tsx order).
  await expect(waitForCapturedEmail(bounced, 1_000)).rejects.toThrow(/No captured email/);
});
