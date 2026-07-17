import Stripe from "stripe";
import { cancelStripeSubscriptionsPayload } from "../queues";

// Keep in lockstep with apps/web/src/lib/stripe.ts (STRIPE_API_VERSION): pin the
// exact apiVersion the installed `stripe` SDK major (v22) is generated against so
// request/response shapes stay deterministic across every Stripe client in the repo.
const STRIPE_API_VERSION = "2026-05-27.dahlia";

/**
 * Process one `cancel-stripe-subscriptions` job (A13; org-aware since #11): cancel
 * a removed owner's Stripe subscriptions. Enqueued by `@repo/auth`'s
 * `user.deleteUser` hooks (account deletion → personal subscriptions) and, since
 * #11, by the organization plugin's delete hooks (org deletion → the org's
 * subscriptions) — either way the local `subscriptions` rows cascade away with the
 * owner, but Stripe keeps billing (the caveat in SERVICES.md → Stripe), so this
 * finishes the cleanup out-of-band. The ids are captured BEFORE the cascade and
 * arrive in the payload, so this handler needs no DB access — only a Stripe client.
 *
 * Policy: cancel IMMEDIATELY. The owner is gone, so "keep access until period end"
 * is meaningless and an ownerless-but-active subscription is a reconciliation hazard;
 * immediate cancellation keeps Stripe's state consistent with the account's. The
 * Stripe CUSTOMER is deliberately left intact so invoice/tax history survives —
 * delete it with `stripe.customers.del(customerId)` if you want no trace. To cancel
 * at period end instead, swap the `.cancel(id)` call for
 * `.subscriptions.update(id, { cancel_at_period_end: true })`.
 *
 * Return = job complete. Throw = pg-boss retries. Like the delete-uploads handler,
 * an UNCONFIGURED deployment completes instead of retrying (no key → nothing a retry
 * could fix). An already-canceled or missing subscription is treated as done
 * (idempotent — a retry after a partial cancel is safe).
 */
export async function handleCancelStripeSubscriptions(data: unknown): Promise<void> {
  const { userId, organizationId, subscriptionIds } = cancelStripeSubscriptionsPayload.parse(data);
  // Log label: an org deletion (#11) names the org; a user deletion names the user.
  const owner = organizationId ? `org ${organizationId} (deleted by ${userId})` : userId;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.info(
      `[jobs] cancel-stripe-subscriptions for ${owner} skipped — Stripe not configured (${subscriptionIds.length} subscription(s) left; cancel manually)`,
    );
    return;
  }

  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true });

  let canceled = 0;
  for (const id of subscriptionIds) {
    try {
      await stripe.subscriptions.cancel(id);
      canceled += 1;
    } catch (err) {
      // Already canceled / no longer on Stripe → nothing to do (idempotent). Any
      // OTHER error is unexpected or transient, so rethrow to let pg-boss retry the
      // whole job (canceling the ids that already succeeded is a safe no-op).
      if (err instanceof Stripe.errors.StripeInvalidRequestError) {
        console.info(
          `[jobs] cancel-stripe-subscriptions for ${owner}: ${id} already canceled or missing — skipping`,
        );
        continue;
      }
      throw err;
    }
  }
  console.info(
    `[jobs] cancel-stripe-subscriptions for ${owner}: canceled ${canceled}/${subscriptionIds.length} subscription(s)`,
  );
}
