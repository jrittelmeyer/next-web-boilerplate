import { auth } from "@repo/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

// Title only, no hreflang alternates: the dashboard is auth-gated (the proxy +
// layout bounce signed-out visitors), so it isn't a public indexable page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("dashboard") };
}

// The (dashboard) landing — the thin "you're in" shell. The layout already gates
// access; we re-read the session here (cheap: the Step-19 cookie cache usually
// skips the DB) to greet the user. Build a real surface in here, or add sibling
// routes under app/(dashboard)/ to inherit the nav + user menu.
export default async function DashboardPage({ params }: { params: Promise<{ locale: Locale }> }) {
  // Pages render in parallel with the layout, so this page opts itself into static
  // rendering for the locale too (the layout's call doesn't cover it); getTranslations
  // then reads the request locale without a dynamic headers() access under PPR.
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard.home");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("signedInAs", { email: session.user.email })}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("cardBody")}</CardContent>
      </Card>
    </div>
  );
}
