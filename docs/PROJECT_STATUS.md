# Project Status & Handoff

> **Read first when resuming.** The lean "where we are / what's next" layer. Deeper
> material lives elsewhere so it isn't paid for on every resume:
>
> - Per-step rationale + verification → [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md)
>   (full Steps 1–29, Phase 3 C1–D11 + M1–M7, the audit-backlog P0–P3 detail, the
>   Phase-4 + Tier-4 upgrade-path prose, **and the archived build-progress rows**)
> - Cross-cutting decision log → [context/DECISIONS.md](context/DECISIONS.md) ·
>   Working agreements → [../AGENTS.md](../AGENTS.md) ·
>   Backlog → [BACKLOG.md](BACKLOG.md)
>
> **New shipped work: one ≤200-char row in the summary here; full prose goes to
> docs/archive/PHASE_HISTORY.md in the same commit. Never re-expand rows — this is
> the seventh compaction; the append-log must not regrow.**

_Last updated: 2026-07-23._

## Where we are

- **PUBLIC — launched 2026-07-14.** This repo is now a public GitHub template at
  [github.com/jrittelmeyer/next-web-boilerplate](https://github.com/jrittelmeyer/next-web-boilerplate),
  published as a fresh single-commit history (the full pre-launch history is archived
  privately). Post-publish hardening is on: secret scanning + push protection,
  CodeQL, vulnerability alerts, and a `main` ruleset that blocks force-pushes and
  branch deletion. Donation link live 2026-07-15: `.github/FUNDING.yml` + README
  point at the owner's PayPal.Me.
- **Phases 1–2 complete & verified** — full-stack breadth (Steps 1–16) hardened to the
  100/100 production bar (Steps 17–29); the read-only Phase B audit found **no must-fix
  correctness bugs** ([archive/PHASE_B_AUDIT.md](archive/PHASE_B_AUDIT.md)).
- **Phase 3 (feature depth) + the 100/100 audit backlog complete & on `main`** — Tier 0 ·
  C1–C4 · D1–D11 · M1–M7 · P0–P3 (one compact row per group below; full prose →
  [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md)).
- **Phase 4 (live SaaS) COMPLETE 2026-07-05 → 07** and **Stripe (Phase 5, test mode)
  COMPLETE 2026-07-13** — every integration in the starter is proven live against real
  creds; the per-section provenance banners in [VERIFICATION.md](VERIFICATION.md) are the
  record.
- **Every locally-buildable Tier-4 row SHIPPED (2026-07-07 → 13)**, incl. A23–A32 + A13.
  Eleven `/project-audit` passes: **93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 →
  100.0 → 100.0 → 99.65 → 99.65/100** — detail: `docs/archive/PROJECT_AUDIT_*.md`
  (latest: [PROJECT_AUDIT_2026-07-22B.md](archive/PROJECT_AUDIT_2026-07-22B.md); the
  07-22 flagged rows all shipped same-day — the audit ledger is clear).
- **Real host deploy PROVEN live on Fly.io 2026-07-13** and **production email domain +
  deliverability VERIFIED 2026-07-14** (hop-2 email-change delivery gap closed) —
  "Deploy / live-verify closes" summary row below.
- **CI is green** (`verify` · `audit` · `e2e` · `docker-image` · `visual` — the visual
  lane is live since A28). **CodeQL is live** — `ENABLE_CODEQL` is set on the public
  repo (code scanning is free once public); the variable gate stays so private forks
  don't go false-red ([context/DEPLOYMENT.md](context/DEPLOYMENT.md)).
- **The path-to-100 program (owner decision, 2026-07-15) is BUILD-COMPLETE — all 11
  rows #1–#11 shipped 2026-07-16 → 17, and the last remainder, #4b (the one-time live
  Uploadthing tunnel proof), closed 2026-07-17** (owner-approved cloudflared tunnel;
  see [VERIFICATION.md](VERIFICATION.md) → Uploadthing). Seven audit passes plateaued
  at 99.35 because the last 13 points sat behind won't-fix/deferred classifications;
  each was re-litigated and **all 13 proved recoverable**
  ([archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md) holds the
  per-row analysis). **VERIFIED 2026-07-17 — the eighth `/project-audit` pass graded
  100.0/100** ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md));
  **maintenance-only is the standing state again** (100 is a state to maintain — future
  passes re-run the currency checks). The TS7 cutover stays outside it (externally
  gated — stable-Next TS7 support; experimental in canary since 2026-07-10).
