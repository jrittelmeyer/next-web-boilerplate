import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Stripe subscriptions (Phase 3 · C4) — the worked example for persisting webhook
 * state. Populated by the Stripe webhook handler
 * (`apps/web/src/app/api/stripe/webhook/route.ts`) from the
 * `checkout.session.completed` and `customer.subscription.*` events. See
 * SERVICES.md (Stripe) + DATABASE.md.
 *
 * `id` is the Stripe subscription id (`sub_…`), so the handler can upsert/update a
 * row directly by it — no surrogate key. `userId` foreign-keys into the Better Auth
 * `user` table (`text` id, not `uuid`), `onDelete: "cascade"` so removing a user
 * drops their subscriptions.
 *
 * `stripeCustomerId` lives ONLY here, not on the Better-Auth-owned `user` table:
 * the user↔customer link is derivable from this row and is written exclusively by
 * the webhook, so there's no reason to widen the auth schema (no Better Auth
 * `additionalFields` entry). See DECISIONS.md.
 *
 * `status` is plain `text` (not a typed enum) to keep `@repo/db` free of any
 * `stripe` import — the handler narrows it to the SDK's `Stripe.Subscription.Status`.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // Stripe subscription id (sub_…)
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
  // Postgres doesn't auto-index FK referencing columns — the user-delete cascade
  // and the billing page's subscription-by-user lookup scan without this.
  (t) => [index("subscriptions_user_id_idx").on(t.userId)],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
