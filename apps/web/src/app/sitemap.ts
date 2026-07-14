import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

// The public, indexable routes to advertise. Kept to the REAL public surface —
// the landing page + the token-less auth forms. The /state, /billing, /uploads,
// /search, /observability, /admin routes are throwaway demo scaffold (see
// ARCHITECTURE.md "Demo / scaffold routes"), and /reset-password is token-gated,
// so none are listed. Add real routes here as the app grows.
const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password"] as const;

// Generates /sitemap.xml. Dynamic (ƒ) under cacheComponents because lastModified
// reads `new Date()`, so `siteUrl` resolves at request time — unlike the static
// robots.txt, which bakes it at build. Emits one <url> PER LOCALE for each public
// path (en unprefixed, es under /es via localePrefix "as-needed"), each carrying
// the full hreflang alternate set as <xhtml:link> tags (en / es / x-default). This
// file lives at the ROOT, outside [locale], so it builds absolute URLs itself
// (there's no metadataBase to resolve relative ones).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PATHS.flatMap((href) => {
    const languages: Record<string, string> = {};
    for (const locale of routing.locales) {
      languages[locale] = `${siteUrl}${getPathname({ locale, href })}`;
    }
    languages["x-default"] = `${siteUrl}${getPathname({ locale: routing.defaultLocale, href })}`;

    return routing.locales.map((locale): MetadataRoute.Sitemap[number] => ({
      url: `${siteUrl}${getPathname({ locale, href })}`,
      lastModified,
      changeFrequency: "monthly",
      priority: href === "/" ? 1 : 0.8,
      alternates: { languages },
    }));
  });
}