- **ai-dev-kit:** the repo's agentic-dev techniques are a portable skill library — the
  standalone [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit) (kit 0.7.0,
  the 2026-07-23 context-engineering release); this repo consumes the installed
  `.claude/` output (edit a clone, re-install — never the copies). Kit story: the kit
  repo's CHANGELOG + [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md).

## Build progress

All steps ✅ done and verified. The Steps 1–29 map stays below; every later program is
one summary row — the **full verbatim rows** (with their per-row "See" deep links) and
the exact verification each performed live in
[archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md), incl. the
[build-progress rows archived 2026-07-23, 7th compaction](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction).
Don't re-expand rows here — see the header protocol.

| Steps | Area |
| --- | --- |
| 1–2 | Scaffold (Turborepo/pnpm/tooling) · `apps/web` (Next 16, App Router, Tailwind v4, env) |
| 3–5 | `@repo/db` (Drizzle + Postgres) · Auth (Better Auth) · tRPC + Server Actions |
| 6–8 | UI (shadcn in `@repo/ui`) · Forms (RHF + Zod) · State (Zustand + TanStack Query) |
| 9–12 | Email (Resend) · Payments (Stripe) · Uploads (Uploadthing) · Search (Meilisearch) |
| 13–16 | Observability (Sentry/BetterStack/PostHog) · Testing (Vitest+Playwright+CI) · Docker · Docs |
| 17–20 | App Router resilience · Security headers + CSP · Auth hardening · App-level rate limiting |
| 21–24 | RBAC · Health endpoint + request telemetry · SEO/PWA scaffolding · Dark mode |
| 25–29 | Git hooks · Dependency/security automation · Community/editor files · Example entity (`posts`) · Testing depth |
| post-29 | CI fix: `test:e2e` turbo `passThroughEnv` (E2E lane green) · CodeQL gated opt-in |

Per-program summary (Rows = archived row count; full rows →
[the archived build-progress table](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction)):

