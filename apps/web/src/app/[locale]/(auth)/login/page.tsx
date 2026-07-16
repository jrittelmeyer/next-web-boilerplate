import { isEmailConfigured } from "@repo/email";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { env } from "@/env";
import type { Locale } from "@/i18n/routing";
import { configuredOAuthProviders } from "@/lib/auth-providers";
import { safeRedirectPath } from "@/lib/auth-redirect";
import { localizedAlternates } from "@/lib/i18n-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("login"), alternates: localizedAlternates({ locale, href: "/login" }) };
}

// `?redirectTo` is set by the proxy when it bounces an unauthenticated user off a
// protected route; we sanitize it (open-redirect guard) and hand it to the form so
// sign-in returns the user to where they were headed. Reading searchParams makes
// this route dynamic, which is correct for an auth page.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  return (
    <LoginForm
      redirectTo={safeRedirectPath(redirectTo)}
      providers={configuredOAuthProviders()}
      captchaSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      // The same gate that registers the magicLink() plugin (@repo/auth) — the
      // affordance and the endpoint appear/disappear together (path-to-100 #6).
      magicLinkEnabled={isEmailConfigured()}
    />
  );
}
