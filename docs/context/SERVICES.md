# Services

> When to load: working on a third-party integration — load the matching sub-file below; this index carries only what every service shares.

Three conventions apply to **every** integration and are stated once here, not per
file. **Lazy guarded singleton:** never construct a vendor client at import time —
construct on first use behind an `is*Configured()` gate, so a keyless build never
throws. **Graceful degradation:** every integration builds and runs with its env
unset; features light up only when configured, and failures degrade to typed errors
or logged no-ops, never crashes. **Removal:** each sub-file ends with a "Remove it"
checklist (code, deps, env vars, CSP).

| Service | File | Scope |
| --- | --- | --- |
| Stripe | [services/stripe.md](services/stripe.md) | Checkout, webhook → `subscriptions`, billing portal, per-org billing, entitlement gating, cancel-on-delete |
| Resend | [services/resend.md](services/resend.md) | Email templates, send helpers, deliverability/DNS, bounce & complaint suppression |
| Sentry | [services/sentry.md](services/sentry.md) | Error tracking, instrumentation layout, source-map upload (canonical Turbopack note), opt-in OTel export |
| BetterStack / Logtail | [services/betterstack.md](services/betterstack.md) | Structured logging façade (`@logtail/next`) |
| PostHog | [services/posthog.md](services/posthog.md) | Analytics, feature flags, identify/reset sync, consent gating, `/ingest` proxy |
| Uploadthing | [services/uploadthing.md](services/uploadthing.md) | File uploads, avatars, delete/cleanup, `next/image` optimization, tunnel runbook |
| Meilisearch | [services/meilisearch.md](services/meilisearch.md) | Search index + settings-as-code, tRPC read / Server Action writes, reindex |
| Background jobs | [services/jobs.md](services/jobs.md) | pg-boss queues, worker, retries, cron schedule, dead-letter queue |
| Dashboards-as-code | [services/observability-dac.md](services/observability-dac.md) | BetterStack monitors + heartbeats as code (dev/CI-only) |

The headings below are anchor stubs so every pre-split inbound link keeps resolving.

## Stripe (Payments)

→ moved to [services/stripe.md](services/stripe.md) (2026-07-23 split)

## Resend (Email)

→ moved to [services/resend.md](services/resend.md) (2026-07-23 split)

### Bounce & complaint handling (path-to-100 #8)

→ moved to [services/resend.md](services/resend.md) (2026-07-23 split)

## Sentry (Error Tracking)

→ moved to [services/sentry.md](services/sentry.md) (2026-07-23 split)

### OpenTelemetry export (opt-in, path-to-100 #9)

→ moved to [services/sentry.md](services/sentry.md) (2026-07-23 split)

## BetterStack / Logtail (Logging)

→ moved to [services/betterstack.md](services/betterstack.md) (2026-07-23 split)

## PostHog (Analytics + Feature Flags)

→ moved to [services/posthog.md](services/posthog.md) (2026-07-23 split)

## Uploadthing (File Uploads)

→ moved to [services/uploadthing.md](services/uploadthing.md) (2026-07-23 split)

## Meilisearch (Search)

→ moved to [services/meilisearch.md](services/meilisearch.md) (2026-07-23 split)

## Background jobs (`@repo/jobs` / pg-boss) — D7

→ moved to [services/jobs.md](services/jobs.md) (2026-07-23 split)

## Dashboards-as-code (`@repo/observability`) — BetterStack

→ moved to [services/observability-dac.md](services/observability-dac.md) (2026-07-23 split)
