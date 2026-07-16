import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Landing target for Checkout's `success_url`. The redirect back from Stripe is
// only a UX cue — the authoritative subscription state arrives via the verified
// `checkout.session.completed` webhook (apps/web/src/app/api/stripe/webhook),
// never from this page's `session_id` query param.
export default async function BillingSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Billing.success");
  const { session_id } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {session_id ? t("descriptionWithId", { id: session_id }) : t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
