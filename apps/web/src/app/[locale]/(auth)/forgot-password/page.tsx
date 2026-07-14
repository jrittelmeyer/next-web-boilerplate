import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { env } from "@/env";
import type { Locale } from "@/i18n/routing";
import { localizedAlternates } from "@/lib/i18n-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("forgotPassword"),
    alternates: localizedAlternates({ locale, href: "/forgot-password" }),
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm captchaSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />;
}
