import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

// Landing target for Checkout's `success_url`. The redirect back from Stripe is
// only a UX cue — the authoritative subscription state arrives via the verified
// `checkout.session.completed` webhook (apps/web/src/app/api/stripe/webhook),
// never from this page's `session_id` query param.
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Subscription started</CardTitle>
          <CardDescription>
            Thanks! Your Checkout session completed
            {session_id ? ` (${session_id})` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Subscription access is confirmed server-side by the Stripe webhook.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
