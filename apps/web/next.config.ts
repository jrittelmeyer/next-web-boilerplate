import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Validate environment variables at build/start time (fails fast on misconfig).
import "./src/env";
// Shared CSP directive builder + the build-time CSP_MODE resolution — one list
// for both the static header below and proxy.ts's per-request nonce policy.
import { buildCsp, cspMode } from "./src/lib/csp";

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
// the per-origin rationale (the directive list itself lives in src/lib/csp.ts,
// shared with proxy.ts). Two supported modes, selected at BUILD time by CSP_MODE:
//
// - static (default, CSP_MODE unset): a config-level CSP with `script-src
//   'unsafe-inline'` — Next's inline RSC/hydration scripts can't be hash-pinned,
//   and this preserves the repo's prerendering posture (static routes + Partial
//   Prerender shells under cacheComponents).
// - nonce (CSP_MODE=nonce): the CSP header moves to proxy.ts, which mints a
//   per-request nonce ('strict-dynamic', no script 'unsafe-inline'). Reading the
//   nonce makes every page render dynamically, which is incompatible with Cache
//   Components' static-shell model — so this mode builds with cacheComponents
//   OFF (+ experimental.useCache to keep the D4 `"use cache"` showcase caching).
//
// process.env.NODE_ENV is set by the Next CLI (`next dev` → development,
// `next build`/`next start` → production), and headers() is evaluated at server
// start, so the CSP's dev/prod variant picks the right form per command.
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  // In nonce mode the CSP is per-request (proxy.ts); emitting the static one too
  // would make browsers enforce BOTH policies (intersection) and break the app.
  ...(cspMode === "nonce" ? [] : [{ key: "Content-Security-Policy", value: buildCsp() }]),
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
  //
  // CSP_MODE=nonce turns it OFF: the per-request nonce must reach the document
  // shell's inline scripts, so the shell can't be a build-time static artifact
  // (the layout's headers() read fails the build under cacheComponents). The
  // explicit experimental.useCache keeps the `"use cache"` directive compiling
  // and caching (post-stats.tsx + the updateTag busts) — verified in the
  // installed Next: useCache only DEFAULTS from cacheComponents; an explicit
  // true survives cacheComponents: false. What nonce mode gives up is the
  // static/PPR posture, not the function cache. See SECURITY.md → CSP strategy.
  cacheComponents: cspMode !== "nonce",
  ...(cspMode === "nonce" ? { experimental: { useCache: true } } : {}),
  // Bake the resolved mode into every bundle (server, client, AND the proxy's
  // Edge bundle) so proxy.ts and the [locale] layout can't disagree with how
  // this build was configured. This is what makes a runtime CSP_MODE override a
  // documented no-op (NEXT_PUBLIC_-style semantics): rebuild to change modes.
  env: { CSP_MODE: cspMode },
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
