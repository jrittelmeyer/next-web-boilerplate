import { auth } from "@repo/auth";
import { isEmailConfigured } from "@repo/email";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrganizationManager } from "@/components/organization/organization-manager";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("organization") };
}

// Organization management surface (Tier 4 · Band 4), inside the (dashboard) shell. The
// layout is the authoritative session gate; we re-read it here (cheap under the Step-19
// cookie cache) for defense-in-depth. The page is intentionally thin — all org data is
// driven client-side by the reactive Better Auth hooks in OrganizationManager, so
// switching the active org from the header updates this page without a full reload. Only
// `emailConfigured` is resolved server-side, to shape the invite copy (email-off → the
// copyable accept link). This is a REAL surface (like /account), not a throwaway demo.
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Organization.page");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <OrganizationManager emailConfigured={isEmailConfigured()} />
    </div>
  );
}
