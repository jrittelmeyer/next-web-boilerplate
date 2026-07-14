import * as Sentry from "@sentry/nextjs";

// Browser-side Sentry init. The DSN is the only switch: with NEXT_PUBLIC_SENTRY_DSN
// unset the SDK initializes as a no-op (enabled: false), so the app runs identically
// without observability creds — mirroring the env-gated Stripe/search/email posture.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Capture every transaction in the scaffold; lower (e.g. 0.1) for production volume.
  tracesSampleRate: 1,
});

// Next.js 16: lets Sentry trace client-side App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
