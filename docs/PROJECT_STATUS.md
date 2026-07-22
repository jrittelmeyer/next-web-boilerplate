# Project Status & Handoff

> **Read first when resuming.** The lean "where we are / what's next" layer. Deeper
> material lives elsewhere so it isn't paid for on every resume:
>
> - Per-step rationale + verification → [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md)
>   (full Steps 1–29, Phase 3 C1–D11 + M1–M7, the audit-backlog P0–P3 detail, **and** the
>   Phase-4 + Tier-4 upgrade-path prose)
> - Cross-cutting decision log → [context/DECISIONS.md](context/DECISIONS.md) ·
>   Working agreements → [../AGENTS.md](../AGENTS.md) ·
>   Backlog → [BACKLOG.md](BACKLOG.md)

_Last updated: 2026-07-22._

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
- **Every locally-buildable Tier-4 row is SHIPPED (2026-07-07 → 13)** — including the
  A23–A31 polish rows, A32, and A13. Eleven `/project-audit` passes graded the repo
  **93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35 → 100.0 → 100.0 → 99.65 → 99.65/100**
  (2026-07-08 · 07-12 · 07-12B · 07-14 · 07-14B post-launch · 07-15 · 07-15B ·
  **07-17, the path-to-100 verification** · 07-18, the first maintenance-mode pass ·
  **07-22, the tenth pass — 99.65, the first drop, and none of it code**: product
  code is byte-identical bar the M-1 comment fix, but Renovate's scheduled lane has
  **never delivered a PR** (37 updates stalled behind a 6-hour weekly window), the
  CHANGELOG records **no** security remediation, and the `sharp` override rides an
  untested `/_next/image` path · **07-22B, a same-day live-surface re-check —
  99.65 holds** on the byte-identical tree: every gate stands, `pnpm audit` clean,
  alert #4 still pending auto-close. Four B1/B2 backlog rows — the three B1
  rows **shipped same-day** (audit-22 B1 trio row below); the B2
  image-optimization coverage row remains the audit's one open item. Reports in
  [docs/archive/](archive/), latest:
  [PROJECT_AUDIT_2026-07-22B.md](archive/PROJECT_AUDIT_2026-07-22B.md)).
- **Real host deploy PROVEN live on Fly.io 2026-07-13** and **production email domain +
  deliverability VERIFIED 2026-07-14** (hop-2 email-change delivery gap closed) — rows
  at the bottom of the table below.
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
- **ai-dev-kit (2026-07-17 → 19):** the repo's agentic-dev
  techniques are codified into a portable skill library — the standalone public
  [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit) (kit 0.6.1: 8
  skills incl. the two inception doors — `/project-init` from an idea,
  `/project-adopt` from an existing codebase, both live-trial-proven —
  advise-never-block hooks, the
  why-layer playbook + catalog deck, and a cross-platform installer with drift
  guard). This repo consumes the installed output — `.claude/skills/` and
  `.claude/hooks/ai-dev-kit/` are committed installer output; edit a clone of the
  kit repo and re-install (`--dest <this repo>`), never the copies. All kit
  programs are COMPLETE (the project-adopt trial closed 2026-07-19). Full
  program history (the 3-step build, project-init + the "Potluck" live trial,
  U1/U2, the B3
  extraction) → [archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md).

## Build progress

