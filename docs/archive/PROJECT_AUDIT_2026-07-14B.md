# Project Audit — 2026-07-14B (fifth scoring pass, post-public-launch)

> The `/project-audit` skill's fifth run, the same day as the fourth
> ([PROJECT_AUDIT_2026-07-14.md](PROJECT_AUDIT_2026-07-14.md), **99.3/100**) and hours
> after the repo **went public** at
> [github.com/jrittelmeyer/next-web-boilerplate](https://github.com/jrittelmeyer/next-web-boilerplate)
> (template flag on, fresh single-commit history). The genuinely new surface since the
> fourth pass is the **launch documentation layer** — `README.md` (overhaul),
> `docs/FEATURES.md`, `docs/GETTING_STARTED.md`, `docs/MAINTENANCE.md`, `AGENTS.md` (+
> the `CLAUDE.md` shim), `CHANGELOG.md`, `docs/README.md` — which had been gate- and
> link-verified at authoring time but whose **claims had never been audit-verified
> against the code**, plus the depersonalization edits and the public-template posture.
>
> **Method.** (a) **Delta-bounding via git:** the published tree (`f224e98`) is
> byte-identical to the private launch tip, and the full diff from the
> fourth-pass-verified state (`43257f7`) to that tip touches **only docs**, the root
> `package.json` metadata block (license/author/repository), and an `init-app.mjs`
> help-text pointer — so **product code is provably the exact code the 99.3 pass
> verified**; no re-audit of unchanged source was performed, and the fourth pass's
> per-group findings carry by identity. (b) **Claim verification of every launch doc**
> against code: counts (16 migrations · 19 E2E specs · 8 email templates · 14 context
> docs · two required env vars in `env.ts` · axe scan surfaces), every
> rename-checklist target in GETTING_STARTED (`site.ts`, landing `<h1>` + the two E2E
> assertions, seed strings, `nwb-*` container/CI/rate-limit/fly names, the
> hostname-derived 2FA-issuer/passkey-RP hooks in `packages/auth/src/config.ts`), the
> `init-app.mjs` behavior contract (seed-never-overwrite, `--name` rename + README
> title, npm-name validation), the MAINTENANCE automation claims (Renovate
> `minimumReleaseAge: "7 days"` + `vulnerabilityAlerts.minimumReleaseAge: null`
> security bypass, pnpm `minimumReleaseAge: 10080` with **no** security exemption,
> `auditConfig.ignoreGhsas` reasons, the `vite` override, `ENABLE_*` job-level `if:`
> gates that skip silently, the `CODECOV_TOKEN`-gated upload step, `cache:prune` on
> `pre-push`), and the `security.txt` placeholder + in-file warning. (c)
> **Depersonalization leak grep** across all tracked files: zero hits for any private
> identity token; the only person-identifying strings are the deliberate dedicated
> contact email (`.github/SECURITY.md`, `CODE_OF_CONDUCT.md`, `package.json` author),
> the repo URLs, and LICENSE. (d) **Live public-repo checks:** visibility PUBLIC,
> `is_template: true`, CI **and** CodeQL green on both public commits (runs
> 29376904734/29376904731 on `f224e98`, 29377464313/29377464361 on `968084e` — the CI
> runs include the always-on `visual` lane), README badge wired to the real workflow.
> The fresh-consumer degit test (install → `init-app` → build → tests, keyless, green)
> was proven at launch and is recorded in GETTING_STARTED, including the Windows
> MAX_PATH gotcha it surfaced. Same rubric and calibration as the prior passes.
>
> **Headline: overall 99.3/100 (unchanged).** No correctness bugs (code is
> byte-identical to the verified tree). **Three doc drifts found on the launch-doc
> surface, all fixed in this pass. Zero new backlog rows** — the second consecutive
> pass to generate nothing. **Maintenance-only stands.** One operational observation:
> the Renovate GitHub App is not yet installed on the new public repo, so dependency
> automation is dormant until it is (an owner setup step MAINTENANCE.md already
> documents for any fork — it applies to this repo too).

## Launch-surface verification (claims vs code)

| Claim (doc) | Verified |
| --- | --- |
| "Boots with two env vars" (README/FEATURES/GETTING_STARTED) | `env.ts`: only `DATABASE_URL` (`z.url()`) and `BETTER_AUTH_SECRET` (`min(32)`) are required; every other var `.optional()`/defaulted; `emptyStringAsUndefined` + `SKIP_ENV_VALIDATION` as documented. |
| "16 committed migrations" (FEATURES) | `packages/db/drizzle/migrations/0000…0015` — exactly 16 `.sql` files. |
| ".env.example ships working local values; the placeholder secret satisfies validation" (GETTING_STARTED) | Placeholder is 41 chars ≥ 32 → passes. (This exposed the VERIFICATION.md drift below.) |
| Rename checklist (GETTING_STARTED "Make it yours") | Every row's file/name verified present at the stated location, incl. `nwb-postgres`/`nwb-meilisearch` (+ `-prod` variants), `nwb-web:ci`/`nwb-worker:ci`/`nwb-ci`, `nwb:ratelimit` (`rate-limit.ts:110`), `fly.toml` `app = "nwb-web"`, and the commented brand-name hooks in `twoFactorIssuer()`/`passkeyRelyingParty()`. |
| `pnpm init-app` contract (README/GETTING_STARTED) | `scripts/init-app.mjs`: seeds `.env` only when absent, `--name` validates npm-safety then renames root package + README H1, help text points at the full rename checklist. |
| Env table "when unset" column (GETTING_STARTED) | Matches `env.ts` + the graceful-degradation wiring verified across passes 1–4 (unchanged code). |
| Security-contact placeholder step (GETTING_STARTED → production) | `.well-known/security.txt/route.ts` ships `security@example.com` with the in-file ⚠ replace-before-production warning and RFC 9116 `Expires` computed at request time. |
| MAINTENANCE automation claims | Renovate + pnpm age gates, audit allowlist, `vite` override, manypkg, knip, `ENABLE_*` silent-skip gates, Codecov-token gating, `cache:prune` on `pre-push` — all match the configs verbatim. |
| Scripts/commands tables (README/AGENTS.md) | Every listed script exists in the root `package.json` (incl. `storybook`, `cache:size`, `cache:prune`, `init-app`). |
| "14 per-area context docs" (README/FEATURES/docs-README) | `docs/context/*.md` = 14 files. |
| "19 E2E specs" · "8 templates" (VERIFICATION, cross-refs) | `apps/web/e2e/*.spec.ts` = 19; `packages/email/src/templates/` = 8. |
| Community surface (README/CONTRIBUTING) | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/SECURITY.md` (private-reporting policy + dedicated email), issue templates (`bug_report`/`feature_request`/`config`), PR template — all present; links resolve. |
| "Support this project" has no donation link | Correct and deliberate — `.github/FUNDING.yml` is absent by decision (deferred owner-side); the section asks for a ⭐/issues/PRs only. |

## Score table

| # | Feature group | 07-14 | Now | Dominant deductions |
| --- | --- | --- | --- | --- |
| 1 | Monorepo & tooling | 100 | **100** | — |
| 2 | Framework & app architecture | 100 | **100** | — |
| 3 | Database | 100 | **100** | — |
| 4 | Auth & access control | 99 | **99** | Magic-link/email-OTP stays a recipe — won't-fix (−1) |
| 5 | API layer (tRPC + Actions) | 99 | **99** | `updatePost` first-issue error shape — won't-fix (−1) |
| 6 | UI & design system | 100 | **100** | — |
| 7 | State & data fetching | 99 | **99** | `persist` unwired is deliberate — won't-fix (−1) |
| 8 | Forms & validation | 100 | **100** | — |
| 9 | Email | 99 | **99** | App-side bounce/complaint handling — **existing B3 row**, deferred (−1) |
| 10 | Payments (Stripe) | 98 | **98** | Per-org billing — documented deferral (−2) |
| 11 | File uploads | 98 | **98** | UT prod-callback needs a public URL — platform property, won't-fix (−2) |
| 12 | Search | 99 | **99** | Signed-in-user reindex — documented P1-2 decision, won't-fix (−1) |
| 13 | Background jobs | 99 | **99** | DLQ documented (A20) but not wired — recipe posture, won't-fix (−1) |
| 14 | Observability | 99 | **99** | OTel — standing exclusion (−1) |
| 15 | Security | 99 | **99** | Static-CSP `'unsafe-inline'` default — deliberate, verified nonce recipe ships (−1). Public hardening (secret scanning + push protection, CodeQL live, `main` ruleset) confirmed on. |
| 16 | Testing & CI | 100 | **100** | — (CI + CodeQL green on the public repo incl. the visual lane; `ENABLE_PERF` deliberately opt-in) |
| 17 | Deployment & ops | 100 | **100** | — |
| 18 | Docs & DX | 99 | **99** | Three claim drifts on the never-audited launch-doc surface (below) — found + fixed this pass (−1). The launch layer itself (FEATURES/GETTING_STARTED/MAINTENANCE/AGENTS + proven degit first-run) is a substantial DX lift. |
| 19 | Internationalization | 99 | **99** | Partial (primary-journey) coverage — deliberate, won't-fix (−1) |
| 20 | Realtime / SSE | 100 | **100** | — |
| | **Overall (mean)** | **99.3** | **99.3** | |

## Doc ↔ code drift

Three findings, all on the new launch-doc surface, **all fixed in this pass** (doc
edits only):

1. **VERIFICATION.md Phase 0** claimed "the committed `.env` already has a dev secret;
   the example file's placeholder is too short and will fail `env.ts`" — both halves
   wrong for the public repo: no `.env` is tracked (only `.env.example`), and the
   placeholder is 41 chars, which **passes** the `min(32)` validation (as
   GETTING_STARTED correctly states, and as the keyless degit first-run proved).
   Reworded to match reality + keep the change-before-non-local warning.
2. **MAINTENANCE.md** claimed the doc-audit and project-audit passes "both exist as
   committed agent skills" — only `project-audit` (plus the checkpoint/tidy helpers)
   is committed under `.claude/skills/`; the doc audit is a described procedure.
   Reworded.
3. **FEATURES.md** said "five axe accessibility scans" — the suite scans **seven**
   surfaces (`/`, `/posts`, `/login`, `/signup` + signed-in `/account`, `/admin`,
   `/admin/audit`) across five test blocks. Corrected to the surface count.

Nothing further surfaced: the depersonalization pass was verified surgical (the
public tree is byte-identical to the pre-publish tip; the leak grep is clean).

## Backlog

**Zero new rows** (second consecutive pass). The open set remains exactly
[BACKLOG.md](../BACKLOG.md)'s two: **email bounce/complaint handling** (B3, deferred —
plan → sign-off when picked up) and the **TypeScript 7 cutover** (B4, hard-gated on
Next.js TS7 support, ~Q4 2026). Every deduction above maps to one of those or a
standing won't-fix.

**Operational note (owner setup, not a repo change):** the Renovate GitHub App is not
yet installed on the public repo, so no update PRs will arrive until it is —
dependency automation is dormant while the 7-day pnpm install-gate still protects the
lockfile. MAINTENANCE.md → "Automation on a fork / new repo" already documents this
exact step; it applies to this repo itself now. Same bucket: the optional
`CODECOV_TOKEN` secret and the deferred FUNDING/donation link.

## Considered and excluded (visible decisions)

- **All prior exclusions re-affirmed unchanged** (hosted realtime · notification
  preferences/digests · TanStack Table · OTel · per-account lockout · locale-routed
  authed sitemap/RTL/locale cookies · Stryker · blur placeholders/OG theming ·
  console-error E2E lane · rate-limiting `markAllRead` · shared `STRIPE_API_VERSION`
  constant · CD-on-push · second Fly app for the worker).
- **Committing a doc-audit skill** (to make MAINTENANCE's original sentence true the
  other way). Excluded: the doc-audit procedure is coupled to the operator's own
  memory/tooling layout, while the prose in MAINTENANCE already tells any human or
  agent what the pass does; the committed trio (checkpoint · project-audit · tidy)
  covers the repo-shaped workflows. The wording fix was the right close.
- **Automating the Renovate-app check** (e.g. a CI probe that fails when the app is
  missing). Excluded: the app install is a GitHub UI action outside the repo's
  control, a probe would false-alarm on every fork by design, and MAINTENANCE.md
  documents the step where adopters will look.

## Won't-fix notes (deductions without backlog items)

Carried forward from the fourth pass, all still the right call: magic-link recipe
(Auth −1) · `updatePost` error shape (API −1) · `persist` unwired (State −1) · UT
prod-callback (Uploads −2) · signed-in reindex (Search −1) · DLQ recipe posture
(Jobs −1) · static CSP (Security −1) · partial i18n coverage (i18n −1) · OTel
(Observability −1).

## Prioritization statement

**Maintenance-only stands.** The repo is public, template-flagged, CI/CodeQL-green,
and its published claims now audit-verified against the code. There is no unblocked,
unbuilt row: the two BACKLOG rows are deferred/externally gated, and the 0.7 points
between 99.3 and 100 are the same documented deferrals and won't-fixes as the fourth
pass. The near-term items are owner setup, not engineering: install the Renovate app
on the public repo, and restore the FUNDING link when the donation account exists.
Bands in `BACKLOG.md` stay the single source of truth; this report is the scoring
record.
