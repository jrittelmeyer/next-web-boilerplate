import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import Link from "next/link";
import "./globals.css";

// Root not-found for unmatched, non-localized paths. Because the root layout is a
// passthrough (the <html>/<body> live in app/[locale]/layout.tsx), this boundary
// must render its own document shell — like global-error.tsx, it can't rely on a
// parent layout for the document tags. A notFound() inside a [locale] route renders
// the localized app/[locale]/not-found.tsx instead. See docs/context/I18N.md.
export default function NotFound() {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
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
      </body>
    </html>
  );
}
