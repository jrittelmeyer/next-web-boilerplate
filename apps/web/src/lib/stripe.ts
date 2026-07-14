import "server-only";
import Stripe from "stripe";

// `apiVersion` is pinned to the exact string the installed `stripe` SDK major
// (v22) is generated against, so request/response shapes stay deterministic and
// the SDK's TypeScript types match the wire format. Bump this in lockstep when
// upgrading the `stripe` major (read it from `stripe/cjs/apiVersion.js`).
const STRIPE_API_VERSION = "2026-05-27.dahlia";

// Unlike the Resend client (which only warns on a missing key), `new Stripe("")`
// throws — so we cannot construct eagerly at import time without breaking the
// "builds/runs without Stripe creds" guarantee. Instead the client is a lazily
// initialized singleton: importing this module is cheap and key-free; the throw
// only happens if something actually reaches for the client while unconfigured.
// Callers should gate on `isStripeConfigured()` first and degrade gracefully.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set — Stripe is not configured.");
    }
    client = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true });
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
