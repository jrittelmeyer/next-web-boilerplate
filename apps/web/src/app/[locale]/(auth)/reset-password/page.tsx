import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { Locale } from "@/i18n/routing";

// Title only, no hreflang alternates: the reset link is token-gated (blank without
// ?token), so it isn't a meaningful indexable landing target.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("resetPassword") };
}

// The reset token arrives as ?token=… in the link Better Auth emails. We read it
// here and pass it down; a missing token renders the form's invalid-link state.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? null} />;
}
