import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";

/**
 * Builds the `alternates` block (canonical + hreflang `languages`) for one
 * indexable page, given the current render locale and the route's unprefixed
 * default-locale `href` (e.g. "/", "/login").
 *
 * Each value is a locale-specific PATHNAME (relative). metadataBase — set on the
 * root [locale]/layout — resolves them to absolute URLs in the emitted
 * <link rel="alternate"> tags, so this file needs no origin. Under localePrefix
 * "as-needed": en is unprefixed ("/login"), es is prefixed ("/es/login").
 * `x-default` points at the default locale (en) — the conventional fallback for an
 * unmatched Accept-Language — and `canonical` is the self-referential URL for the
 * locale being rendered.
 *
 * getPathname (from @/i18n/navigation) with an explicit `locale` is a pure
 * computation over the routing config — no request scope — so it's safe to call
 * from generateMetadata (and sitemap.ts).
 */
export function localizedAlternates({
  locale,
  href,
}: {
  locale: Locale;
  href: string;
}): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = getPathname({ locale: l, href });
  }
  languages["x-default"] = getPathname({ locale: routing.defaultLocale, href });

  return {
    canonical: getPathname({ locale, href }),
    languages,
  };
}