All steps ✅ done and verified. One compact line per row; the **full per-step detail and
the exact verification each performed** live in
[archive/PHASE_HISTORY.md](archive/PHASE_HISTORY.md) — including the audit-backlog P0–P3
record and every Tier-4 / deploy / live-verify row (don't re-expand the per-item prose
here — that's the append-log this table has replaced, six times now — most recently
2026-07-14).

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
| Phase 3 · T0–C4 | Doc-drift + cleanup (T0; A1 dead-rewrite delete; A2 rate-limiter onto public reads) · auth/dashboard UI (C1) · `apps/web` Vitest, 40 unit tests, coverage-gated (C2) · DB-backed checks on every PR (C3) · Stripe webhook → `subscriptions` table (C4) |
| Phase 3 · D1–D11 | Posts depth: edit + keyset pagination + optimistic UI (D1) · admin write surface `setUserRole`, anti-lockout (D2) · React Compiler on (D3) · Cache Components / PPR, `/posts` showcase (D4) · `SITE_URL` decouple from `BETTER_AUTH_URL` (D5) · Storybook gallery + `init-app`/degit scaffold (D6) · pg-boss `@repo/jobs` (D7) · built-in `next experimental-analyze` (D8) · Uploadthing → `uploads` table (D9) · rate-limit IP-fallback hardening (D10) · dashboards-as-code `@repo/observability` (D11) |
| Audit · M1–M7 + Tier 2 | OAuth social-login UI (M1) · Sentry/Turbopack source-map doc fix (M2) · real `/account` settings, deleted `/profile` (M3) · CSP-nonce upgrade as opt-in recipe, reverses D4 (M4) · editable email → two-hop confirm + defense-in-depth/revoke-sessions (M5→M6→M7) · opt-in Turbo remote-cache note (Tier 2) |
| Backlog · P0 | Account-page two-hop email-change copy fix (P0-1) · `safeRedirectPath` backslash open-redirect fix + unit tests + coverage gate (P0-2) |
| Backlog · P1 | DB indexes migration 0005 — keyset composite + 5 FK indexes (P1-1) · `reindexPosts` rate-limited 3/min (P1-2) · plain-text part on every email send (P1-3) · env-schema polish: `EMAIL_FROM` / `AUTH_TRUSTED_ORIGINS` / Sentry DSN (P1-4) · workflow actions SHA-pinned + Renovate digest preset (P1-5) · COOP `same-origin` header + `e2e/security-headers.spec.ts` (P1-6) · `setUserRole` audit log + typed "User not found" (P1-7) |
| Backlog · P2 | `/account` Sessions card — list + revoke, optimistic removal (P2-1) · danger-zone account deletion, config-time email/immediate split (P2-2) · `/uploads` read path + delete, remote-first fail-closed, + `delete-uploads` job (P2-3) · Stripe depth: customer reuse · billing portal · `invoice.payment_failed` sync (P2-4) · PostHog identify/reset session watcher (P2-5) · resend-verification affordance + `callbackURL` fix (P2-6) · Meilisearch index settings as code (P2-7) |
| Backlog · P3 | `e2e/account.spec.ts` serial one-user lifecycle (P3-1) · a11y 2→5 scans incl. signed-in `/account` + `/admin` (P3-2) · `packages/auth` pure config helpers extracted + 22 unit tests (P3-3) · `user.ts` action tests, web coverage include → 11 modules (P3-4) · `/admin` keyset pagination + user index migration 0006 (P3-5) · CSP violation-reporting opt-in recipe in SECURITY.md (P3-6) — **audit backlog COMPLETE** |
| Phase 4 · live SaaS | Resend · Sentry (+ source maps) · BetterStack · PostHog · Uploadthing · OAuth (GitHub+Google) · Upstash Redis — all verified live 2026-07-05→07 (provenance banners in [VERIFICATION.md](VERIFICATION.md)). Stripe = Phase 5, verified 2026-07-13 (row below). |
| Tier 4 · B1 | HIBP compromised-password check · rate-limit 429 response headers (`RateLimit-*`/`Retry-After`) · avatar upload → `user.image`. 2026-07-07→08. See AUTH.md / SECURITY.md / SERVICES.md. |
| Tier 4 · B2 | Two-factor auth — TOTP + backup codes, inline enroll + sign-in challenge, trust-device opt-in. 2026-07-08. See [context/AUTH.md](context/AUTH.md#two-factor-authentication-2fa--totp-tier-4--band-2). |
| Tier 4 · B2 (ops) | DB backup / restore / DR runbook — `db:backup`/`db:restore` (pgboss-excluded `-Fc` dumps), PITR pointers, restore drill, forward-only rollback. 2026-07-09. See [context/DATABASE.md](context/DATABASE.md#backup-restore--disaster-recovery). |
| Tier 4 · B4 | Organizations / multi-tenancy — teams + per-org roles, org-scoped `posts`, invitations + accept route. 2026-07-08. See [context/AUTH.md](context/AUTH.md#organizations--multi-tenancy). |
| Tier 4 · A1–A11 | Band-1 A-rows: sonner toasts · subscription gating + `/premium` · cron job · PG-pooling docs · email render tests · `remotePatterns` · typed `fieldErrors` · search settings-on-create · security.txt · manypkg · pnpm release-age gate. 2026-07-08. |
| Tier 4 · A14–A16 | `Skeleton` + `/posts` loading example · worked `db.transaction` + `post_revisions` · user-keyed rate-limited procedure (`post.listMine`). 2026-07-08. See UI.md / DATABASE.md / API.md. |
| Tier 4 · A19 | Per-integration "Remove it" checklists; email + BetterStack logging documented as load-bearing façades. 2026-07-09. See [context/SERVICES.md](context/SERVICES.md). |
| Tier 4 · B2 (CI) | Docker-image CI — builds both targets, `/api/health` smoke vs a throwaway Postgres, Trivy gate (`.trivyignore`), opt-in GHCR publish. 2026-07-09. See [context/DEPLOYMENT.md](context/DEPLOYMENT.md#cicd-github-actions). |
| Tier 4 · A21 | "URL as state" pattern doc — the third state bucket; worked `/admin` pagination + `/login` `redirectTo`. 2026-07-09. See [context/STATE.md](context/STATE.md#url-as-state-shareable-client-state). |
| Tier 4 · B2 (audit) | Persisted `audit_log` (migration 0011) + shared best-effort `recordAuditEvent()`; FK-less actor/target ids. 2026-07-09. See [context/AUTH.md](context/AUTH.md#persisted-audit-trail--audit_log-b2). |
| Tier 4 · B2 (audit UI) | `/admin/audit` read surface — keyset-paginated, LEFT-JOIN-resolved emails, uuid-cursor guard. 2026-07-09. See [context/AUTH.md](context/AUTH.md#persisted-audit-trail--audit_log-b2). |
| Tier 4 · B3 | `@repo/ui` Dialog tall-content fix — the missing height cap was the real fault (old animation diagnosis disproven). 2026-07-09. See UI.md → Dialog + DECISIONS.md. |
| Tier 4 · A17·A18·A20 (docs) | Docs trio: `next/font` recipe (UI.md) · magic-link / email-OTP recipe (AUTH.md) · failed-job observability note (SERVICES.md). 2026-07-09. |
| Tier 4 · B3 (passkeys) | Passkeys / WebAuthn — `@better-auth/passkey`, migration 0012, no new env/CSP; CDP virtual-authenticator E2E. 2026-07-09. See [context/AUTH.md](context/AUTH.md#passkeys--webauthn-tier-4--band-3). |
| Tier 4 · B3 (privacy) | Consent gate (opt-out-by-default + `ConsentBanner`) + GDPR data export (allowlist-redacted `buildDataExport()`). 2026-07-09. See SERVICES.md → PostHog + AUTH.md → Data export. |
| Tier 4 · Visual regression | Playwright screenshots over the Storybook gallery (both themes, per-OS baselines); lane live since A28. 2026-07-09. See [context/UI.md](context/UI.md#visual-regression-repoui-opt-in). |
| Tier 4 · B3 (perf) | Bundle-size budget — `size-limit` on the emitted chunks; opt-in `perf` CI job (`ENABLE_PERF`). 2026-07-10. See [context/DEPLOYMENT.md](context/DEPLOYMENT.md#performance-budgets-opt-in). |
| Tier 4 · B3 (SBOM) | CycloneDX SBOM on every `docker-image` run + SLSA provenance/SBOM attestations riding the opt-in GHCR publish. 2026-07-10. See DEPLOYMENT.md → CI/CD. |
| Tier 4 · B3 (worker) | Slim worker image — esbuild-bundled one-file worker; ~1.57 GB → ~169 MB, Trivy-clean. 2026-07-10. See [context/DEPLOYMENT.md](context/DEPLOYMENT.md#background-jobs-worker-d7). |
| Tier 4 · B3 (rate-limit storage) | Better Auth limiter → `rateLimit.storage: "database"` (`rate_limit` table, migration 0013; atomic check-and-increment). 2026-07-10. See [context/AUTH.md](context/AUTH.md#multi-instance-storage). |
| Tier 4 · B4 (admin plugin) | `admin()` adopted to augment RBAC — fresh-gated direct ban writes · plugin impersonation (≤5-min residual documented); migration 0014. 2026-07-10. See [context/AUTH.md](context/AUTH.md#admin-plugin--ban--impersonation-tier-4--band-4). |
| Tier 4 · B4 (i18n) | next-intl `[locale]` path routing (`as-needed`, en + es), partial primary-journey coverage, per-locale SEO, `LanguageSwitcher`. 2026-07-11. See [context/I18N.md](context/I18N.md). |
| Tier 4 · A12 (CAPTCHA) | Opt-in Cloudflare Turnstile via Better Auth `captcha()` (conditional spread last before `nextCookies()`); dummy-test-key-verified. 2026-07-11. See [context/AUTH.md](context/AUTH.md#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2). |
| Tier 4 · B3 (CSP nonce) | Nonce-CSP recipe reworked for the i18n proxy; re-verified end-to-end on `:3100`, then reverted — default stays the static CSP. 2026-07-12. Promoted to the first-class `CSP_MODE=nonce` (Path-to-100 · #10 below). See [context/SECURITY.md](context/SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch). |
| Tier 4 · A22 (realtime) | SSE notifications — Postgres LISTEN/NOTIFY → per-user bus → `EventSource` → query cache; persisted `notifications` table (migration 0015). 2026-07-12. See [context/API.md](context/API.md#realtime--server-sent-events-sse-tier-4--a22). |
| Tier 4 · A23 (realtime) | SSE reconnect backfill — every re-open after the first invalidates `notification.list` (self-healing delivery). 2026-07-11. See API.md → Realtime · STATE.md. |
| Tier 4 · A24 (realtime) | Authoritative unread-count badge — `notification.unreadCount` as SQL `count()`, reconciled in lockstep with the list. 2026-07-11. See API.md → Realtime · STATE.md. |
| Tier 4 · A25 (realtime) | Keyset-paginated `notification.list` — uuid-validated cursor, `InfiniteData`-shaped cache updates. 2026-07-12. See API.md → Realtime · STATE.md. |
| Tier 4 · A29 (DB) | `DB_POOL_MAX` deploy knob → `Pool({ max })`; unset = pg default 10, invalid fails loud. 2026-07-12. See [context/DATABASE.md](context/DATABASE.md#connection-pooling-managed-postgres--serverless). |
| Tier 4 · A26 (UI) | `Table` primitive in `@repo/ui`; worked consumer: `/admin/audit` converted `<ul>` → `<Table>`. 2026-07-11. See [context/UI.md](context/UI.md#adding-shadcn-components). |
| Tier 4 · A27 (tooling) | knip dead-code / unused-dep gate in CI's `verify` lane (adoption caught a phantom dep + a redundant devDep). 2026-07-12. See STACK.md / DEPLOYMENT.md → CI/CD / CONVENTIONS.md → Exports. |
| Tier 4 · A30 (i18n docs) | Worked next-intl formatting recipe — `useFormatter`, named formats, the `timeZone`/`now` gotcha. 2026-07-12. See [context/I18N.md](context/I18N.md#formatting-dates-numbers--currency-useformatter-a30). |
| Tier 4 · A28 (testing) | Linux visual baselines + `ENABLE_VISUAL` — the visual CI lane is live (runs inside the pinned Playwright image). 2026-07-12. See [context/UI.md](context/UI.md#visual-regression-repoui-opt-in). |
| Tier 4 · A31 (framework) | `typedRoutes` evaluated → **NOT adopted** — vacuous-or-wrong under the `[locale]` tree; next-intl's `pathnames` map is the right tool. 2026-07-12. See [context/DECISIONS.md](context/DECISIONS.md). |
| Tier 4 · B2 (cursor) | `post.list` / `post.listMine` uuid-cursor hardening (`id: z.uuid()` — the pre-fix 500 leaked the query text). 2026-07-12. See [context/API.md](context/API.md#cursor-pagination-d1). |
| Tier 4 · A32 (i18n) | Locale-aware date formatting — `formats`/`timeZone` in `request.ts` + the notifications feed → `useFormatter().dateTime`. 2026-07-12. See [context/I18N.md](context/I18N.md#formatting-dates-numbers--currency-useformatter-a30). |
| Tier 4 · A13 (payments) | Cancel Stripe subscription on account deletion — `beforeDelete` capture → `cancel-stripe-subscriptions` job → env-gated worker cancel (immediate; customer kept). 2026-07-13. See SERVICES.md → Stripe · AUTH.md → Danger zone. |
| Deploy · Fly.io | Real host deploy **PROVEN live 2026-07-13** — committed `fly.toml` + managed `fly postgres`; `/api/health` 200, prod headers, sign-up → user row on the test Fly app. See [context/DEPLOYMENT.md → Fly.io](context/DEPLOYMENT.md#flyio-worked-runbook) · [VERIFICATION.md](VERIFICATION.md) Phase 6. |
| Verify · Stripe Phase 5 | Stripe test-mode live-verify **COMPLETE 2026-07-13** — checkout → webhook → row (+ idempotency), customer reuse, billing portal, test-clock dunning → `past_due`, webhook 400/503/429, A13 live cancel. See [VERIFICATION.md](VERIFICATION.md) Phase 5. |
| Verify · Prod email domain | A real verified sending domain + SPF/DKIM/DMARC recipe; deliverability + hop-2 email-change delivery **proven 2026-07-14**. The then-remaining app-side bounce/complaint handling shipped 2026-07-16 (Path-to-100 · #8 below). See SERVICES.md → Resend · [VERIFICATION.md](VERIFICATION.md) → Resend. |
| Launch · Public template | **PUBLISHED 2026-07-14** — public GitHub template (fresh single-commit history; pre-launch history bundled + archived privately). Hardening on: secret scanning + push protection · CodeQL (first scan green) · vulnerability alerts · `main` ruleset (no force-push/delete) · topics + template flag. Proven by a fresh-consumer test: degit → install → `init-app` → build → tests, all green, keyless. Donation link live 2026-07-15 — `.github/FUNDING.yml` (`custom:` PayPal.Me) + README Support section. |
| Maintenance · Dependabot | **3 transitive-only alerts remediated 2026-07-15** via temporary pnpm `overrides:` (`effect: 3.21.4` HIGH via uploadthing · `"postcss@<8.5.10": 8.5.15` via next's own pin · `"@esbuild-kit/core-utils>esbuild": 0.25.12` via drizzle-kit) — no upstream fix exists for any; the `ignoreGhsas` allowlist emptied the same day so `pnpm audit` guards the overrides live. Removal conditions → [MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done). |
| Path-to-100 · #1 | `updatePost` → A7 `fieldErrors` — validation failures now map every failing field (`zodFieldErrors`), the edit form applies them inline via the shared `FieldActionError` (`@/lib/forms`); both post writes share the convention. 2026-07-16. See [context/API.md](context/API.md#typed-field-errors--the-actionresult-convention-a7). |
| Path-to-100 · #2 | Zustand `persist` wired to `ui-store` (hydration-safe: `partialize` + `skipHydration` + post-paint `<StoreRehydration/>` in the `[locale]` layout, optional-chained — the persist API is absent when storage is unavailable, verified in the installed zustand v5). Unit tests pin partialize/skipHydration/no-storage; `e2e/state.spec.ts` proves reload persistence with zero hydration errors. 2026-07-16. See [context/STATE.md](context/STATE.md#middleware-decision). |
| Path-to-100 · #5 | `reindexPosts` admin-gated (`requireAdmin()`, the `setUserRole` convention — supersedes the P1-2 any-signed-in-user demo decision); `/search` resolves the same check server-side and hides the button for non-admins. Live-verified: logged-out/non-admin hidden → psql promote → same session sees the button (fresh DB role read) → "Reindexed 12 posts." against real Meilisearch. 2026-07-16. See [context/SERVICES.md](context/SERVICES.md#meilisearch). |
| Path-to-100 · #3 | Jobs dead-letter queue wired — worker creates every queue with `deadLetter: "failed-jobs"` **and** `updateQueue`-converges pre-existing databases (`createQueue` is `ON CONFLICT DO NOTHING`, verified in installed pg-boss 12.20.0 + live: all 4 queues stamped); watched DLQ consumer logs + captures to Sentry via `@sentry/node` 10.59.0 when `NEXT_PUBLIC_SENTRY_DSN` is set (reused — zero new env). Integration test proves exhausted job → DLQ with original payload on real Postgres. 2026-07-16. See [context/SERVICES.md](context/SERVICES.md#background-jobs--repojobs--pg-boss-d7). |
| Path-to-100 · #4 | Uploads verifiability closed — keyless CI-honest `e2e/uploads.spec.ts` (#4a, the last zero-e2e integration) + the `UPLOADTHING_CALLBACK_URL` tunnel runbook, live-proven 2026-07-17 (#4b — dated box in VERIFICATION.md). 2026-07-16 → 17. See [context/SERVICES.md](context/SERVICES.md#uploadthing-file-uploads) · [VERIFICATION.md](VERIFICATION.md). |
| Path-to-100 · #6 | Magic-link sign-in wired (promotes the A18 recipe) — `magicLink()` env-gated on `isEmailConfigured()` so affordance + endpoints appear/disappear together; capture-seam e2e (second :3001 webServer) + live :3100 send proof. 2026-07-16. See [context/AUTH.md](context/AUTH.md#magic-link-sign-in-env-gated-path-to-100-6) · [context/TESTING.md](context/TESTING.md#email-capture--the-magic-link-e2e-path-to-100-6). |
| Path-to-100 · #7 | i18n full-surface coverage — en/es catalogs extended to every `[locale]` surface (identical key trees — 485 at ship, grown by later rows; en byte-identical); all six `toLocale*` sites → the A32 named formats (+ `dateOnly`); es e2e chrome + signed-in date spot-check. 2026-07-16. See [context/I18N.md](context/I18N.md). |
| Path-to-100 · #8 | Email bounce/complaint handling — signature-verified `POST /api/resend/webhook` (zero new deps) → `email_suppressions` (migration 0016) → every `send*` helper consults `isEmailSuppressed()` (env-gated on `RESEND_WEBHOOK_SECRET`, fail-open); jobs complete instead of retrying suppressed sends; self-signed-svix e2e + live :3100 proof. 2026-07-16. See [context/SERVICES.md](context/SERVICES.md#bounce--complaint-handling-path-to-100-8) · [context/DATABASE.md](context/DATABASE.md#email-suppressions-email_suppressions--do-not-send-list-migration-0016). |
| Path-to-100 · #9 | Opt-in OpenTelemetry — OTLP/HTTP trace export gated on `OTEL_EXPORTER_OTLP_ENDPOINT` (runtime; unset = prior behavior exactly), riding **Sentry's own OTel provider** via `openTelemetrySpanProcessors` — one provider, no double-instrumentation, works DSN-less; live matrix vs a local collector (inert · OTLP-only · dual export). 2026-07-16. See [context/SERVICES.md](context/SERVICES.md#opentelemetry-export-opt-in-path-to-100-9). |
| Path-to-100 · #10 | `CSP_MODE=nonce` as a first-class **build-time** mode — one shared directive list (`src/lib/csp.ts`) feeds the static default (byte-identical to pre-#10) and the proxy's per-request `'nonce-…' 'strict-dynamic'` CSP; nonce builds keep the D4 `"use cache"` showcase via `experimental.useCache`; `e2e/csp-nonce.spec.ts` matrix in the `ENABLE_CSP_NONCE` CI lane (ON here). 2026-07-17. See [context/SECURITY.md](context/SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch). |
| Maintenance · init-app slim | `pnpm init-app` now offers to remove the template's own history/marketing docs from a derived app (interactive y/N; `--slim`/`--keep-template-docs` for scripts; idempotent) — deletes PROJECT_STATUS/BACKLOG/archive/plain-english-guide/FUNDING.yml, resets CHANGELOG, neutralizes the README + AGENTS.md template references, reports leftover mentions. Scratch-verified: fresh run, patched content, idempotent re-run. 2026-07-17. See [GETTING_STARTED.md](GETTING_STARTED.md#remove-what-you-dont-need). |
| Path-to-100 · #11 | Per-org billing (the program's last row) — `subscriptions` owned by exactly ONE of user/org (migration 0017, `num_nonnulls` XOR; org rows carry no `user_id`, so a member's deletion can't cancel org billing); org-context checkout/portal (owner/admin gate before the config gate), webhook `metadata.organizationId` mapping, `hasOrgSubscription()` + context-aware `/premium` + org-aware `/billing`, org-delete → the A13 cancel job. Live-verified in test mode; keyless `e2e/billing-org.spec.ts`. 2026-07-17. See [context/SERVICES.md](context/SERVICES.md#stripe-payments) · [context/DATABASE.md](context/DATABASE.md#stripe-subscriptions-subscriptions--implemented-phase-3--c4-org-aware-11). |
| Maintenance · on-ramp U1+U2 | Trial follow-ups: `--slim` leftover-pointer tidy (retarget at the template repo / rewrite, per-line report, idempotent — scratch-verified twice) + pre-seeded `PRODUCT.md` context-index placeholder, uncommented by `/project-init` (kit 0.4.2). 2026-07-18. See [GETTING_STARTED.md](GETTING_STARTED.md#remove-what-you-dont-need) · AGENTS.md · ai-dev-kit CHANGELOG. |
| Maintenance · B3 kit extraction | ai-dev-kit → standalone public repo [jrittelmeyer/ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) (kit 0.5.0; doc-audit 0.1.1 source-of-truth handoff; two-OS smoke CI; secret scanning/vuln alerts/CodeQL/protect-main hardening). This repo consumes the installed `.claude/` output and re-installs from a clone via `--dest`. 2026-07-18. See [CLAUDE.md](../CLAUDE.md) · BACKLOG shipped row. |
| Maintenance · Renovate majors | 7 pending-approval majors triaged, approved & merged 2026-07-18 — actions/checkout v7 · setup-node v6 · upload-artifact v7 · codecov v7 · codeql-action v4 · pnpm/action-setup v6 · postgres 18 (compose + the 3 CI services + doc mentions in one merge), plus the required 18+ fix: compose volumes mount `/var/lib/postgresql` (18+ images refuse the old `/data` path — docker-library/postgres#1259; caught by the local fresh-volume proof, 18.4 healthy + migrations green). typescript-v7 held (TS7 gate, see BACKLOG). CI green, 0 open code-scanning alerts. |
| Maintenance · project-adopt 1+2 | Brownfield inception door: `/project-adopt` (kit 0.6.0 — existing codebase → parity contract → honest theirs-vs-template disposition map → `docs/PRODUCT.md` + `docs/MIGRATION.md` → port backlog; adapter gains `init.migrationMap`/`init.sourceDir`) + template wiring (gitignored `intake/source/` drop + `intake/README.md`, GETTING_STARTED on-ramp section). Steps 1+2 2026-07-19. See [GETTING_STARTED.md](GETTING_STARTED.md#starting-from-an-existing-app-run-project-adopt) · ai-dev-kit CHANGELOG 0.6.0. |
| Maintenance · project-adopt 3 (trial) | Live trial **COMPLETE 2026-07-19 — program closed at kit 0.6.1** (project-adopt 0.1.1). Full flow on a fresh degit consumer copy adopting **linkding 1.45.0**: live-local reference grade via its own compose, both intake forms + re-run/resume branch, disposition map, importer-as-feature migration plan, inception commit excluding the gitignored source. Mends: copy-verbatim-by-reference, question-round batching/assumption marking. Template findings → BACKLOG (slim leftover-pointer tidy #2, UI.md token-sheet recipe) + the AGENTS.md wrapper now names both inception doors. |
| Maintenance · slim tidy #2 + M-1 | The two `docs/MAINTENANCE.md` mention-patches in `init-app --slim` had drifted out from under the doc text (a "Currently:" rewording + a paragraph rewrap made the content-matched `from`-strings no-op), leaving the `:71`/`:114` pointers dead post-slim — the trial's report caught it as designed; `from`-strings updated to the current text, scratch-verified (fresh + idempotent re-run, intentional-only report). Ride-along: the two stale `postgres:16` comments → `postgres:18` (M-1 — closes the 07-18 audit's one nit; CI has been `postgres:18` since the majors merge). 2026-07-19. |
| Maintenance · B3 token-sheet recipe | UI.md gains "Adopting an existing brand / token sheet" — the worked mapping from a `/project-adopt`-survey-shaped token sheet onto `tooling/tailwind/base.css`: palette → semantic slots in oklch, authored (not inverted) `.dark`, `next/font` hand-off, radius/spacing/breakpoints, chart/sidebar satellite sets, Storybook both-themes verify + visual-baseline note. Surfaced by the linkding adopt trial (every keep-theirs design system needs this path); AGENTS.md UI.md-row trigger words extended. Docs-only; scratch `--slim` re-verified (fresh + idempotent, intentional-only report). 2026-07-19. See [context/UI.md](context/UI.md#adopting-an-existing-brand--token-sheet). |
| Maintenance · CI heartbeat | `ci.yml` gains a weekly `schedule` (Thursdays 04:30 UTC) + `workflow_dispatch` so the full pipeline (e2e / docker-image / scan) keeps running between merges — in maintenance mode a push was the only thing exercising CI, so "green" could rot silently against world-drift. Offset from CodeQL's Monday cron; opt-in GHCR steps stay `push`-gated. Verified: `workflow_dispatch` run green (first scheduled run self-confirms next cron). 2026-07-20. See [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [context/DEPLOYMENT.md](context/DEPLOYMENT.md#cicd-github-actions). |
| Maintenance · Storybook on Pages | Published the `@repo/ui` **Storybook** component gallery to **GitHub Pages** — new `.github/workflows/pages.yml` (build → `configure-pages` / `upload-pages-artifact` / `deploy-pages`, all SHA-pinned; subpath-safe relative assets), on push to `main` touching `packages/ui/**` + `workflow_dispatch`. Pages enabled once via the API (the Actions `GITHUB_TOKEN` can't create the site — one-time out-of-band setup). Live at <https://jrittelmeyer.github.io/next-web-boilerplate/>; linked from README + UI.md. This is the visual-surface backlog row's **gallery half**; the README screenshot tour (row below) is the other half — together they close the row. 2026-07-20. See [.github/workflows/pages.yml](../.github/workflows/pages.yml) · [context/DEPLOYMENT.md](context/DEPLOYMENT.md#storybook-on-github-pages-component-gallery). |
| Maintenance · tagged releases | Cut the repo's first git tags + GitHub Releases (none existed despite a CHANGELOG `[1.0.0]`): **v1.0.0** on the launch commit `f224e98` + **v1.1.0** on the current tip, notes from a new CHANGELOG `[1.1.0]` milestone rollup (path-to-100 → 100/100, ai-dev-kit + both inception doors, PG-18, CI heartbeat) with compare links. Plus a GETTING_STARTED "Staying current with the template" recipe — remote + fetch + **cherry-pick** (naive merge refused; `--allow-unrelated-histories` = 143 conflicts, both dry-run-proven), honest conflict zones. 2026-07-20. See [CHANGELOG.md](../CHANGELOG.md) · [GETTING_STARTED.md](GETTING_STARTED.md#staying-current-with-the-template). |
| Maintenance · B3 screenshot tour | The README **screenshot tour** — 4 retina PNGs captured from a real **keyless** prod run (landing light+dark, signed-in dashboard, `/account`) via a throwaway Playwright script against a fresh `:3100` build, committed to `docs/assets/` and wired into a `## Screenshots` section high in the README (right after the status blurb) + a "See it" strip in FEATURES.md. Shots use the two-env-var-only surface — no third-party keys, no consent banner. **Closes the B3 visual-surface row** (gallery + tour both shipped). 2026-07-20. See [README.md](../README.md#screenshots) · [docs/FEATURES.md](FEATURES.md). |
| Maintenance · advisories #2 | **4 transitive-only advisories remediated 2026-07-22** via pnpm `overrides:` (`brace-expansion: 5.0.7` HIGH via minimatch/glob build-tooling paths · `dompurify: 3.4.12` via posthog-js's sanitizer · `sharp: 0.35.3` HIGH, bypassing next's own exact `^0.34.5` pin which excluded the libvips CVE fix) — none had an upstream fix at triage time. **Only `brace-expansion` was a Dependabot alert** — the other three surfaced in the CI `pnpm audit` lane, which is the authoritative gate here (2026-07-22 audit, F3). `fast-uri`'s fix (3.1.4, published 2026-07-19) is deliberately deferred via a dated `auditConfig.ignoreGhsas` pair until it clears the 7-day age gate (~2026-07-26); build-tool-only path, zero request-handling exposure. Removal conditions → [MAINTENANCE.md → Watch items](MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done). |
| Maintenance · audit-22 B1 trio | The tenth-pass audit's three B1 rows, shipped 2026-07-22: **Renovate schedule widened** — explicit `timezone` (America/New_York), full-day `["on monday"]` window on both schedule keys (was a 6-hour UTC window Mend's hosted run cadence never intersected — the scheduled lane had produced **0 PRs ever**), `prHourlyLimit: 0` + explicit `prConcurrentLimit: 10` (bounded triage preserved); config-validator-verified, **behavioral proof = PRs opening at the next Monday window (2026-07-27)**. **CHANGELOG security record** — `[Unreleased]` gains Fixed (the schedule fix + a copy-me note for downstream renovate.json copies) and Security (both override batches; `sharp` 0.35.3 forced past Next's own `^0.34.5` on the `/_next/image` runtime path flagged; `pnpm audit` named the authoritative advisory gate). **Workspace relabel** — pnpm-workspace.yaml's 2026-07-22 header → "Advisory remediation" with correct provenance; stale next-version notes → 16.2.11. Full gate + audit lane green (audit F1–F3 + 22B N2). |

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
