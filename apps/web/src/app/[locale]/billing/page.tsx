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
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { getActiveOrganizationId, getOrgRole, isOrgAdminRole } from "@/lib/organization";

// Public scaffold/demo route (like /state). The Subscribe button calls
// the `createCheckoutSession` Server Action, which is auth-gated and degrades
// gracefully: logged-out → "Unauthorized"; logged-in but no Stripe keys →
// "Stripe is not configured"; fully configured → redirect to Stripe Checkout.
//
// Org-aware (#11): with an active organization the page is that org's billing
// surface — the subscription card reads the ORG's row, and the subscribe/manage
// controls render only for org owners/admins (plain members get explanatory
// copy instead). The role render-gate here is UX only; the Server Actions
// re-resolve the context and re-check authority themselves. In the personal
// workspace everything is the pre-#11 page.
//
// Signed-in visitors with a recorded subscription row also get a "Manage billing"
// card (P2-4 — direct `subscriptions`-table read, the same server-render pattern
// as /uploads and the /account sessions card) that opens the Stripe-hosted
// customer portal via `createBillingPortalSession`. The card's gate is the row's
// existence: no subscription has ever been recorded → nothing to manage.
// Delete this when a real billing surface lands. See docs/context/SERVICES.md.
export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Billing.page");
  const format = await getFormatter();
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  // Active-org context, resolved authoritatively (cookie cache bypassed — a
  // just-switched workspace must not show the previous context's billing). A
  // session can briefly carry a DELETED org's id (the plugin only nulls the
  // deleter's own session) — the org row lookup doubles as the existence check,
  // and a vanished org falls back to the personal surface.
  const activeOrgId = session ? await getActiveOrganizationId(reqHeaders) : null;
  const [organization, isOrgAdmin] = activeOrgId
    ? await Promise.all([
        db.query.organization.findFirst({
          columns: { name: true },
          where: (row, { eq: eqFn }) => eqFn(row.id, activeOrgId),
        }),
        getOrgRole(activeOrgId, session?.user.id ?? "").then(isOrgAdminRole),
      ])
    : [undefined, false];
  const organizationId = organization ? activeOrgId : null;
  const canManage = organizationId ? isOrgAdmin : true;

  const subscription = session
    ? await db.query.subscriptions.findFirst({
        columns: { status: true, currentPeriodEnd: true },
        where: organizationId
          ? eq(subscriptions.organizationId, organizationId)
          : eq(subscriptions.userId, session.user.id),
        orderBy: [desc(subscriptions.createdAt)],
      })
    : undefined;

  const orgName = organization?.name;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{orgName ? t("orgTitle", { name: orgName }) : t("title")}</CardTitle>
          <CardDescription>
            {orgName ? t("orgDescription", { name: orgName }) : t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <SubscribeButton />
          ) : (
            <p className="text-sm text-muted-foreground">{t("memberNotice")}</p>
          )}
        </CardContent>
      </Card>

      {subscription ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{orgName ? t("orgSubscriptionTitle") : t("subscriptionTitle")}</CardTitle>
            <CardDescription>
              {t("status", { status: subscription.status })}
              {subscription.currentPeriodEnd
                ? ` · ${t("renews", {
                    date: format.dateTime(subscription.currentPeriodEnd, "dateOnly"),
                  })}`
                : null}
            </CardDescription>
          </CardHeader>
          {canManage ? (
            <CardContent>
              <ManageBillingButton />
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}
