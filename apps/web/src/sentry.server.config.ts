import * as Sentry from "@sentry/nextjs";
import { buildOtelSpanProcessors } from "./lib/otel";

// Server (Node.js runtime) Sentry init, loaded from instrumentation.ts. Same
// graceful gate as the client config: no DSN → no-op.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 1,
  // Opt-in OTLP trace export (path-to-100 #9): [] while OTEL_EXPORTER_OTLP_ENDPOINT
  // is unset (identical init to before), else a BatchSpanProcessor added to Sentry's
  // own OTel provider — works with or without a DSN. See lib/otel.ts.
  openTelemetrySpanProcessors: buildOtelSpanProcessors(),
});