| Program | Rows | Outcome | Full record |
| --- | --- | --- | --- |
| Phase 3 — feature depth (T0 · C1–C4 · D1–D11) | 2 | tests/CI/persistence hardening + 11 depth rows (posts pipeline → dashboards-as-code) | [Phase 3](archive/PHASE_HISTORY.md#phase-3--feature-depth-post-step-29) |
| Audit — M1–M7 + Tier 2 | 1 | audit fixes: OAuth UI · real `/account` · CSP-nonce recipe · two-hop email change + revoke-sessions | [archived rows](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction) |
| Audit backlog — P0–P3 | 4 | every P0–P3 row closed (open-redirect fix, DB indexes, sessions/deletion/uploads depth, a11y + e2e) — COMPLETE | [Audit backlog](archive/PHASE_HISTORY.md#audit-backlog--100100-pass-p0p3-2026-07-02--05--archived-record) |
| Phase 4 — live SaaS | 1 | every integration verified live 2026-07-05 → 07; provenance banners in [VERIFICATION.md](VERIFICATION.md) | [Tier 4 record](archive/PHASE_HISTORY.md#tier-4--upgrade-paths-phase-4--band-12-2026-07-05--08--archived-record) |
| Tier 4 — Bands 1–4 + A-rows | 37 | 2FA · passkeys · orgs · admin plugin · i18n · SSE · CAPTCHA · audit log · backup/DR · visual/perf/SBOM lanes · rate-limit storage · A1–A32 | [Tier 4](archive/PHASE_HISTORY.md#tier-4--upgrade-paths-phase-4--band-12-2026-07-05--08--archived-record) · [final rows](archive/PHASE_HISTORY.md#final-tier-4-rows--deploy--live-verify-closes-2026-07-12--14--archived-record) |
| Deploy / live-verify closes | 3 | Fly.io deploy proven live 07-13 · Stripe Phase-5 test-mode verify 07-13 · prod email domain + deliverability 07-14 | [final rows](archive/PHASE_HISTORY.md#final-tier-4-rows--deploy--live-verify-closes-2026-07-12--14--archived-record) |
| Launch — public template | 1 | PUBLISHED 2026-07-14: fresh single-commit history, hardening on, fresh-consumer proof; donation link 07-15 | [archived rows](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction) |
| Path-to-100 — #1–#11 | 11 | all 13 deferred audit points recovered; **VERIFIED 100.0/100** 2026-07-17 | [Path-to-100](archive/PHASE_HISTORY.md#path-to-100-program-2026-07-16--17--archived-per-row-record) |
| Maintenance — 2026-07-15 → 23 | 18 | advisory batches #1–#3 (incl. `next` 16.2.11) · security-triage pipeline · Renovate majors + schedule fix · kit programs/extraction · CI heartbeat · Pages Storybook · tagged releases · screenshot tour · image-opt e2e · init-app slim/tidy | [archived rows](archive/PHASE_HISTORY.md#build-progress-table--archived-from-project_statusmd-2026-07-23-7th-compaction) · [ai-dev-kit](archive/PHASE_HISTORY.md#ai-dev-kit-program-2026-07-17--18--archived-record) |
| Context-engineering — 2026-07-23 | 8 | kit 0.7.0 (hunt 7 · three-strikes · context-guard hook · budgets) · stable prefix + 7th compaction + provenance split · `auth/`+`services/` splits · 5 leaf AGENTS.md · memory −35% · docs-sanity CI lane | [program record](archive/PHASE_HISTORY.md#context-engineering-overhaul-2026-07-23--archived-program-record) |

Date-gated watch (full detail:
[MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)):
`fast-uri` override eligible ≥ 2026-07-26 · Renovate PR-delivery proof due 2026-07-27 ·
`next`/`@next/*` age-exclude removal 2026-07-28.

## Fresh project on-ramp (clone → build a real app)

- **Verify what's actually working** — [VERIFICATION.md](VERIFICATION.md) is a phased,
  hands-on checklist (free/no-account phases first) to prove every feature end-to-end and to
  finish the setup for the env-gated integrations. Phases 0–3 are dry-run-verified on Windows;
  Phases 4–6 carry dated live-verified banners (all COMPLETE in this repo).
- **Delete the demo/scaffold routes** as real features replace them — the "Demo /
  scaffold routes" table in [context/ARCHITECTURE.md](context/ARCHITECTURE.md) marks
  which routes are throwaway, which is the copy-me template (`/posts`), and which
  surfaces are real (the `/` landing page, the `(auth)` + `(dashboard)` shells, `/account`).
- **Copy the worked persistence examples** (Stripe webhook → `subscriptions`,
  Uploadthing → `uploads`) — see [context/DATABASE.md](context/DATABASE.md).
- **Deploy for real** — the worked Fly.io runbook is
  [context/DEPLOYMENT.md → Fly.io](context/DEPLOYMENT.md#flyio-worked-runbook)
  (proven live 2026-07-13); Vercel/Railway/VPS paths remain authored (unexercised).

## Resume / re-verify (from repo root)

```bash
docker compose -f docker/docker-compose.yml up -d   # start Postgres (+ Meilisearch)
pnpm install
pnpm --filter @repo/db db:migrate                   # apply any new migrations
pnpm lint && pnpm type-check && pnpm build          # full gate (all must pass)
```

To watch CI: `gh run watch <id>`, then confirm with `gh run view <id> --json
status,conclusion` — `watch --exit-status` alone has reported success on failed runs
(the `gh` CLI is installed + authed).

## Known non-issues (don't chase these)

- `engines.node >=24` is advisory (no `engine-strict`); older Node only warns on install.
- `drizzle-kit` pulls a deprecated transitive `@esbuild-kit/*` loader — benign, works
  fine; its vulnerable `esbuild` child is pinned by the 2026-07-15 override
  ([MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done)).
- npm flags `@react-email/components` (+ ~21 subdeps) "deprecated" with a generic
  message — it is the canonical package per Resend/React Email docs and renders fine
  (verified via `email export`); the warning is cosmetic.
- Toolchain gotchas (pnpm `allowBuilds`, TS 6, Biome 2.5 config, drizzle
  `import.meta.dirname`) are documented in STACK.md / CONVENTIONS.md / UI.md.
- The committed `.claude/` directory holds the Claude Code permissions allowlist
  (`settings.json`) and the ai-dev-kit install output (skills + hooks — edit a
  clone of [the kit repo](https://github.com/jrittelmeyer/ai-dev-kit),
  re-install); `settings.local.json` stays untracked (gitignored).
