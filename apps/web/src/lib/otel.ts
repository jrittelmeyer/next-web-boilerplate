import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";

/**
 * Opt-in OpenTelemetry trace export (path-to-100 #9).
 *
 * Sentry's Node SDK is OTel-based: `Sentry.init` builds the ONE global
 * `BasicTracerProvider` (sampler, resource, context manager) and accepts extra
 * span processors via its `openTelemetrySpanProcessors` option. Riding that
 * provider — instead of registering a second one — is what makes Sentry + OTLP
 * coexist with no double-instrumentation: every sampled span reaches both the
 * `SentrySpanProcessor` and the processors returned here.
 *
 * Gate: the standard `OTEL_EXPORTER_OTLP_ENDPOINT`. Unset (the default) → `[]`,
 * so the Sentry setup is identical to before this module existed. Set → one
 * `BatchSpanProcessor` around an OTLP/HTTP exporter. The exporter is constructed
 * with no arguments on purpose: it natively reads the OTEL_* env contract
 * (`OTEL_EXPORTER_OTLP_ENDPOINT` — it appends `/v1/traces` — plus
 * `OTEL_EXPORTER_OTLP_HEADERS` for vendor auth), and Sentry's provider resource
 * honors `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES`, so no config
 * plumbing is needed here.
 *
 * Node runtime only (imported from sentry.server.config.ts): the OTLP/HTTP
 * exporter needs Node APIs, so edge-runtime spans are not exported — the
 * standard posture for self-hosted Next. Traces only; metrics/logs are out of
 * scope (see SERVICES.md → OpenTelemetry).
 */
export function buildOtelSpanProcessors(): SpanProcessor[] {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return [];
  }
  return [new BatchSpanProcessor(new OTLPTraceExporter())];
}
