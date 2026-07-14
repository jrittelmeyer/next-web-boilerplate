import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
// Relative import (not "@/lib/…"): next.config.ts imports "./src/env" outside
// the app's alias resolution, so this file's imports must stay path-alias-free.
import { emailFromSchema, trustedOriginsSchema } from "./lib/env-schema";

/**
 * Validated environment variables. Add new vars here so a missing/invalid value
 * fails loudly at startup instead of surfacing as an undefined at runtime.
 *
 * - `server`: server-only vars (read automatically from process.env)
 * - `client`: must be prefixed NEXT_PUBLIC_ and listed in experimental__runtimeEnv
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    // Auth (Better Auth). Secret signs sessions — required, fail loudly if absent.
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    // Extra origins Better Auth accepts for CSRF / redirect validation, beyond the
    // canonical BETTER_AUTH_URL (always trusted). Optional, comma-separated — e.g. a
    // separate frontend domain, preview deploys, or mobile deep links. Each entry
    // must be a URL or *-wildcard pattern (see lib/env-schema.ts).
    AUTH_TRUSTED_ORIGINS: trustedOriginsSchema,
    // Canonical public/marketing origin for SEO metadata (metadataBase, robots,
    // sitemap, OG image URLs). Optional — when unset, lib/site.ts falls back to
    // BETTER_AUTH_URL. Set this only when the public origin differs from the app/auth
    // origin (e.g. marketing on example.com, app on app.example.com). Server-only:
    // metadata renders server-side, so no NEXT_PUBLIC_ exposure is needed.
    SITE_URL: z.url().optional(),
    // OAuth providers are optional: set both id + secret to enable a provider.
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // Email (Resend). Optional: the app builds/runs without an email provider;
    // sends fail loudly only when actually invoked without these set. EMAIL_FROM
    // is a bare address or "Name <address>" (see lib/env-schema.ts).
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: emailFromSchema,
    // Payments (Stripe). Optional: the app builds/runs without Stripe; Checkout
    // and the webhook degrade gracefully when these are unset (see lib/stripe.ts).
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // File uploads (Uploadthing). Optional: the app builds/runs without it;
    // uploads fail gracefully when the token is unset (see lib/uploadthing.ts).
    UPLOADTHING_TOKEN: z.string().optional(),
    // Search (Meilisearch). Optional: the app builds/runs without it; search and
    // indexing degrade gracefully when unset (see lib/search.ts). The key is the
    // instance master key (set in docker/docker-compose.yml for local dev).
    MEILISEARCH_HOST: z.url().optional(),
    MEILISEARCH_API_KEY: z.string().optional(),
    // Observability — Sentry (errors/traces). Optional: an unset NEXT_PUBLIC_SENTRY_DSN
    // initializes the SDK as a no-op. ORG/PROJECT/AUTH_TOKEN drive source-map upload
    // at build time (CI), not runtime — see next.config.ts withSentryConfig.
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    // App-level rate limiting (Step 20) — optional Upstash Redis driver. Unset
    // (the default) → the limiter uses an in-memory per-instance store; set BOTH to
    // switch to a distributed sliding-window limiter (required for multi-instance /
    // serverless deploys). These exact names are what Redis.fromEnv() reads; the
    // calls are server-to-server so they need no CSP entry (see lib/rate-limit.ts).
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    // Logging — BetterStack via @logtail/next. Optional: without both vars the
    // `log` API falls back to console. Both are required to ship logs (the source
    // token + the per-source ingesting URL from the BetterStack dashboard). The
    // legacy LOGTAIL_SOURCE_TOKEN/LOGTAIL_URL names are also read by the SDK.
    BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    BETTER_STACK_INGESTING_URL: z.url().optional(),
    // Bot protection — Cloudflare Turnstile CAPTCHA (A12). Optional: unset (the
    // default) → the Better Auth captcha() plugin is NOT registered and the widget
    // never renders, so sign-up / sign-in / password-reset behave exactly as before.
    // The SECRET is server-only (the siteverify call); pair it with the client
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY below. Register a widget in the Cloudflare
    // dashboard, or use the always-pass test key for local verification (see
    // AUTH.md → Bot protection). Read in @repo/auth via process.env (captchaOptions()).
    TURNSTILE_SECRET_KEY: z.string().optional(),
  },
  client: {
    // Client-safe Stripe key. Optional and currently unused by the hosted
    // Checkout redirect flow; reserved for a future client-side Stripe.js /
    // Elements integration. A NEXT_PUBLIC_ var must also appear in
    // experimental__runtimeEnv below.
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    // Observability/analytics client keys. All optional — unset means the
    // browser SDKs initialize as no-ops. Each NEXT_PUBLIC_ var must also appear
    // in experimental__runtimeEnv below. The Sentry DSN is a URL
    // (https://<key>@<host>/<project-id>), so it gets URL validation.
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    // Regional ingestion host (us or eu). The browser talks to it via the
    // same-origin /ingest proxy (next.config.ts rewrites); defaulted at use sites.
    NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
    // Cloudflare Turnstile site key (A12) — the public half of the CAPTCHA pair.
    // Optional: unset → the auth forms render no widget and send no captcha header,
    // so they work as before. Set it (alongside the server TURNSTILE_SECRET_KEY) to
    // light up the challenge. The forms read it server-side and pass it down as a prop.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  emptyStringAsUndefined: true,
  // Build-only CI lanes set SKIP_ENV_VALIDATION=1 so `next build` runs without
  // real secrets (there's no root .env in CI). Runtime/E2E lanes leave it unset
  // and provide DATABASE_URL + BETTER_AUTH_SECRET, so misconfig still fails loud.
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
