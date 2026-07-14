import * as Sentry from "@sentry/nextjs";

// Edge runtime Sentry init (proxy.ts and any edge routes), loaded from
// instrumentation.ts. Same graceful gate as the client/server configs.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 1,
});
