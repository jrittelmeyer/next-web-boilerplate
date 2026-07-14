import type { ReactNode } from "react";
import "./globals.css";

// With next-intl [locale] routing, the document shell — <html lang={locale}>,
// <body>, the app providers, and the metadata export — lives in
// app/[locale]/layout.tsx so <html lang> can flip per locale. This root layout is
// the required App Router root: it wraps every route (the localized [locale] tree,
// the non-localized api/metadata routes, and the root not-found) and owns the
// single global stylesheet import so it applies everywhere. It renders no markup
// of its own — the nested layout (or the root not-found) provides <html>/<body>.
// See docs/context/I18N.md.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
