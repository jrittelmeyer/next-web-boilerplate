import "server-only";
import { db, subscriptions } from "@repo/db";
import { desc, eq } from "drizzle-orm";

// Subscription-gating helper (A2). The C4 `subscriptions` table is written by the
// Stripe webhook (apps/web/src/app/api/stripe/webhook/route.ts) but was never
// *read* for entitlement — the #1 thing a SaaS fork does. This reads the LOCAL
// table only: no Stripe API call, so it's cheap and works with no Stripe creds.
// See docs/context/SERVICES.md (Stripe) + DATABASE.md.

// Stripe statuses that entitle access. `active`/`trialing` grant it; `canceled`,
// `past_due`, `unpaid`, `incomplete`, `incomplete_expired`, `paused` do not.
// (A "cancel at period end" subscription stays `active` until the period lapses,
// which is exactly what we want — see the period check below.)
const ENTITLING_STATUSES = new Set(["active", "trialing"]);

/** The two columns that decide entitlement — a Subscription row projected down. */
export type SubscriptionEntitlement = { status: string; currentPeriodEnd: Date | null };

/**
 * Pure predicate: does this subscription row grant access right now? The
 * conventional SaaS shape — status ∈ {active, trialing} AND the current period
 * hasn't lapsed. A `null` `currentPeriodEnd` (not yet synced by the webhook) is
 * treated as "no expiry known", so status alone decides. Split out from the DB
 * read so the entitlement logic is unit-testable without a database.
 */
export function isSubscriptionActive(
  sub: SubscriptionEntitlement | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sub || !ENTITLING_STATUSES.has(sub.status)) return false;
  return sub.currentPeriodEnd === null || sub.currentPeriodEnd.getTime() > now.getTime();
}

/**
 * Does this user currently have an entitling subscription? Reads their newest
 * recorded row (the "latest created" reuse policy from server/actions/billing.ts)
 * and applies {@link isSubscriptionActive}. The gate for premium surfaces —
 * see the `/premium` demo route.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await db.query.subscriptions.findFirst({
    columns: { status: true, currentPeriodEnd: true },
    where: eq(subscriptions.userId, userId),
    orderBy: [desc(subscriptions.createdAt)],
  });
  return isSubscriptionActive(sub);
}
