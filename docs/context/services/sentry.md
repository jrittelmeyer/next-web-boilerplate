# Sentry (Error Tracking)

> When to load: working on error tracking, the Sentry instrumentation layout, source-map upload (the Turbopack note below is canonical), or the opt-in OpenTelemetry trace export. Shared client/degradation conventions: [../SERVICES.md](../SERVICES.md).

- SDK: `@sentry/nextjs` (v10). Pulls `@sentry/webpack-plugin` / `@sentry/bundler-plugin-core`
  for build-time source-map handling; that in turn pulls `@sentry/cli`, whose
  native binary is intentionally **not** built by default (see below).
- Captures unhandled errors and Next.js performance data once a DSN is set.

**Config layout** — this repo uses the **current Sentry + Next 16 instrumentation
pattern**, not the older bare `sentry.client.config.ts` trio. All files live under
`apps/web/src/`:
- `instrumentation-client.ts` — browser `Sentry.init`; exports
  `onRouterTransitionStart = Sentry.captureRouterTransitionStart` (App Router nav tracing).
- `sentry.server.config.ts` / `sentry.edge.config.ts` — `Sentry.init` per runtime.
- `instrumentation.ts` — `register()` dynamically imports the server/edge config by
  `process.env.NEXT_RUNTIME`; exports `onRequestError = Sentry.captureRequestError`
  (captures errors in RSCs / route handlers / Server Actions).
- `next.config.ts` — wrapped with `withSentryConfig(nextConfig, {...})`.

**Graceful when unconfigured:** every `Sentry.init` passes
`dsn: process.env.NEXT_PUBLIC_SENTRY_DSN` + `enabled: Boolean(dsn)`. With the DSN unset
the SDK is a no-op (it does **not** throw — so unlike `lib/stripe.ts`/`lib/posthog.ts`
no guarded singleton is needed). `withSentryConfig` passes `org`/`project`/`authToken`
only when present, so a no-creds build never attempts source-map upload and never needs
the `@sentry/cli` binary — the build succeeds without observability creds.

> **Turbopack note:** Next 16's `next build` uses Turbopack. The Sentry SDK's
> *runtime* instrumentation works regardless of bundler, and source-map **upload now
> works under Turbopack too** — supported and on by default since
> `@sentry/nextjs@10.13` and `next@15.4.1` (this repo: 10.59 / 16.2.11), via Next's
> `runAfterProductionCompile` hook, so **no webpack build is needed**. The boilerplate
> default uploads nothing (no
> token); to enable upload, set `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`)
> and flip `@sentry/cli` to `true` in `pnpm-workspace.yaml` `allowBuilds` (the binary
> that performs the upload). Also: `disableLogger` is deprecated/unsupported under
> Turbopack — omitted here on purpose.

**Key env vars** (all **optional** — the app builds/runs without Sentry):
- `NEXT_PUBLIC_SENTRY_DSN` — enables the SDK (client + server). Unset → no-op.
- `SENTRY_ORG`, `SENTRY_PROJECT` — source-map upload target (build/CI).
- `SENTRY_AUTH_TOKEN` — CI only, for source-map upload / releases. To actually
  upload, also flip `@sentry/cli` to `true` in `pnpm-workspace.yaml` `allowBuilds`
  (left `false` so installs stay network-light — see [../DEPLOYMENT.md](../DEPLOYMENT.md)).

**Remove it** (self-contained):
1. Delete (under `apps/web/src/`) `instrumentation-client.ts`, `instrumentation.ts` (Sentry is
   its only content), `sentry.server.config.ts`, `sentry.edge.config.ts`.
2. Unwrap `next.config.ts`: remove the `import { withSentryConfig }` line and `export default
   nextConfig` directly instead of `withSentryConfig(nextConfig, {…})`.
3. `pnpm --filter web remove @sentry/nextjs`; optionally drop the `@sentry/cli` entry from
   `pnpm-workspace.yaml` `allowBuilds`.
