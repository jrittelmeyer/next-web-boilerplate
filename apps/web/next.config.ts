import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Validate environment variables at build/start time (fails fast on misconfig).
import "./src/env";

// Repo root, two levels up from apps/web. Used as the output-file-tracing root so
// the standalone build traces the workspace's raw-.tsx @repo/* packages (and the
// shared lockfile) instead of only this app — required for the Docker image.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Emit the self-contained standalone server only when BUILD_STANDALONE is set —
// the Docker image build sets it (see docker/Dockerfile). Standalone is consumed
// ONLY by the Docker image (Vercel and `next start` don't need it), and its
// output tracing recreates the pnpm symlink farm with fs.symlink, which fails
// with EPERM on Windows dev machines without admin / Developer Mode. Gating it
// keeps local + CI `next build` cross-platform, and lets `next start` (used by
// the Playwright E2E lane) run without the "does not work with standalone" warning.
const standaloneOutput: Partial<NextConfig> = process.env.BUILD_STANDALONE
  ? { output: "standalone", outputFileTracingRoot: repoRoot }
  : {};

// PostHog same-origin reverse proxy: the browser SDK posts to /ingest (same
// origin) to dodge ad-blockers, and Next rewrites that to PostHog's regional
// ingestion host. The static-asset host is the ingest host with an "-assets"
// infix (e.g. us.i → us-assets.i). Derived from NEXT_PUBLIC_POSTHOG_HOST so EU
// users get the right hosts by changing one env var.
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssetHost = posthogHost.replace(".i.posthog.com", "-assets.i.posthog.com");

// ── Security headers + CSP ───────────────────────────────────────────────────
// Applied to every response by headers() below. See docs/context/SECURITY.md for
// the per-origin rationale and the nonce-based upgrade path. We ship a STATIC
// (config-level) CSP rather than a nonce CSP: a nonce requires middleware, which
// would force full dynamic rendering on every route and regress this repo's
// prerendering posture (static routes + Partial Prerender shells under
// cacheComponents). The cost is `script-src 'unsafe-inline'` — without
// a nonce, Next.js's inline RSC/hydration scripts can't be hash-pinned.
//
// process.env.NODE_ENV is set by the Next CLI (`next dev` → development,
// `next build`/`next start` → production), and headers() is evaluated at server
// start, so this branch picks the right variant per command.
const isDev = process.env.NODE_ENV !== "production";

// CSP directives. 'unsafe-eval' and ws: are dev-only — Turbopack + React Refresh
// (HMR) need them; production stays strict. connect-src/script-src/frame-src
// allowlist exactly the SaaS this boilerplate wires up. PostHog is reached via
// the same-origin /ingest proxy ('self' covers it); its origins are still listed
// for non-proxied features (toolbar, surveys).
const contentSecurityPolicy = [
  "default-src 'self'",
  // challenges.cloudflare.com: Turnstile CAPTCHA (A12) — its api.js (script) renders the
  // widget in a same-origin-embedded iframe (frame). Opt-in: only loaded when
  // NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, but the directive is static (harmless allowlist).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.sentry.io https://*.posthog.com https://*.uploadthing.com https://*.ingest.uploadthing.com https://api.stripe.com${
    isDev ? " ws:" : ""
  }`,
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // COOP severs window.opener links between this app and cross-origin windows.
  // Safe as plain same-origin: OAuth (signIn.social) and Stripe hosted checkout
  // are same-tab top-level redirects, and nothing here opens popups. Relax to
  // same-origin-allow-popups only if a fork adds a popup flow that must keep its
  // opener. CORP/COEP are deliberately omitted — see SECURITY.md.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS is production-only: emitting it over http://localhost would pin the
  // browser to https for localhost across every project on the machine.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  ...standaloneOutput,
  reactStrictMode: true,
  // React Compiler (stable in Next 16): auto-memoizes components/hooks so manual
  // useMemo/useCallback is rarely needed. It runs the babel-plugin-react-compiler
  // pass, but Next gates it behind an SWC analysis that only touches JSX/Hook
  // files, so it stays Turbopack-compatible (dev + build) with a small, localized
  // build-time cost. Opt a component out with the "use no memo" directive if the
  // compiler ever mis-optimizes one. See docs/context/DECISIONS.md.
  reactCompiler: true,
  // Cache Components (Next 16, top-level — the experimental.cacheComponents alias is
  // deprecated). Flips the app to the modern rendering model: data/IO is dynamic by
  // default and you opt INTO caching with the `"use cache"` directive (cacheLife /
  // cacheTag), while routes are Partial-Prerendered — a static shell + server-streamed
  // dynamic holes. It composes here because app/loading.tsx already wraps every route
  // in a Suspense boundary (the fallback cacheComponents needs) and we removed the
  // route-segment configs it bans (`export const dynamic`/`runtime` — see the health,
  // stripe/webhook, and signup routes; they now rely on Next's Node-default runtime
  // and connection()/searchParams for dynamism). See docs/context/DECISIONS.md.
  cacheComponents: true,
  transpilePackages: ["@repo/db", "@repo/auth", "@repo/ui", "@repo/email"],
  // Remote images for next/image. Uploadthing serves finished files at
  // https://<appId>.ufs.sh/f/<key>, so allow that app-specific subdomain host
  // (single `*` = one subdomain label; `/f/*` = one path segment) — next/image
  // then optimizes remote uploads through the same-origin /_next/image endpoint
  // (responsive srcset + modern formats). The browser only ever loads /_next/image
  // ('self'); the fetch to ufs.sh is server-side, so this needs no CSP img-src
  // change. See docs/context/SERVICES.md (Uploadthing) + SECURITY.md.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.ufs.sh", pathname: "/f/*" }],
  },
  // The PostHog /ingest proxy relies on paths being forwarded verbatim.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssetHost}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
};

// next-intl plugin: points at the per-request i18n config and makes the [locale]
// routing + message loading work. It wraps the config innermost; withSentryConfig
// stays the outer wrapper (build instrumentation). See docs/context/I18N.md.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// withSentryConfig instruments the build (source-map generation + optional
// upload). org/project/authToken are passed only when present, so the default
// no-creds build never attempts an upload — and therefore never needs the
// @sentry/cli binary (intentionally not built; see pnpm-workspace.yaml allowBuilds).
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet the "no auth token, skipping upload" notice in normal builds; stay
  // loud in CI, where source-map upload is expected.
  silent: !process.env.CI,
});
