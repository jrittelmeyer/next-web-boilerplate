/**
 * Content-Security-Policy — the single source of truth for both modes.
 *
 * Consumed from two very different places, so it must stay dependency-free
 * (no env.ts, no path aliases): next.config.ts imports it at config-eval time
 * to emit the static CSP header, and proxy.ts imports it into the Edge bundle
 * to build the per-request nonce CSP. One directive list means the two can
 * never drift (they historically had to be hand-synced).
 *
 * `CSP_MODE` is a BUILD-TIME knob (default "static"): next.config.ts bakes it
 * into every bundle via its `env` key, because nonce mode also flips
 * `cacheComponents` — unavoidably a build decision. Like NEXT_PUBLIC_* vars,
 * setting CSP_MODE at `next start` time is silently ignored; rebuild to change
 * modes. See docs/context/SECURITY.md → "CSP strategy".
 */

type CspMode = "static" | "nonce";

// In next.config.ts this reads the real environment; in the server/client/proxy
// bundles process.env.CSP_MODE is the literal baked by the config's `env` key,
// so every consumer of one build agrees on the mode. env.ts validates the raw
// value (z.enum) so a typo fails the build loudly instead of degrading here.
export const cspMode: CspMode = process.env.CSP_MODE === "nonce" ? "nonce" : "static";

/**
 * Build the CSP header value.
 *
 * - `buildCsp()` — the static policy (`script-src 'self' 'unsafe-inline'`):
 *   Next's inline RSC/hydration scripts can't be hash-pinned, and without a
 *   per-request nonce 'unsafe-inline' is the only way to run them.
 * - `buildCsp(nonce)` — the strict policy: `script-src` drops 'unsafe-inline'
 *   for 'nonce-<nonce>' 'strict-dynamic' — only the nonced bootstrap (and the
 *   scripts it loads) execute. `style-src` KEEPS 'unsafe-inline' in both modes:
 *   inline `style=` attributes (Tailwind/React) can't be nonced and are low-risk.
 *
 * When a browser honours 'strict-dynamic' it IGNORES 'self' and the script-src
 * host allowlist (js.stripe.com, challenges.cloudflare.com) — those scripts are
 * trusted transitively because the nonced bootstrap loads them. They stay listed
 * for older (CSP2) browsers that ignore 'strict-dynamic'. challenges.cloudflare.com
 * must ALSO stay in frame-src for the A12 Turnstile CAPTCHA (its iframe is not
 * script-loaded, so 'strict-dynamic' doesn't cover it).
 *
 * 'unsafe-eval' and ws: are dev-only — Turbopack + React Refresh (HMR) need
 * them; production stays strict. connect-src/script-src/frame-src allowlist
 * exactly the SaaS this boilerplate wires up (per-origin rationale in
 * SECURITY.md). PostHog is reached via the same-origin /ingest proxy ('self'
 * covers it); its origins are still listed for non-proxied features (toolbar,
 * surveys).
 */
export function buildCsp(nonce?: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc =
    nonce === undefined
      ? `'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`
      : `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`;

  return [
    "default-src 'self'",
    // challenges.cloudflare.com: Turnstile CAPTCHA (A12) — its api.js (script)
    // renders the widget in a same-origin-embedded iframe (frame). Opt-in: only
    // loaded when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, but the directive is
    // static (harmless allowlist).
    `script-src ${scriptSrc} https://js.stripe.com https://challenges.cloudflare.com`,
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
}
