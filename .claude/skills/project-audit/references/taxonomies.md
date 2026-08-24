# Feature-group starters, per project type

## Contents
- How to use
- web-app (SaaS-shaped)
- api-service
- cli
- library
- game
- data
- mobile · desktop

## How to use

Pick 12–16 groups that fit the repo. A product brief that defines its own
feature groups + bar **overrides these defaults** — these are the starting
taxonomy when no brief exists. Merge/split groups so every group is big enough
to score meaningfully and small enough that a deduction is actionable.

## web-app (SaaS-shaped)

monorepo/tooling · framework/app architecture · database · auth/access-control
· API layer · UI/design system · state/data · forms/validation · email ·
payments · uploads · search · jobs · observability · security · testing/CI ·
deployment/ops · docs/DX. Perf axis: indexes, caching, bundle size, N+1s,
unnecessary client JS.

## api-service

service architecture · API design/contracts (versioning, pagination, errors) ·
database/persistence · authn/authz · rate limiting/abuse · jobs/queues ·
observability (logs/metrics/traces) · resilience (timeouts, retries,
idempotency) · security · testing/CI · deployment/ops · docs (API reference,
client examples). Perf axis: latency percentiles, connection pooling, hot-path
allocations.

## cli

command architecture (parsing, subcommands, config precedence) · UX
(help/errors/exit codes, TTY vs piped output) · I/O and formats · performance
on large inputs · cross-platform behavior (paths, encoding, signals) ·
packaging/distribution (installers, single-binary, completions) · plugin/ext
surface (if any) · security (input handling, temp files) · testing/CI (golden
outputs, platform matrix) · docs (man/README/examples).

## library

public API design · type surface/contracts · error model · packaging (entry
points, exports map, artifact hygiene) · compatibility window (host/runtime
versions, semver discipline) · performance/allocation on hot paths · docs
(reference + runnable examples) · testing/CI (API-surface diff, matrix) ·
security (supply chain, no side effects on import) · DX (source maps, debug
builds, error messages).

## game

core loop/gameplay systems · engine architecture (scenes, ECS/nodes, assets
pipeline) · content tooling (editors, importers) · rendering/visuals ·
audio · input (devices, rebinding) · save/persistence · performance
(frame-time budget, memory, loading) · platform/exports · multiplayer/services
(if any) · accessibility (remapping, subtitles, colorblind) · testing/CI
(headless suites, golden frames) · build/release pipeline · docs/DX.

## data

pipeline architecture (orchestration, dependencies) · data modeling/schemas ·
ingestion/connectors · transforms (correctness, null/boundary handling) ·
data quality gates (tests, expectations, freshness SLAs) · idempotence/backfill
story · performance/cost (partitioning, incremental) · observability (lineage,
run metadata, alerting) · security/PII handling · testing/CI · docs (dataset
contracts, runbooks).

## mobile · desktop

app architecture · navigation/state · offline/sync · platform integration
(notifications, permissions, deep links) · packaging/signing/update channel ·
performance (startup, memory, battery) · accessibility · crash/analytics
observability · security (storage, transport) · testing/CI (device/OS matrix)
· docs/DX.
