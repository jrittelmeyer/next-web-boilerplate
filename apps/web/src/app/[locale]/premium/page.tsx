import { auth } from "@repo/auth";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Lock, Sparkles } from "lucide-react";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getActiveOrganizationId } from "@/lib/organization";
import { hasActiveSubscription, hasOrgSubscription } from "@/lib/subscription";

// Public scaffold/demo route (like /billing) — the worked subscription-gating
// example (A2, org-aware since #11). It reads entitlement from the LOCAL
// `subscriptions` table (no Stripe call, works without Stripe creds) and renders
// one of three states. The gate follows the caller's CONTEXT: with an active
// organization it's `hasOrgSubscription(orgId)` — every member of a subscribed
// org is entitled, which is the point of org billing — and in the personal
// workspace it's `hasActiveSubscription(userId)`. This is the copy-me pattern
// for gating any premium surface on a paid subscription; delete it when a real
// one lands. See docs/context/SERVICES.md (Stripe) + DATABASE.md.
export default async function PremiumPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Premium");
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  // Resolved authoritatively (cookie cache bypassed) so a just-switched
  // workspace gates on the right context — same posture as /billing.
  const organizationId = session ? await getActiveOrganizationId(reqHeaders) : null;
  const entitled = session
    ? organizationId
      ? await hasOrgSubscription(organizationId)
      : await hasActiveSubscription(session.user.id)
    : false;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {!session ? (
        // State 1 — signed out: nothing to gate on yet, prompt sign-in.
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5" aria-hidden /> {t("signedOut.title")}
            </CardTitle>
            <CardDescription>{t("signedOut.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login?redirectTo=/premium">{t("signedOut.cta")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : entitled ? (
        // State 2 — entitled: the unlocked premium content.
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden /> {t("unlocked.title")}
            </CardTitle>
            <CardDescription>
              {organizationId ? t("unlocked.orgDescription") : t("unlocked.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t.rich("unlocked.body", {
              code: (chunks) => <code className="mx-1 rounded bg-muted px-1 py-0.5">{chunks}</code>,
            })}
          </CardContent>
        </Card>
      ) : (
        // State 3 — signed in, no entitling subscription: locked, route to /billing.
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5" aria-hidden /> {t("locked.title")}
            </CardTitle>
            <CardDescription>
              {organizationId ? t("locked.orgDescription") : t("locked.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/billing">{t("locked.cta")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
