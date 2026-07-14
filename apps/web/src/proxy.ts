import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// next-intl locale routing (negotiation + as-needed prefixing). Now that the whole
// page tree lives under app/[locale], we run it on (almost) every request — see the
// broadened matcher below. It negotiates the locale, rewrites the unprefixed
// default-locale paths to the [locale] segment internally, redirects /en/* to the
// unprefixed form, and serves /es/*. The optimistic auth gate layers on top,
// matching on the locale-STRIPPED path so /es/dashboard gates exactly like
// /dashboard. See docs/context/I18N.md.
const handleI18nRouting = createMiddleware(routing);

// Next.js 16 renamed the `middleware` file convention to `proxy` (same Edge
// runtime, same matcher config, function renamed middleware -> proxy).
//
// Optimistic, cookie-only gate: a fast redirect for UX. It does NOT verify the
// session (no DB hit at the edge) — it only checks for the session cookie's
// presence. Authoritative checks live in Server Components / Server Actions via
// `auth.api.getSession`. Protected pages live under app/[locale]/(dashboard); the
// auth pages (login/signup) live under app/[locale]/(auth) and render at the paths
// below (unprefixed for the default locale, /es-prefixed for Spanish).
//
// `/admin` is gated here only for the cookie-present redirect (RBAC, Step 21).
// The proxy can't know a user's ROLE at the edge (no DB), so the authoritative
// admin check lives in the page (Server Component via requireAdmin) — a non-admin
// with a session passes this gate and is then 404'd by the page. See AUTH.md.
//
// The route groups `(auth)`/`(dashboard)` are layout boundaries only — they never
// appear in the URL — so every page rendered inside them (`/dashboard`, `/account`,
// `/admin`, …) is matched below by its real, locale-agnostic path. The layout is
// the authoritative gate; this is the fast, optimistic edge redirect that spares
// unauthenticated users the prerendered shell.
const PROTECTED_PREFIXES = ["/dashboard", "/account", "/admin", "/organization"];
const AUTH_PAGES = ["/login", "/signup"];

// Next's file-based metadata routes (opengraph-image, twitter-image, icon,
// apple-icon) live at the app ROOT, outside [locale], and serve at a dot-less path
// the broadened matcher below would otherwise hand to next-intl — which would
// rewrite them under the default locale and 404 them. Let them pass through
// untouched. (The dotted metadata routes — sitemap.xml, robots.txt,
// manifest.webmanifest — are already excluded by the matcher's `.*\..*` clause.)
const METADATA_SEGMENTS = new Set(["opengraph-image", "twitter-image", "icon", "apple-icon"]);

// A leading locale segment on the path ("/es" for /es/dashboard, "" for the
// unprefixed default locale). Used to (a) strip the locale before matching the
// auth prefixes and (b) keep the login/dashboard redirect targets in the same
// locale the user was browsing.
const LOCALE_PREFIX = new RegExp(`^/(?:${routing.locales.join("|")})(?=/|$)`);

function localePrefix(pathname: string): string {
  return pathname.match(LOCALE_PREFIX)?.[0] ?? "";
}

function stripLocale(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX, "");
  return stripped === "" ? "/" : stripped;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root-level metadata image routes: never localize or gate them.
  if (METADATA_SEGMENTS.has(pathname.split("/")[1] ?? "")) {
    return NextResponse.next();
  }

  const prefix = localePrefix(pathname);
  const path = stripLocale(pathname);
  const hasSession = Boolean(getSessionCookie(request));

  // Auth gate on the locale-stripped path. A redirect response doesn't need locale
  // rewriting, so we short-circuit before handing off to next-intl; the redirect
  // targets stay locale-correct via `prefix` (so an /es visitor lands on /es/login,
  // and safeRedirectPath accepts the /es-prefixed redirectTo unchanged).
  if (!hasSession && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const url = new URL(`${prefix}/login`, request.url);
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_PAGES.includes(path)) {
    return NextResponse.redirect(new URL(`${prefix}/dashboard`, request.url));
  }

  // No gate fired — let next-intl negotiate the locale and rewrite as needed.
  return handleI18nRouting(request);
}

export const config = {
  // Run on everything except API routes, Next internals, and files with an
  // extension (next-intl's recommended matcher). This is the union the i18n
  // routing and the auth gate both need now that all pages are localized; the
  // dot-less metadata routes are handled by the guard above.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
