import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignupForm } from "@/components/auth/signup-form";
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
  return { title: t("signup"), alternates: localizedAlternates({ locale, href: "/signup" }) };
}

// `requiresVerification` must reflect the deploy's email env at REQUEST time, not
// whatever was set during `next build` (CI builds with email unset) — it mirrors
// @repo/email's isEmailConfigured(): both vars present → verification is required, so
// sign-up shows a "check your inbox" state instead of redirecting. Under cacheComponents
// (which bans the `dynamic` segment config) this stays correct without it: the env read
// sits AFTER `await searchParams` below, so it runs in the dynamic (per-request) scope.

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const requiresVerification = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  return (
    <SignupForm
      redirectTo={safeRedirectPath(redirectTo)}
      requiresVerification={requiresVerification}
      providers={configuredOAuthProviders()}
      captchaSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
    />
  );
}
