# Backlog — Forward (Watch + Tier 4 upgrade paths)

> **Forward-only backlog** (formerly `PHASE_3_IDEAS.md`). Phases 1–5 and every
> locally-buildable Tier-4 row are complete and pushed to main. Shipped-item detail is
> **not** kept here: the compact record is the build-progress table in
> [PROJECT_STATUS.md](PROJECT_STATUS.md), and the full per-item prose is in
> [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md). The audits that seeded past
> backlogs live in [docs/archive/](archive/) (Phase B + the ten `/project-audit`
> scoring passes: 93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 → 100.0 → 100.0 → 99.65/100). Everything below
> goes plan → sign-off → build. Don't reintroduce shipped-item entries here.

## Watch (no action now)

- **TypeScript 7** — **GA'd as `typescript@7.0.2` (2026-07-08)**, but a 2026-07-13 cutover
  attempt (owner-approved override of the age gate; repo undeployed → no prod risk) found it
  **not yet adoptable here.** TS 7's package IS the native **Go** compiler and **ships no JS
  Compiler API** — its `typescript` module exposes only `version`; `createProgram`/`readConfigFile`/
  `sys`/`transpileModule` are gone and there is no `lib/typescript.js` (the programmatic API moved
  to `./unstable/*`). So `next build` fails at its TS-detection step (Next 16 stable embeds the
  classic API). This is **known & expected**: every library-API consumer (Next, webpack loaders,
  Vue/Svelte/Astro/MDX/Angular) must stay on TS 6 until the stable programmatic API returns in
  **TS 7.1 (~Q4 2026)**. **Upstream moved 2026-07-10:** Next merged **experimental TS7 support
  into canary** ([#95639](https://github.com/vercel/next.js/pull/95639) — detects TS7 and offers
  `experimental.useTypeScriptCli`, shelling out to the CLI instead of the JS API; auto-detect
  planned before stable), closing the tracking issue
  [#95490](https://github.com/vercel/next.js/issues/95490) as completed
  ([#95633](https://github.com/vercel/next.js/discussions/95633) remains the discussion). Not in
  any stable 16.2.x as of 2026-07-15. The `tsc` CLI itself is clean and
  **~3.6× faster** (monorepo type-check 20.5s → 5.7s, cache-bypassed), so the win is real.
  **Re-gate: on TS7 support reaching a *stable* Next release** (`useTypeScriptCli` or its
  auto-detect successor) — potentially ahead of TS 7.1, since Next now shells to the CLI.
  (Mechanics learned: the pnpm age gate re-validates the whole lockfile on every `pnpm
  run`/frozen install, not just `pnpm install` — any early adoption needs a
  `minimumReleaseAgeExclude`.)
- **Maintenance-only** (Tier 3 **G**) — the honest "we're done" option: let Renovate drive
  deps, keep docs current, add steps as real needs surface. Standing state 2026-07-12 →
  2026-07-15; superseded 2026-07-15 by the path-to-100 program (owner decision;
  [archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md)); **RESUMED
  2026-07-17** — the program shipped all 11 rows and the eighth scoring pass verified it
  at **100.0/100** ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md)).
  The scheduled Renovate batch has **not opened as of 2026-07-22**, and the
  2026-07-22 audit found it is **blocked, not waiting** — the scheduled lane has
  never produced a PR (0 `renovate/*` branches ever; all 7 merged PRs came from
  manual dashboard-approval clicks). Fix is the B1 row below. The 7 approved
  majors merged 2026-07-18; typescript-v7 stays held per the TS7 gate, and
  `actions/setup-node v7` is a new pending-approval major.
- **e2e signup flake** — the `signUp`→`/dashboard` Playwright step is intermittently flaky
  (absorbed by `retries:2`, but it twice burned 2 of 3 CI attempts). **Not a code bug** — a
  fragile signup+redirect timing flow on modest runners. Harden **only if it ever turns a lane
  red**: bump that test's timeout, or wait on a network/cookie signal rather than only the URL.
- **Temporary security overrides** — pnpm `overrides:` in `pnpm-workspace.yaml`
  remediating transitive-only advisories: `effect` 3.21.4 · `postcss` 8.5.15 ·
  `esbuild` 0.25.12 (2026-07-15, Dependabot alerts #1–#3, no upstream fix) and
  `brace-expansion` 5.0.7 · `dompurify` 3.4.12 · `sharp` 0.35.3 (2026-07-22, newly
  disclosed that week — **only `brace-expansion` was a Dependabot alert; the other
  two plus `fast-uri` came from the CI `pnpm audit` lane**). Plus a temporary
  `auditConfig.ignoreGhsas` pair for `fast-uri` (fix too fresh for the age gate,
  ~2026-07-26). Remove each when its condition clears — per-package removal
  conditions in [MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done).
- **Ship a real derived product end-to-end** (intent-level driver, owner-driven) — a real
  app built to completion on the template is the strongest validation of the
  "verified end-to-end" claim, **unlocks the gated B1 intake-drop row**, and supplies the
  proof the positioning reframe (Open rows) needs — consumption finds what audits can't
  (both inception trials did). Already tracked in memory `derived-project-intake-trial`;
  starts via `/project-init`. No template action until it begins; it then feeds the on-ramp
  rows with real lessons.

## Tier 4 — Future upgrade paths (documented, unscheduled)

> Each open row is a real direction, **opt-in / on real need** (the starter is
> feature-complete without them), and goes plan → sign-off → build. Shipped rows keep one
> strikethrough line in the table at the bottom — the record is the PROJECT_STATUS
> build-progress table + the doc in "See"; don't re-expand them here.
>
> **The path-to-100 program** (2026-07-15, owner-directed) — 11 rows recovering the 13
> audit points locked behind won't-fix/deferred classifications (per-row re-analysis in
> [archive/PATH_TO_100_2026-07-15.md](archive/PATH_TO_100_2026-07-15.md)) — **shipped all
> 11 build rows 2026-07-16 → 17** (strikethrough table below), closed the last remainder
> (**#4b**, the one-time live Uploadthing tunnel proof, 2026-07-17), and was **VERIFIED
> at 100.0/100 by the 2026-07-17 scoring pass**
> ([archive/PROJECT_AUDIT_2026-07-17.md](archive/PROJECT_AUDIT_2026-07-17.md)). The
> **TypeScript 7 cutover** stays outside the program (externally gated, costs no
> points; see Watch). The 2026-07-22 pass scored **99.65** — the first drop since,
> and none of it code: see the four new rows below
> ([archive/PROJECT_AUDIT_2026-07-22.md](archive/PROJECT_AUDIT_2026-07-22.md)).

### Open rows

| Band | Area | Upgrade | Documented in | Notes |
| --- | --- | --- | --- | --- |
| B1 | Tooling / deps | **Widen the Renovate schedule so the batch can actually land** — replace `"schedule": ["before 6am on monday"]` with a full-day window (e.g. `["on monday"]`), add an explicit `"timezone"`, and consider raising `prHourlyLimit`; confirm on the next window that PRs actually open | [.github/renovate.json](../.github/renovate.json) · [MAINTENANCE.md](MAINTENANCE.md) | **Highest-value open row.** The scheduled lane has produced **0 PRs ever** — 0 `renovate/*` branches on the remote, all 7 merged PRs created by manual dashboard-approval clicks, and the one elapsed Monday window (2026-07-20 00:00–06:00 UTC) yielded nothing despite 37 ready updates. A 6-hour UTC window requires Mend's hosted run cadence to intersect it; runs outside it only refresh the dashboard. Three stalled updates (`postcss`→8.5.19, `esbuild`→0.28.1, `effect`→3.22.0) are exactly the bumps that retire the temporary overrides. Every downstream copy inherits this config. Detail → [archive/PROJECT_AUDIT_2026-07-22.md](archive/PROJECT_AUDIT_2026-07-22.md) F1 |
| B1 | Docs / release | **Record the security remediations in CHANGELOG** — add the 2026-07-15 and 2026-07-22 override batches to `[Unreleased]`, flagging that `sharp` is forced past Next's own `^0.34.5` pin on a runtime path | [CHANGELOG.md](../CHANGELOG.md) | The CHANGELOG has **zero** mentions of any security remediation, while the same window's Storybook/screenshot changes are logged. Consumers whose documented update path is cherry-picking template commits have no record of the only security-relevant changes. Detail → audit F2 |
| B1 | Docs accuracy | **Relabel the non-Dependabot advisories in `pnpm-workspace.yaml`** — the comment header still says "Dependabot remediation (2026-07-22)"; only `brace-expansion` was a Dependabot alert | pnpm-workspace.yaml | Doc-side labels (MAINTENANCE.md, BACKLOG) fixed in the 2026-07-22 audit pass; the config-file comment rides the next code touch (M-1 precedent). The mislabel misdirects the verification method — Dependabot alone would have missed a HIGH on `sharp`. Detail → audit F3 |
| B2 | Uploads / testing | **Cover the image-optimization path** — assert `/_next/image` returns a transformed response (keyless, against a local asset) | apps/web/e2e · [SERVICES.md](context/SERVICES.md) | `sharp: 0.35.3` overrides Next's exact `^0.34.5` on a path the app really uses (`uploads-list.tsx` → `next/image` → `/_next/image`), and **no test touches images** — green CI proves install + build, not that the optimizer still transforms. Needs a keyless-safe fixture image. Detail → audit F4 |
| B4 | Toolchain | **TypeScript 7 cutover** (outside the program) | STACK.md | **Blocked on TS7 support reaching a stable Next release** (experimental in canary since 2026-07-10; TS 7.1 ~Q4 2026 restores the JS API for the rest of the toolchain) — full detail in Watch above. Costs no audit points. |
| B1 | On-ramp / kit | **Intake-drop convention for `/project-init`** — template half: seed a committed `docs/intake/` (README: drop planning docs here → run `/project-init`) + a GETTING_STARTED sentence + init-app kept-list mention; kit half: `init.intakeDir` adapter field (default `docs/intake/`), intake enumeration in project-init §1, raw docs → `docs/archive/product-intake/` in the inception commit after brief sign-off (prevents a second source of truth beside `PRODUCT.md`) | [GETTING_STARTED.md](GETTING_STARTED.md#starting-from-an-idea-run-project-init) | Direction owner-approved 2026-07-18; **build after the first real derived-project inception run (in flight) supplies lessons.** Kit half edits an ai-dev-kit clone → re-install (`--dest`), never the installed copies. Verified: init-app `--slim`'s delete list doesn't touch `docs/intake/`. Sibling convention shipped 2026-07-19: `intake/source/` (gitignored **code** drop for `/project-adopt`) stays separate — committed planning docs vs never-committed source. Plan → sign-off before building. |
| B3 | Docs / positioning | **README / tagline reframe around the agent-native workflow** (OWNER-DIRECTED) — lead with the real differentiator: the context-doc system + working agreements + verification culture + ai-dev-kit's two inception doors, not the wiring | README.md · AGENTS.md | Dozens of starters have the wiring; nothing else has the operating system around it, and today it's buried in AGENTS.md / the docs. This is framing/marketing judgment — needs an owner decision, not a mechanical build. Pairs with the visual surface + the derived-product proof. |
| B1 | Kit | **Second ai-dev-kit adapter (portability proof)** — author an adapter for a different stack to exercise the kit's stack-agnostic claim end-to-end | ai-dev-kit repo (`adapters/`) · [CLAUDE.md](../CLAUDE.md) | **Recommend waiting for a real second-stack project to pull it** — an adapter with no consuming repo is unverifiable. On real need. |

### Shipped (strikethrough record — full rows in the PROJECT_STATUS table + archive/PHASE_HISTORY)

| Band | Upgrade | Shipped | See |
| --- | --- | --- | --- |
| B3 | ~~Visual surface (a): README screenshot tour~~ — 4 retina PNGs from a real **keyless** prod run (landing light+dark, signed-in dashboard, `/account`), captured via a throwaway Playwright script against a fresh `:3100` build, committed to `docs/assets/` and wired into a `## Screenshots` section high in the README + a "See it" strip in FEATURES.md. Two-env-var-only surface (no keys, no consent banner). **This closes the whole B3 visual-surface row** (both halves shipped) | 2026-07-20 | [README.md](../README.md#screenshots) · [docs/FEATURES.md](FEATURES.md) · docs/assets/ |
| B3 | ~~Visual surface (b): hosted component gallery on GitHub Pages~~ — new `.github/workflows/pages.yml` publishes the `@repo/ui` Storybook static export to Pages (build → `configure-pages` / `upload-pages-artifact` / `deploy-pages`, SHA-pinned; subpath-safe relative assets; push-to-`main`-on-`packages/ui/**` + `workflow_dispatch`; Pages enabled once out-of-band — the Actions token can't create the site). Live at jrittelmeyer.github.io/next-web-boilerplate; linked from README + UI.md. Screenshot-tour half (a) shipped alongside (row above) | 2026-07-20 | [.github/workflows/pages.yml](../.github/workflows/pages.yml) · [context/DEPLOYMENT.md](context/DEPLOYMENT.md#storybook-on-github-pages-component-gallery) |
| B1 | ~~Tagged releases + template-update path~~ — cut the repo's first git tags + GitHub Releases (**v1.0.0** on launch `f224e98`, **v1.1.0** on the tip) with a new CHANGELOG `[1.1.0]` milestone rollup + compare links; a GETTING_STARTED "Staying current with the template" recipe (remote + fetch + **cherry-pick**; naive merge refused / `--allow-unrelated-histories` = 143 files, dry-run-proven; honest conflict zones) | 2026-07-20 | [CHANGELOG.md](../CHANGELOG.md) · [GETTING_STARTED.md](GETTING_STARTED.md#staying-current-with-the-template) |
| B3 | ~~Scheduled CI heartbeat on `main`~~ — a weekly `schedule` (`cron: "30 4 * * 4"` — Thursdays 04:30 UTC) + `workflow_dispatch` added to `ci.yml` so the full pipeline (e2e / docker-image / scan) keeps running between merges; offset from CodeQL's Monday cron, opt-in GHCR steps stay `push`-gated. Verified: `workflow_dispatch` run green (first scheduled run self-confirms at the next cron) | 2026-07-20 | [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [context/DEPLOYMENT.md](context/DEPLOYMENT.md#cicd-github-actions) |
| B3 | ~~UI.md token-sheet adoption recipe~~ — worked "adopt an existing brand/token sheet" section: a `/project-adopt`-survey-shaped sheet mapped in five moves onto `tooling/tailwind/base.css` (semantic slots + oklch, authored `.dark`, `next/font` hand-off, radius/spacing/breakpoints, chart/sidebar sets; Storybook both-themes verify + visual-baseline note); AGENTS.md UI.md-row trigger words extended | 2026-07-19 | [context/UI.md](context/UI.md#adopting-an-existing-brand--token-sheet) |
| B1 | ~~`init-app --slim` leftover-pointer tidy #2~~ — the two `docs/MAINTENANCE.md` mention-patches had drifted out from under the doc text (a "Currently:" rewording + a paragraph rewrap), so slim left the `:71`/`:114` pointers dead; `from`-strings updated to the current text — scratch-verified fresh + idempotent re-run (report now lists only the intentional GETTING_STARTED lines) | 2026-07-19 | scripts/init-app.mjs · GETTING_STARTED.md → Remove what you don't need |
| B1 | ~~M-1: two stale `postgres:16` comments → `postgres:18`~~ — the last two in-code mentions of the pre-2026-07-18 CI service version, closing the 07-18 audit's one nit | 2026-07-19 | packages/db/vitest.config.ts · packages/jobs/vitest.integration.config.ts |
| B1 | ~~project-adopt live trial (program step 3)~~ — full `/project-adopt` flow on a fresh degit consumer copy adopting **linkding 1.45.0**: live-local reference grade (booted via its own compose), drop-dir + git-URL intake forms + the re-run/resume branch, five-bucket disposition map, importer-as-feature migration plan, inception commit excluding the gitignored source; two skill mends → **kit 0.6.1** (project-adopt 0.1.1) — **project-adopt program COMPLETE** | 2026-07-19 | ai-dev-kit CHANGELOG 0.6.1 · PROJECT_STATUS row |
| B3 | ~~ai-dev-kit extraction~~ — the kit is a standalone public repo, [jrittelmeyer/ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) (0.5.0: fresh single-commit history, two-OS smoke CI, secret scanning + vuln alerts + CodeQL + protect-main ruleset); this repo consumes the installed `.claude/` output and re-installs from a clone (`--dest`); doc-audit's dual-home source of truth handed to the kit repo (0.1.1) | 2026-07-18 | CLAUDE.md · PROJECT_STATUS B3 row |
| B1 | ~~`init-app --slim` leftover-mention tidy (U1)~~ — the 8 known dead pointers in kept docs are retargeted at the public template repo or rewritten; the report is per-line and skips deliberate retargets | 2026-07-18 | scripts/init-app.mjs · GETTING_STARTED.md → Remove what you don't need |
| B1 | ~~AGENTS.md `PRODUCT.md` index placeholder (U2)~~ — commented row under the context-doc table; `/project-init` (0.1.2, kit 0.4.2) uncomments it instead of authoring a row | 2026-07-18 | AGENTS.md · ai-dev-kit CHANGELOG 0.4.2 |
| B1 | ~~project-init live trial (program step 3)~~ — full `/project-init` flow on a fresh degit consumer copy (sample product "Potluck"); two skill mends → **kit 0.4.1**; trial findings U1/U2 became the on-ramp rows above | 2026-07-18 | ai-dev-kit CHANGELOG 0.4.1 · PROJECT_STATUS ai-dev-kit row |
| B1 | ~~UT prod-callback tunnel proof (program #4b)~~ — closed program #4 | 2026-07-17 | SERVICES.md → Uploadthing · VERIFICATION.md → Uploadthing |
| B4 | ~~Per-org billing (program #11)~~ | 2026-07-17 | SERVICES.md → Stripe · PROJECT_STATUS Path-to-100 · #11 |
| B3 | ~~`CSP_MODE=nonce` as a first-class mode (program #10)~~ | 2026-07-17 | SECURITY.md → CSP strategy · PROJECT_STATUS Path-to-100 · #10 |
| B3 | ~~Opt-in OpenTelemetry (program #9)~~ | 2026-07-16 | SERVICES.md → OpenTelemetry · PROJECT_STATUS Path-to-100 · #9 |
| B3 | ~~Email bounce/complaint handling (program #8)~~ | 2026-07-16 | SERVICES.md → Resend (bounce/complaint) · PROJECT_STATUS Path-to-100 · #8 |
| B2 | ~~i18n full-surface message coverage (program #7)~~ | 2026-07-16 | I18N.md · PROJECT_STATUS Path-to-100 · #7 |
| B2 | ~~Magic-link sign-in, env-gated (program #6)~~ | 2026-07-16 | AUTH.md → Magic link · PROJECT_STATUS Path-to-100 · #6 |
| B1 | ~~`updatePost` → `fieldErrors` error shape (program #1)~~ | 2026-07-16 | API.md → Typed field errors · PROJECT_STATUS Path-to-100 · #1 |
| B1 | ~~`persist` wired to `ui-store`, hydration-safe (program #2)~~ | 2026-07-16 | STATE.md → Middleware decision · PROJECT_STATUS Path-to-100 · #2 |
| B1 | ~~Admin-gate `reindexPosts` (program #5)~~ | 2026-07-16 | SERVICES.md → Meilisearch · PROJECT_STATUS Path-to-100 · #5 |
| B1 | ~~Dead-letter queue wired (program #3)~~ | 2026-07-16 | SERVICES.md → Jobs (dead-letter) · PROJECT_STATUS Path-to-100 · #3 |
| B1 | ~~Enable CodeQL~~ — `ENABLE_CODEQL` flipped the day the repo went public (code scanning is free on public repos); the pre-publish git-history secrets scan happened as part of the launch. | 2026-07-14 | DEPLOYMENT.md → CI/CD · PROJECT_STATUS launch row |
| B3 | ~~Production sending domain + deliverability~~ — a real verified domain + SPF/DKIM/DMARC recipe; deliverability + the hop-2 email-change delivery gap (open since 2026-07-05) proven/closed live. Bounce/complaint handling remains open (row above). | 2026-07-14 | [SERVICES.md → Resend](context/SERVICES.md) · [VERIFICATION.md](VERIFICATION.md) → Resend |
| B1 | ~~Real host deploy~~ — **PROVEN live on Fly.io** (test app, managed `fly postgres`; `/api/health` 200 + sign-up→DB confirmed). Vercel/Railway/VPS paths stay authored. | 2026-07-13 | [DEPLOYMENT.md → Fly.io](context/DEPLOYMENT.md#flyio-worked-runbook) · [VERIFICATION.md](VERIFICATION.md) Phase 6 |
| B2 | ~~Stripe Phase-5 live-verify~~ — **COMPLETE in test mode** (checkout → webhook → row + idempotency; customer reuse; billing portal; test-clock dunning; webhook 400/503/429; A13 cancel-on-delete live). Doc-only close. | 2026-07-13 | [VERIFICATION.md](VERIFICATION.md) Phase 5 |
| B1 | ~~HIBP compromised-password check · 429 rate-limit headers · Avatar upload~~ | 2026-07-07→08 | AUTH.md / SECURITY.md / SERVICES.md |
| B1 | ~~A1 toasts · A2 subscription gating · A3 cron job · A4 PG-pooling docs · A5 email render tests · A6 remotePatterns · A7 fieldErrors · A8 search settings-on-create · A9 security.txt · A10 manypkg · A11 release-age gate~~ | 2026-07-08 | PROJECT_STATUS **Tier 4 · A1–A11** row |
| B2 | ~~2FA / TOTP~~ | 2026-07-08 | AUTH.md → Two-factor |
| B2 | ~~A14 Skeleton · A15 db.transaction example · A16 user-keyed rate-limited procedure~~ | 2026-07-08 | UI.md / DATABASE.md / API.md |
| B2 | ~~DB backup / restore / DR runbook~~ | 2026-07-09 | DATABASE.md → Backup, restore & DR |
| B2 | ~~Persisted audit log + `/admin/audit` read UI~~ | 2026-07-09 | AUTH.md → Persisted audit trail |
| B2 | ~~Docker-image CI (build · smoke · Trivy · opt-in GHCR publish)~~ | 2026-07-09 | DEPLOYMENT.md → CI/CD |
| B2 | ~~A12 — Opt-in CAPTCHA (Cloudflare Turnstile)~~ | 2026-07-11 | AUTH.md → Bot protection / CAPTCHA |
| B3 | ~~Passkeys / WebAuthn~~ | 2026-07-09 | AUTH.md → Passkeys |
| B3 | ~~Consent gate + GDPR data-export~~ | 2026-07-09 | SERVICES.md → PostHog + AUTH.md → Data export |
| B3 | ~~`@repo/ui` Dialog tall-content fix~~ | 2026-07-09 | UI.md → Dialog |
| B3 | ~~A17 next/font recipe · A18 magic-link/OTP recipe · A19 removal checklists · A20 failed-job note · A21 URL-state doc~~ | 2026-07-09 | UI.md / AUTH.md / SERVICES.md / STATE.md |
| B3 | ~~Visual regression for `@repo/ui` (opt-in)~~ | 2026-07-09 | UI.md → Visual regression |
| B3 | ~~Performance budgets in CI (opt-in)~~ | 2026-07-10 | DEPLOYMENT.md → Performance budgets |
| B3 | ~~SBOM / provenance attestation~~ | 2026-07-10 | DEPLOYMENT.md → CI/CD |
| B3 | ~~Multi-instance rate-limit storage~~ | 2026-07-10 | AUTH.md → Multi-instance storage |
| B3 | ~~Slim worker image~~ | 2026-07-10 | DEPLOYMENT.md → Background-jobs worker |
| B3 | ~~CSP-nonce example rework for the i18n proxy~~ | 2026-07-12 | SECURITY.md → CSP strategy · DECISIONS.md |
| B4 | ~~Organizations / multi-tenancy~~ | 2026-07-08 | AUTH.md → Organizations |
| B4 | ~~Admin plugin (ban + impersonation)~~ | 2026-07-10 | AUTH.md → Admin plugin |
| B4 | ~~i18n / next-intl~~ | 2026-07-11 | I18N.md |
| B4 | ~~A22 — SSE / realtime notifications example~~ | 2026-07-12 | API.md → Realtime / SSE |
| B3 | ~~A23 — SSE reconnect backfill~~ | 2026-07-11 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A26 — `Table` primitive in `@repo/ui` (+ `/admin/audit` consumer)~~ | 2026-07-11 | UI.md → Adding shadcn Components |
| B3 | ~~A24 — authoritative unread-count badge (`notification.unreadCount` as SQL `count()`, wired to the feed)~~ | 2026-07-11 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A25 — keyset-paginate `notification.list` ("Load more"; infinite-query cache)~~ | 2026-07-12 | API.md → Realtime / SSE · STATE.md |
| B3 | ~~A29 — `DB_POOL_MAX` env → `Pool({ max })` (deploy-tunable pool size)~~ | 2026-07-12 | DATABASE.md → Connection pooling · DEPLOYMENT.md |
| B3 | ~~A28 — Linux visual baselines + `ENABLE_VISUAL` (the visual lane runs on every PR/push now)~~ | 2026-07-12 | UI.md → Visual regression |
| B3 | ~~A27 — dead-code / unused-dep gate (knip) in CI's `verify` lane~~ | 2026-07-12 | STACK.md · DEPLOYMENT.md → CI/CD · CONVENTIONS.md → Exports |
| B3 | ~~A30 — worked next-intl formatting recipe (`useFormatter` / named formats / `timeZone` gotcha)~~ | 2026-07-12 | I18N.md → Formatting dates, numbers & currency |
| B2 | ~~`post.list` / `post.listMine` uuid-cursor hardening (`id: z.uuid()`, the A25 pattern; pre-fix 500 live-reproduced — the error body leaked the query text)~~ | 2026-07-12 | API.md → Cursor pagination |
| B3 | ~~A32 — locale-aware date formatting (`formats`/`timeZone` in `request.ts` + notifications feed → `useFormatter().dateTime`; the A30 recipe's consumer half)~~ | 2026-07-12 | I18N.md → Formatting dates, numbers & currency |
| B2 | ~~A13 — cancel Stripe subscription on account deletion (`deleteUser.beforeDelete` capture → `cancel-stripe-subscriptions` job → `@repo/jobs` worker; immediate cancel, Stripe customer kept)~~ | 2026-07-13 | SERVICES.md → Stripe · AUTH.md → Danger zone |
| B4 | ~~A31 — `typedRoutes` evaluation~~ (**evaluated → NOT adopted**: the `[locale]` tree makes the checking vacuous-or-wrong; next-intl's flattened nav typing is out of its reach) | 2026-07-12 | DECISIONS.md |
