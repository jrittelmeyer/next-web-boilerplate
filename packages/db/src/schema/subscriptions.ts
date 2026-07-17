import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

/**
 * Stripe subscriptions (Phase 3 · C4) — the worked example for persisting webhook
 * state. Populated by the Stripe webhook handler
 * (`apps/web/src/app/api/stripe/webhook/route.ts`) from the
 * `checkout.session.completed` and `customer.subscription.*` events. See
 * SERVICES.md (Stripe) + DATABASE.md.
 *
 * `id` is the Stripe subscription id (`sub_…`), so the handler can upsert/update a
 * row directly by it — no surrogate key.
 *
 * Ownership (path-to-100 #11): a subscription belongs to EXACTLY ONE of a user
 * (personal billing) or an organization (org billing) — the XOR is enforced by the
 * `num_nonnulls` check. Org rows deliberately carry NO `userId` (the purchaser is
 * recorded in the Checkout Session metadata on Stripe's side instead): a purchaser
 * FK would cascade the ORG's subscription away when that member deletes their
 * account, and the A13 cancel-on-delete capture would cancel the org's Stripe
 * subscription because one member left. With XOR ownership both delete cascades
 * (user → personal rows, organization → org rows) and every `userId`-filtered
 * query stay correct with no `IS NULL` guards. Both FKs are `text` (Better Auth
 * ids), `onDelete: "cascade"`.
 *
 * `stripeCustomerId` lives ONLY here, not on the Better-Auth-owned `user` table:
 * the owner↔customer link is derivable from this row and is written exclusively by
 * the webhook, so there's no reason to widen the auth schema (no Better Auth
 * `additionalFields` entry). Each org gets its own Stripe customer, distinct from
 * any member's personal one. See DECISIONS.md.
 *
 * `status` is plain `text` (not a typed enum) to keep `@repo/db` free of any
 * `stripe` import — the handler narrows it to the SDK's `Stripe.Subscription.Status`.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // Stripe subscription id (sub_…)
    // Personal owner — null on org-owned rows (see the XOR check).
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    // Org owner (path-to-100 #11) — null on personal rows.
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    status: text("status").notNull(), // active | trialing | canceled | past_due | …
    priceId: text("price_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Postgres doesn't auto-index FK referencing columns — the delete cascades and
  // the billing page's subscription-by-owner lookups scan without these.
  (t) => [
    index("subscriptions_user_id_idx").on(t.userId),
    index("subscriptions_organization_id_idx").on(t.organizationId),
    check("subscriptions_owner_check", sql`num_nonnulls(user_id, organization_id) = 1`),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
