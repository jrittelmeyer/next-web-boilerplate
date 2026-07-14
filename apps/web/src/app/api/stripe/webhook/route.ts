import { db, subscriptions } from "@repo/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { clientIpFromHeaders, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

// Stripe's sync `constructEvent` uses Node's crypto. cacheComponents bans the
// `runtime` route-segment config, so we rely on Next 16's Node-default route runtime
// here — do NOT set a global edge default, or this route loses access to Node crypto.

// Project a Stripe Subscription onto our `subscriptions` columns. In the pinned
// API version (2026-05-27.dahlia) `price` and `current_period_end` live on the
// subscription ITEM, not the top-level subscription — so read them from
// `items.data[0]` (a single-price subscription has exactly one item).
function subscriptionFields(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  return {
    status: sub.status,
    priceId: item?.price.id ?? null,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
  };
}

// A Stripe id field is `string` once the object isn't expanded (our case), or the
// nested object otherwise — normalize to the id string either way.
function idOf(ref: string | { id: string } | null | undefined): string | undefined {
  if (!ref) return undefined;
  return typeof ref === "string" ? ref : ref.id;
}

export async function POST(req: Request): Promise<Response> {
  // Rate-limit before any work (signature verification, config checks) so a flood
  // can't burn CPU on crypto. Keyed by source IP with a generous ceiling — genuine
  // Stripe deliveries arrive from a small set of IPs and can burst, so 100/min
  // passes normal traffic while capping a spoofed flood. In-memory by default;
  // distributed when Upstash env is set (see lib/rate-limit.ts).
  //
  // A genuine delivery always carries a client IP (Stripe → your proxy → app, and
  // any real host's proxy sets x-forwarded-for). So an IP-LESS request is abnormal:
  // route it to a separate, tighter `noip` bucket (20/min) rather than the generous
  // shared `unknown` bucket. We deliberately throttle-not-deny: a hard deny here
  // would break the webhook entirely on a misconfigured no-proxy host. Flip the
  // `noip` branch to `return new Response("...", { status: 400 })` if you run behind
  // a proxy you trust to always set the header and prefer fail-closed.
  const ip = clientIpFromHeaders(req.headers);
  const limit = ip
    ? await rateLimit(`webhook:${ip}`, { limit: 100, windowSec: 60 })
    : await rateLimit("webhook:noip", { limit: 20, windowSec: 60 });
  if (!limit.success) {
    return new Response("Too many requests.", {
      status: 429,
      headers: rateLimitHeaders(limit),
    });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !webhookSecret) {
    return new Response("Stripe is not configured.", { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header.", { status: 400 });
  }

  // The signature is computed over the exact raw bytes, so read the body as text
  // (never the parsed JSON) before handing it to `constructEvent`.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  // Past this point the event is verified as genuinely from Stripe. We persist
  // subscription state into the `subscriptions` table (packages/db) — see
  // docs/context/DATABASE.md + SERVICES.md (Stripe). The `subscriptions` row is
  // keyed by the Stripe subscription id, and `userId` comes from the Checkout
  // Session metadata that `createCheckoutSession` stamps on (server/actions/billing.ts).
  switch (event.type) {
    case "checkout.session.completed": {
      // The row creator: this is the only event that carries our `userId` (via
      // the Checkout Session metadata), so it owns the insert. The session holds
      // the subscription/customer ids but not the subscription's status/period —
      // retrieve the subscription to fill those in, then upsert (idempotent on a
      // redelivered event).
      const checkoutSession = event.data.object;
      const userId = checkoutSession.metadata?.userId;
      const subscriptionId = idOf(checkoutSession.subscription);
      const stripeCustomerId = idOf(checkoutSession.customer);
      if (userId && subscriptionId && stripeCustomerId) {
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        const fields = subscriptionFields(sub);
        await db
          .insert(subscriptions)
          .values({ id: sub.id, userId, stripeCustomerId, ...fields })
          .onConflictDoUpdate({
            target: subscriptions.id,
            set: { stripeCustomerId, ...fields },
          });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // Sync status/price/period on the existing row (created at checkout). These
      // events don't carry our `userId`, so they only UPDATE by subscription id —
      // a no-op if we never recorded the checkout (e.g. a subscription created
      // outside this flow). `deleted` arrives with `status: "canceled"`, so the
      // same projection handles cancellation.
      const sub = event.data.object;
      await db
        .update(subscriptions)
        .set(subscriptionFields(sub))
        .where(eq(subscriptions.id, sub.id));
      break;
    }
    case "invoice.payment_failed": {
      // Dunning sync (P2-4c). In the pinned API version the invoice→subscription
      // ref does NOT live at a top-level `invoice.subscription` (older versions) —
      // it's `invoice.parent.subscription_details.subscription`, absent for
      // non-subscription invoices (one-off / quote-generated), which we skip.
      // The failure's resulting status depends on the account's dunning settings
      // (`past_due` / `canceled` / `unpaid`), so retrieve the subscription and
      // project it rather than hardcoding a status; update-by-id is a no-op if the
      // checkout was never recorded — same posture as `customer.subscription.*`.
      // `customer.subscription.updated` also fires when the status transitions, so
      // this is belt-and-braces immediacy — and the canonical hook a real app
      // extends with dunning email/notification logic.
      const invoice = event.data.object;
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
      if (subscriptionId) {
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        await db
          .update(subscriptions)
          .set(subscriptionFields(sub))
          .where(eq(subscriptions.id, sub.id));
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
