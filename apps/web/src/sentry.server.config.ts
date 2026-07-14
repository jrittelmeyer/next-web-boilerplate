import * as Sentry from "@sentry/nextjs";

// Server (Node.js runtime) Sentry init, loaded from instrumentation.ts. Same
// graceful gate as the client config: no DSN → no-op.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 1,
});
