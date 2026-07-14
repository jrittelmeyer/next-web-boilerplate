import { Button } from "@repo/ui/components/button";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("goodbye"),
    // A post-action confirmation, not content — keep it out of search results
    // (so no hreflang alternates either).
    robots: { index: false },
  };
}

// Landing page after account deletion (P2-2). Both flows end here: the immediate
// flow navigates to it after `deleteUser` succeeds, and the verification flow's
// emailed link redirects to it (it rides `callbackURL` through
// /delete-user/callback). Lives in the (auth) group for its centered, nav-free
// shell — by the time this renders the visitor has no session (the delete endpoint
// cleared the cookie), and the proxy matcher doesn't touch this path, so it's
// reachable signed-out.
export default async function GoodbyePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth.goodbye");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </div>
  );
}
