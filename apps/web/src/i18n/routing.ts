import { defineRouting } from "next-intl/routing";

// Single source of truth for the app's locales + URL strategy. Consumed by the
// request config (server), the navigation helpers (client + server), and the
// next-intl proxy/middleware. To add a locale: add it here AND add a matching
// messages/<locale>.json (see docs/context/I18N.md).
//
// localePrefix "as-needed" keeps the DEFAULT locale unprefixed — `/`, `/login`,
// `/dashboard` stay exactly as before this feature landed (so existing E2E specs
// and the proxy matcher keep working), while non-default locales are prefixed
// (`/es`, `/es/login`, …). This preserves per-locale SEO without churning the
// primary URLs.
export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
