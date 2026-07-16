import { recordEmailSuppression, type SuppressionReason } from "@repo/db";
import { getResend, isEmailConfigured, type WebhookEventPayload } from "@repo/email";
import { clientIpFromHeaders, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// Resend's `webhooks.verify` is sync pure crypto (HMAC via the bundled
// standardwebhooks) using Node's crypto-adjacent primitives. cacheComponents bans the
// `runtime` route-segment config, so we rely on Next 16's Node-default route runtime
// here — same posture as the Stripe webhook route.

/**
 * Record every recipient of the event into the do-not-send list. Resend events carry
 * `to: string[]`; each address gets its own row (the helper lowercases + upserts).
 * A throw here surfaces as a 500 → Resend redelivers with backoff, which is the
 * at-least-once behavior we want for a failed suppression write.
 */
async function recordSuppressions(
  to: string[],
  reason: SuppressionReason,
  detail: string | undefined,
  emailId: string,
): Promise<void> {
  for (const email of to) {
    await recordEmailSuppression({ email, reason, detail: detail ?? null, emailId });
  }
}

export async function POST(req: Request): Promise<Response> {
  // Rate-limit before any work (signature verification, config checks) so a flood
  // can't burn CPU on crypto — the Stripe webhook's exact scheme, in a SEPARATE
  // `resend-webhook:` bucket so a burst on one provider's endpoint can never 429 the
  // other. Generous per-IP ceiling (Resend/svix deliveries can burst); IP-less
  // requests are abnormal and share a tighter bucket. Throttle-not-deny: see the
  // Stripe route for the fail-closed alternative.
  const ip = clientIpFromHeaders(req.headers);
  const limit = ip
    ? await rateLimit(`resend-webhook:${ip}`, { limit: 100, windowSec: 60 })
    : await rateLimit("resend-webhook:noip", { limit: 20, windowSec: 60 });
  if (!limit.success) {
    return new Response("Too many requests.", {
      status: 429,
      headers: rateLimitHeaders(limit),
    });
  }

  // Graceful degradation: without Resend creds there is nothing to suppress for, and
  // without the signing secret we can't authenticate a delivery — refuse rather than
  // record unverified events. RESEND_WEBHOOK_SECRET is the svix signing secret
  // (whsec_…) from the Resend dashboard → Webhooks (see SERVICES.md → Resend).
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!isEmailConfigured() || !webhookSecret) {
    return new Response("Resend webhook is not configured.", { status: 503 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix signature headers.", { status: 400 });
  }

  // The signature is computed over the exact raw bytes, so read the body as text
  // (never the parsed JSON) before handing it to `verify`.
  const body = await req.text();

  let event: WebhookEventPayload;
  try {
    event = getResend().webhooks.verify({
      payload: body,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  // Past this point the event is verified as genuinely from Resend. Deliverability
  // events feed the `email_suppressions` do-not-send list (packages/db), which the
  // @repo/email send helper consults before every configured send — see
  // SERVICES.md → Resend (bounce/complaint handling) + DATABASE.md.
  switch (event.type) {
    case "email.bounced": {
      // Only a PERMANENT (hard) bounce suppresses — a full mailbox or a transient
      // provider hiccup must not block the address forever. Compared
      // case-insensitively: Resend's docs/types leave the non-permanent naming
      // loose (Temporary/Transient), but "Permanent" is the stable discriminator.
      const { bounce, to, email_id } = event.data;
      if (bounce.type.toLowerCase() !== "permanent") {
        console.info(
          `[resend-webhook] ${bounce.type} bounce for ${to.join(", ")} — not suppressing (${bounce.message})`,
        );
        break;
      }
      await recordSuppressions(to, "bounce", bounce.message, email_id);
      break;
    }
    case "email.complained": {
      // The recipient marked the message as spam — never email them again.
      await recordSuppressions(event.data.to, "complaint", undefined, event.data.email_id);
      break;
    }
    case "email.suppressed": {
      // Resend refused the send because the address is on THEIR account-level
      // suppression list — mirror it locally so our sends stop attempting too.
      const { suppressed, to, email_id } = event.data;
      await recordSuppressions(to, "provider", suppressed.message, email_id);
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
