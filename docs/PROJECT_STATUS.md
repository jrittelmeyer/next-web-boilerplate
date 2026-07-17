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

_Last updated: 2026-07-17._

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
  A23–A31 polish rows, A32, and A13. Seven `/project-audit` passes graded the repo
  **93 → 97.5 → 98.2 → 99.3 → 99.3 → 99.3 → 99.35/100** (2026-07-08 · 07-12 · 07-12B ·
  07-14 · 07-14B post-launch · 07-15 · **07-15B, same-day delta** — proved the
  Dependabot override trio end-to-end (alerts fixed on GitHub, clean audit, lockfile
  resolutions) and the funding surface live; **zero drift found, a first** — Docs & DX
  99 → 100; zero new backlog rows for the fourth consecutive time; reports in
  [docs/archive/](archive/), latest:
  [PROJECT_AUDIT_2026-07-15B.md](archive/PROJECT_AUDIT_2026-07-15B.md)).
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
  per-row analysis). Next: a `/project-audit` scoring pass verifies the program, then
  maintenance-only resumes. The TS7 cutover stays outside it (externally gated —
  stable-Next TS7 support; experimental in canary since 2026-07-10).

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
| Path-to-100 · #4a | `e2e/uploads.spec.ts` — the last zero-e2e integration covered: keyless CI-honest spec (page renders logged-out, UploadButton mounts + settles past "Loading…", signed-in "Your uploads" empty state); 2/2 with `UPLOADTHING_TOKEN` explicitly blanked. The #4b callback runbook (`UPLOADTHING_CALLBACK_URL`, source-verified in installed 7.7.4) was authored 2026-07-16 and its one-time live tunnel proof **ran 2026-07-17** (owner-approved cloudflared tunnel: callback POSTed through the tunnel on a prod build → `uploads` row landed; Delete swept row + file — dated box in VERIFICATION.md). 2026-07-16 → 17. See [context/SERVICES.md](context/SERVICES.md#uploadthing-file-uploads) · [VERIFICATION.md](VERIFICATION.md). |
| Path-to-100 · #6 | Magic-link sign-in wired (promotes the A18 recipe) — `magicLink()` env-gated on `isEmailConfigured()` so affordance + endpoints appear/disappear together; capture-seam e2e (second :3001 webServer) + live :3100 send proof. 2026-07-16. See [context/AUTH.md](context/AUTH.md#magic-link-sign-in-env-gated-path-to-100-6) · [context/TESTING.md](context/TESTING.md#email-capture--the-magic-link-e2e-path-to-100-6). |
| Path-to-100 · #7 | i18n full-surface coverage — en/es catalogs extended to every `[locale]` surface (identical 485-key trees, en byte-identical); all six `toLocale*` sites → the A32 named formats (+ `dateOnly`); es e2e chrome + signed-in date spot-check. 2026-07-16. See [context/I18N.md](context/I18N.md). |
| Path-to-100 · #8 | Email bounce/complaint handling — signature-verified `POST /api/resend/webhook` (zero new deps) → `email_suppressions` (migration 0016) → every `send*` helper consults `isEmailSuppressed()` (env-gated on `RESEND_WEBHOOK_SECRET`, fail-open); jobs complete instead of retrying suppressed sends; self-signed-svix e2e + live :3100 proof. 2026-07-16. See [context/SERVICES.md](context/SERVICES.md#bounce--complaint-handling-path-to-100-8) · [context/DATABASE.md](context/DATABASE.md#email-suppressions-email_suppressions--do-not-send-list-migration-0016). |
| Path-to-100 · #9 | Opt-in OpenTelemetry — OTLP/HTTP trace export gated on `OTEL_EXPORTER_OTLP_ENDPOINT` (runtime knob, no rebuild; unset = prior behavior exactly): `lib/otel.ts` adds a `BatchSpanProcessor` to **Sentry's own OTel provider** via the SDK's `openTelemetrySpanProcessors` option (source-verified in 10.59.0) — one provider/sampler, no double-instrumentation; works DSN-less (sampler gates on `tracesSampleRate`, not DSN). Live matrix vs a local collector: baseline inert · OTLP-only spans (keyless build) · dual export (Sentry-sink `transaction` envelopes + collector spans from the same requests); `OTEL_SERVICE_NAME` honored. 2026-07-16. See [context/SERVICES.md](context/SERVICES.md#opentelemetry-export-opt-in-path-to-100-9). |
| Path-to-100 · #10 | `CSP_MODE=nonce` as a first-class **build-time** mode (M4's recipe promoted; the inert `.example` deleted) — one shared directive list (`src/lib/csp.ts`) feeds both the static config header (default, byte-identical to pre-#10) and the proxy's per-request `'nonce-…' 'strict-dynamic'` CSP; nonce builds set `cacheComponents: false` + `experimental.useCache` so the D4 `"use cache"` showcase **keeps caching** (only the static/PPR posture is given up; `useCache`-survives-`cacheComponents:false` source-verified in Next 16.2.9). Baked via config `env` → runtime override is a verified no-op. New `e2e/csp-nonce.spec.ts` matrix (rotating nonce both locales · no script `'unsafe-inline'` · every `<script>` stamped · journeys with zero console violations) runs in the variable-gated `csp-nonce` CI lane (`ENABLE_CSP_NONCE`, ON here). 2026-07-17. See [context/SECURITY.md](context/SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch). |
| Path-to-100 · #11 | Per-org billing — the program's **last row**. `subscriptions` owned by exactly ONE of user/org (migration 0017: nullable `user_id`, new `organization_id` FK, `num_nonnulls`-check; **XOR by design** — a purchaser FK would let a member's account deletion cascade/cancel the ORG's subscription). Org-context checkout + portal (authoritative active-org + fresh-role reads; owner/admin gate BEFORE the config gate), webhook org mapping via `metadata.organizationId`, `hasOrgSubscription()` + context-aware `/premium` (one org sub entitles every member), org-aware `/billing`, org-delete → the A13 cancel job via `organizationHooks`. Live-verified end-to-end in test mode (checkout → org row → resend-idempotent → member entitled/blocked → portal on the org customer → org delete canceled 1/1 on Stripe); keyless `e2e/billing-org.spec.ts`. Seat-quantity billing stays out of scope (schema doesn't preclude it). 2026-07-17. See [context/SERVICES.md](context/SERVICES.md#stripe-payments) · [context/DATABASE.md](context/DATABASE.md#stripe-subscriptions-subscriptions--implemented-phase-3--c4-org-aware-11). |

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
  (`settings.json`) and the checkpoint / project-audit / doc-audit / tidy skills;
  `settings.local.json` stays untracked (gitignored).
