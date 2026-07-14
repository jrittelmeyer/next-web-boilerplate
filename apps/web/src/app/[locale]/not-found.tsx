import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import Link from "next/link";

// Localized 404: rendered inside app/[locale]/layout.tsx (which owns <html>/<body>)
// for a notFound() within a [locale] route, and for unmatched paths under a locale
// (e.g. /es/does-not-exist, or the default-locale rewrite of /xx). Copy stays
// English for now; a later i18n step extracts it to messages/*. The Link stays on
// next/link: not-found.tsx receives no `params`, so it can't call setRequestLocale,
// and the locale-aware server <Link> would read the locale via headers() — an uncached
// access cacheComponents rejects outside <Suspense> during prerender. href="/" resolves
// to the default locale, which is fine for a 404 "go home". See docs/context/I18N.md.
export default function LocaleNotFound() {
  return (
    <main>
      <EmptyState
        title="Page not found"
        description="The page you’re looking for doesn’t exist or has moved."
        action={
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        }
      />
    </main>
  );
}
