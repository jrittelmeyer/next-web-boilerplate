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

_Last updated: 2026-07-14._

## Where we are

- **PUBLIC — launched 2026-07-14.** This repo is now a public GitHub template at
  [github.com/jrittelmeyer/next-web-boilerplate](https://github.com/jrittelmeyer/next-web-boilerplate),
  published as a fresh single-commit history (the full pre-launch history is archived
  privately). Post-publish hardening is on: secret scanning + push protection,
  CodeQL, vulnerability alerts, and a `main` ruleset that blocks force-pushes and
  branch deletion. The README donation link is deferred until the owner's PayPal
  account exists.
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
  A23–A31 polish rows, A32, and A13. Four `/project-audit` passes graded the repo
  **93 → 97.5 → 98.2 → 99.3/100** (2026-07-08 · 07-12 · 07-12B · **07-14** — the latest
  verified every close in code, found zero new backlog rows, no correctness bugs;
  reports in [docs/archive/](archive/), latest:
  [PROJECT_AUDIT_2026-07-14.md](archive/PROJECT_AUDIT_2026-07-14.md)).
- **Real host deploy PROVEN live on Fly.io 2026-07-13** and **production email domain +
  deliverability VERIFIED 2026-07-14** (hop-2 email-change delivery gap closed) — rows
  at the bottom of the table below.
- **CI is green** (`verify` · `audit` · `e2e` · `docker-image` · `visual` — the visual
  lane is live since A28). **CodeQL is live** — `ENABLE_CODEQL` is set on the public
  repo (code scanning is free once public); the variable gate stays so private forks
  don't go false-red ([context/DEPLOYMENT.md](context/DEPLOYMENT.md)).
- **The repo is maintenance-only.** Everything left in [BACKLOG.md](BACKLOG.md) is
  deferred or externally gated (app-side email bounce/complaint handling · TS7 cutover,
  blocked on Next.js TS7 support). Reopen on real need: plan → sign-off → build.

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
| Tier 4 · B3 (CSP nonce) | Nonce-CSP recipe reworked for the i18n proxy; re-verified end-to-end on `:3100`, then reverted — default stays the static CSP. 2026-07-12. See [context/SECURITY.md](context/SECURITY.md#csp-strategy-static-vs-nonce-and-the-upgrade-path). |
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
| Verify · Prod email domain | A real verified sending domain + SPF/DKIM/DMARC recipe; deliverability + hop-2 email-change delivery **proven 2026-07-14**. Remaining optional: app-side bounce/complaint handling. See SERVICES.md → Resend · [VERIFICATION.md](VERIFICATION.md) → Resend. |
| Launch · Public template | **PUBLISHED 2026-07-14** — public GitHub template (fresh single-commit history; pre-launch history bundled + archived privately). Hardening on: secret scanning + push protection · CodeQL (first scan green) · vulnerability alerts · `main` ruleset (no force-push/delete) · topics + template flag. Proven by a fresh-consumer test: degit → install → `init-app` → build → tests, all green, keyless. Donation link deferred until the owner's PayPal exists. |

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

To watch CI: `gh run watch <id> --exit-status` (the `gh` CLI is installed + authed).

## Known non-issues (don't chase these)

- `engines.node >=24` is advisory (no `engine-strict`); older Node only warns on install.
- `dotenv-cli` pulls a deprecated transitive `@esbuild-kit/*` — benign, works fine.
- npm flags `@react-email/components` (+ ~21 subdeps) "deprecated" with a generic
  message — it is the canonical package per Resend/React Email docs and renders fine
  (verified via `email export`); the warning is cosmetic.
- Toolchain gotchas (pnpm `allowBuilds`, TS 6, Biome 2.5 config, drizzle
  `import.meta.dirname`) are documented in STACK.md / CONVENTIONS.md / UI.md.
- The committed `.claude/` directory holds the Claude Code permissions allowlist
  (`settings.json`) and the checkpoint / project-audit / tidy skills;
  `settings.local.json` stays untracked (gitignored).
