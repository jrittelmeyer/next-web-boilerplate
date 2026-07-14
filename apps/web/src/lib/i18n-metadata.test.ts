import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { localizedAlternates } from "./i18n-metadata";

// Unit coverage for the hreflang builder that every indexable page's
// generateMetadata (and, in spirit, the sitemap) relies on. Assertions use
// whole-object matchers so the values are pinned exactly without tripping over the
// optional/nullable Metadata["alternates"] shape. All URLs are RELATIVE pathnames —
// the root layout's metadataBase resolves them to absolute ones in the emitted tags.

describe("localizedAlternates", () => {
  it("en render of a prefixed path → unprefixed canonical + full languages map", () => {
    expect(localizedAlternates({ locale: "en", href: "/login" })).toEqual({
      canonical: "/login",
      languages: { en: "/login", es: "/es/login", "x-default": "/login" },
    });
  });

  it("es render → prefixed canonical, identical languages map", () => {
    expect(localizedAlternates({ locale: "es", href: "/login" })).toEqual({
      canonical: "/es/login",
      languages: { en: "/login", es: "/es/login", "x-default": "/login" },
    });
  });

  it("root path uses as-needed prefixing (en '/', es '/es')", () => {
    expect(localizedAlternates({ locale: "en", href: "/" })).toEqual({
      canonical: "/",
      languages: { en: "/", es: "/es", "x-default": "/" },
    });
  });

  it("x-default always resolves to the default locale, whichever locale is rendered", () => {
    for (const locale of routing.locales) {
      expect(localizedAlternates({ locale, href: "/signup" })).toMatchObject({
        languages: { "x-default": "/signup" },
      });
    }
  });

  it("emits an entry for every configured locale (locale-agnostic)", () => {
    const languages = Object.fromEntries(routing.locales.map((l) => [l, expect.any(String)]));
    expect(localizedAlternates({ locale: "en", href: "/forgot-password" })).toMatchObject({
      languages,
    });
  });
});

describe("routing config", () => {
  it("declares the en+es locale set with en as the default", () => {
    expect(routing.locales).toEqual(["en", "es"]);
    expect(routing.defaultLocale).toBe("en");
  });
});
