import { Toaster } from "@repo/ui/components/sonner";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { PostHogProvider } from "@/components/observability/posthog-provider";
import { type Locale, routing } from "@/i18n/routing";
import { siteConfig, siteUrl } from "@/lib/site";
import { TRPCReactProvider } from "@/lib/trpc/client";

// OpenGraph locale codes (BCP-47 with region) per app locale. Drives og:locale +
// og:locale:alternate so a shared link renders in the right language.
const OG_LOCALES: Record<Locale, string> = { en: "en_US", es: "es_ES" };

// metadataBase resolves the relative OG/Twitter image URLs — and the per-page
// hreflang `alternates` (localizedAlternates) — to absolute ones. The title
// template prefixes per-page titles (a page sets `title: "Sign in"` → "Sign in ·
// next-web-boilerplate"); the bare `/` uses the brand default. The
// robots/sitemap/manifest/icon/opengraph-image link tags are injected
// automatically by their file conventions, so they're NOT repeated here. This is
// generateMetadata (not a static export) so the description + OG locale localize
// per request; getTranslations reads the locale EXPLICITLY (not via headers), so
// it stays PPR-safe. Per-page hreflang alternates live in each indexable page's
// own generateMetadata (they must point at that page, not "/").
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const description = t("description");

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: siteConfig.name,
      template: `%s · ${siteConfig.name}`,
    },
    description,
    applicationName: siteConfig.name,
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: siteConfig.name,
      description,
      url: "/",
      locale: OG_LOCALES[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
    },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.name,
      description,
    },
  };
}

// Prerender both locales at build time. Combined with setRequestLocale below (and
// in each page), this keeps [locale] routes STATIC under cacheComponents rather
// than forcing them dynamic — the whole reason we route the locale in the URL
// instead of reading it from a cookie. See docs/context/I18N.md.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// The application's root document layout. Since the whole page tree now lives under
// [locale], this owns <html lang={locale}> + <body> + the app providers (the root
// app/layout.tsx is a bare passthrough). <html lang> flips per locale. Invalid
// locales are 404'd (the next-intl proxy normally rewrites them to the default, so
// this is defense-in-depth).
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // suppressHydrationWarning: next-themes sets the `class`/`style` on <html>
  // from a pre-paint inline script (no SSR flash), so the server HTML and the
  // first client render legitimately differ on this one element. The flag scopes
  // the suppression to <html> only.
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PostHogProvider>
            <TRPCReactProvider>
              <NextIntlClientProvider>{children}</NextIntlClientProvider>
            </TRPCReactProvider>
          </PostHogProvider>
          {/* App-wide transient notifications (A1). Inside ThemeProvider so toasts
              follow light/dark; a portal leaf, so tree position is otherwise moot. */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
