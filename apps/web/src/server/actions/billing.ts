"use server";

import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { db, subscriptions } from "@repo/db";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { env } from "@/env";
import { rateLimit } from "@/lib/rate-limit";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

type ActionResult = { error: string } | { data: { url: string } };

/**
 * The user's most recent recorded subscription row — the user↔Stripe-customer
 * link (`stripeCustomerId` lives ONLY on these rows, written by the webhook; see
 * DECISIONS.md). "Latest created" is the reuse policy (P2-4): the active
 * subscription is in practice the newest row, and reusing ANY recorded customer
 * id prevents duplicate Stripe customers, so the simple deterministic pick wins.
 */
async function latestSubscriptionFor(userId: string) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
    orderBy: [desc(subscriptions.createdAt)],
    columns: { id: true, stripeCustomerId: true },
  });
}

/**
 * Example "Subscribe" action (scaffold, not real billing logic): creates a
 * hosted Stripe Checkout Session and returns its URL for a client redirect.
 * Gated on an authenticated session (AUTH.md) and degrades gracefully when
 * Stripe is unconfigured, so the boilerplate runs without test keys.
 *
 * Uses inline `price_data` so it's self-contained — no pre-created Price in the
 * Stripe Dashboard is required to exercise the flow. Swap to a real `price` ID
 * (e.g. from a `STRIPE_PRICE_ID` env) when wiring an actual product.
 */
export async function createCheckoutSession(): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  // Rate-limit per user: creating Checkout Sessions hits Stripe's API, so cap it to
  // a few per minute to blunt accidental double-clicks and abuse. Server Actions
  // return values (they can't set a 429 status), so the limit surfaces as a typed
  // error the UI already handles. Checked before the config gate so it's exercised
  // even without Stripe keys. In-memory by default; distributed with Upstash env.
  const limit = await rateLimit(`checkout:${session.user.id}`, { limit: 5, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  if (!isStripeConfigured()) {
    return { error: "Stripe is not configured (set STRIPE_SECRET_KEY)." };
  }

  // Repeat checkout? Reuse the recorded Stripe customer instead of prefilling an
  // email — otherwise every checkout mints a NEW Stripe customer for the same user
  // (P2-4a). `customer` and `customer_email` are mutually exclusive on the API, so
  // exactly one is sent.
  const existing = await latestSubscriptionFor(session.user.id);

  let checkout: Awaited<ReturnType<ReturnType<typeof getStripe>["checkout"]["sessions"]["create"]>>;
  try {
    checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      ...(existing
        ? { customer: existing.stripeCustomerId }
        : { customer_email: session.user.email }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 1000,
            recurring: { interval: "month" },
            product_data: { name: "Example Pro Plan" },
          },
        },
      ],
      success_url: `${env.BETTER_AUTH_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.BETTER_AUTH_URL}/billing`,
      metadata: { userId: session.user.id },
    });
  } catch (err) {
    // A thrown create is reachable in normal operation once we reuse customer ids —
    // e.g. the recorded customer was deleted in the Stripe Dashboard. Surface the
    // typed error instead of an opaque masked Server Action failure.
    log.warn("billing.checkout stripe error", {
      userId: session.user.id,
      error: err instanceof Error ? err.message : err,
    });
    return { error: "Could not start checkout. Please try again." };
  }

  if (!checkout.url) return { error: "Stripe did not return a checkout URL." };
  return { data: { url: checkout.url } };
}

/**
 * "Manage billing" action (P2-4b): creates a Stripe customer-portal session for
 * the caller's recorded Stripe customer and returns its short-lived URL for a
 * client redirect. The portal is Stripe-hosted (update payment method, cancel,
 * view invoices) — no client SDK, same redirect posture as checkout.
 *
 * Requires a recorded subscription row (the button only renders with one, but a
 * Server Action is a public endpoint — it must gate itself). NOTE: the portal
 * needs a saved customer-portal configuration in the Stripe Dashboard; test mode
 * ships a default, live mode errors until one is saved (see SERVICES.md).
 */
export async function createBillingPortalSession(): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Unauthorized" };

  // Same posture as checkout: one Stripe API call returning a redirect URL, so the
  // same 5/min per-user cap, checked before the config gate.
  const limit = await rateLimit(`billing-portal:${session.user.id}`, { limit: 5, windowSec: 60 });
  if (!limit.success) {
    return { error: "Too many requests. Please wait a moment and try again." };
  }

  if (!isStripeConfigured()) {
    return { error: "Stripe is not configured (set STRIPE_SECRET_KEY)." };
  }

  const existing = await latestSubscriptionFor(session.user.id);
  if (!existing) return { error: "No billing history for this account." };

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: existing.stripeCustomerId,
      return_url: `${env.BETTER_AUTH_URL}/billing`,
    });
    return { data: { url: portal.url } };
  } catch (err) {
    log.warn("billing.portal stripe error", {
      userId: session.user.id,
      error: err instanceof Error ? err.message : err,
    });
    return { error: "Could not open the billing portal. Please try again." };
  }
}
