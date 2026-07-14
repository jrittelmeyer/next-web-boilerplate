"use client";

import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";

// A language's own name (endonym) reads the same in every locale, so these aren't
// translated — extend alongside routing.locales when you add a locale.
const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

// Locale switcher for the top-right control cluster (beside ThemeToggle) on the
// landing page, the (auth) shell, and the (dashboard) header. Selecting a locale
// re-navigates to the SAME path under it via the i18n router, which re-prefixes per
// localePrefix ("as-needed" → the default locale stays unprefixed). usePathname() from
// @/i18n/navigation returns the locale-stripped path; useLocale() reads the active
// locale from NextIntlClientProvider (client context), so no server plumbing is needed
// on the shells that render this. Deliberately does NOT read useSearchParams — that
// would force the statically-rendered shells to add a Suspense boundary under
// cacheComponents; a language toggle doesn't need to preserve the query string.
export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const activeLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(nextLocale: string) {
    if (nextLocale === activeLocale) return;
    router.replace(pathname, { locale: nextLocale as Locale });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Languages />
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={activeLocale} onValueChange={switchTo}>
          {routing.locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              {LOCALE_NAMES[locale]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