4. Remove from `.env.example` + `env.ts`: `NEXT_PUBLIC_SENTRY_DSN` (`client` entry +
   `experimental__runtimeEnv` line), `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
5. Trim the CSP `connect-src` in `next.config.ts`: drop `https://*.sentry.io`.

## OpenTelemetry export (opt-in, path-to-100 #9)

Opt-in OTLP **trace** export to any OTel-compatible backend (local collector,
Honeycomb, Grafana, …) — alongside **or without** Sentry. Gate:
`OTEL_EXPORTER_OTLP_ENDPOINT`. Unset (the default) → zero OTel export, the prior
behavior exactly.

**Mechanism** (source-verified in the installed `@sentry/nextjs` 10.59.0): Sentry's
Node SDK *is* the app's OTel setup — `Sentry.init` builds the one global
`BasicTracerProvider` (its sampler, resource, context manager) and accepts extra
span processors via `openTelemetrySpanProcessors`. `lib/otel.ts` returns
`[BatchSpanProcessor(OTLPTraceExporter)]` when the endpoint is set, and
`sentry.server.config.ts` passes that to `Sentry.init` — one provider, one sampler,
no second pipeline, so Sentry + OTLP can't double-instrument by construction. Every
span Sentry samples (`tracesSampleRate: 1`) reaches both sinks: Next.js internals,
`pg` queries, Better Auth handlers (all observed live). Works **DSN-less** too — the
`SentrySampler` gates on `tracesSampleRate`, not the DSN (verified live: spans flow
with no DSN configured, and nothing is sent to Sentry).

**Env contract** (all standard OTel names, read natively by the exporter/SDK):

- `OTEL_EXPORTER_OTLP_ENDPOINT` — the gate; OTLP/HTTP base URL (the exporter
  appends `/v1/traces`). **Runtime, not build-inlined** — a deploy knob, no rebuild
  needed (unlike `NEXT_PUBLIC_SENTRY_DSN`, which Next inlines at build time into the
  server bundle too).
- `OTEL_SERVICE_NAME` — service name in the backend (default `"node"`; Sentry's
  provider resource honors it and `OTEL_RESOURCE_ATTRIBUTES`).
- `OTEL_EXPORTER_OTLP_HEADERS` — vendor auth, e.g.
  `x-honeycomb-team=<key>` (comma-separated `k=v` pairs).

**Scope:** traces only (no metrics/logs — add further processors/providers in
`lib/otel.ts` if a real need surfaces); **Node runtime only** (the OTLP/HTTP
exporter needs Node APIs, so edge-runtime spans aren't exported — the standard
posture for self-hosted Next). Export is server-to-server, so no CSP entry is
needed. The `BatchSpanProcessor` buffers (~5s flush): on serverless, an abrupt
shutdown can drop the last batch (Sentry already flushes on SIGTERM under Vercel).

**Local collector recipe** (how it was verified; also the quickest way to *see*
traces):

```bash
# otel-collector.yaml
# receivers: { otlp: { protocols: { http: { endpoint: 0.0.0.0:4318 } } } }
# exporters: { debug: { verbosity: detailed } }
# service: { pipelines: { traces: { receivers: [otlp], exporters: [debug] } } }
docker run --rm -d --name otel-collector -p 4318:4318 \
  -v "$PWD/otel-collector.yaml:/etc/otelcol/config.yaml" \
  otel/opentelemetry-collector:latest
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm --filter web start
# drive a few pages, wait ~5s, then: docker logs otel-collector
```

**Remove it:** delete `lib/otel.ts` + `lib/otel.test.ts` (and the
`src/lib/otel.ts` coverage-include line in `apps/web/vitest.config.ts`), drop the
`openTelemetrySpanProcessors` line from `sentry.server.config.ts`, `pnpm --filter
web remove @opentelemetry/exporter-trace-otlp-http @opentelemetry/sdk-trace-base`,
and remove the two `OTEL_*` entries from `env.ts` + `.env.example`.
