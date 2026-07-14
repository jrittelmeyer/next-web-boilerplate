import { auth } from "@repo/auth";
import { db, subscriptions } from "@repo/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { SubscribeButton } from "@/components/billing/subscribe-button";

// Public scaffold/demo route (like /state). The Subscribe button calls
// the `createCheckoutSession` Server Action, which is auth-gated and degrades
// gracefully: logged-out → "Unauthorized"; logged-in but no Stripe keys →
// "Stripe is not configured"; fully configured → redirect to Stripe Checkout.
//
// Signed-in visitors with a recorded subscription row also get a "Manage billing"
// card (P2-4 — direct `subscriptions`-table read, the same server-render pattern
// as /uploads and the /account sessions card) that opens the Stripe-hosted
// customer portal via `createBillingPortalSession`. The card's gate is the row's
// existence: no subscription has ever been recorded → nothing to manage.
// Delete this when a real billing surface lands. See docs/context/SERVICES.md.
export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const subscription = session
    ? await db.query.subscriptions.findFirst({
        columns: { status: true, currentPeriodEnd: true },
        where: eq(subscriptions.userId, session.user.id),
        orderBy: [desc(subscriptions.createdAt)],
      })
    : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Billing demo</CardTitle>
          <CardDescription>
            Start a hosted Stripe Checkout session for an example $10/mo plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubscribeButton />
        </CardContent>
      </Card>

      {subscription ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Your subscription</CardTitle>
            <CardDescription>
              Status: {subscription.status}
              {subscription.currentPeriodEnd
                ? ` · renews ${subscription.currentPeriodEnd.toLocaleDateString()}`
                : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManageBillingButton />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
