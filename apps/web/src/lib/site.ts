import "server-only";

import { env } from "@/env";

/**
 * Single source of truth for the site's public origin + brand strings. Consumed
 * by the root metadata (layout.tsx), the metadata route handlers (robots.ts /
 * sitemap.ts / manifest.ts), and the generated OG / icon images — so the name,
 * description, and origin are defined once.
 *
 * Why SITE_URL ?? BETTER_AUTH_URL: the canonical public/marketing origin can differ
 * from the app/auth origin (e.g. marketing on example.com, app on app.example.com).
 * SITE_URL is the dedicated public origin; when unset it falls back to BETTER_AUTH_URL
 * — already the validated canonical app origin — so the common single-origin setup
 * needs no extra config. Both are server vars: metadata renders server-side, so a
 * server var is the right home — no separate NEXT_PUBLIC_ origin needed.
 *
 * Why the `?? localhost` fallback: under SKIP_ENV_VALIDATION (CI *and* the Docker
 * image build), @t3-oss/env returns raw process.env WITHOUT applying the schema
 * default, so both vars can be undefined — and `new URL(undefined)` throws. The
 * fallback keeps those builds green. metadataBase + robots.txt bake into the static
 * output at build time, while the sitemap is dynamic (it reads `new Date()`) and so
 * resolves at request time — set SITE_URL (or BETTER_AUTH_URL) consistently at both
 * build and runtime for correct absolute production URLs.
 */
export const siteUrl = env.SITE_URL ?? env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const siteConfig = {
  name: "next-web-boilerplate",
  description: "Production-ready Next.js starter for complex web applications.",
  url: siteUrl,
} as const;
