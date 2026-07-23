# Verification Checklist

> A hands-on, phased checklist to **prove every stated feature of this boilerplate actually
> works** — and to **finish the setup** for the integrations that ship as graceful stubs
> (they compile and show green with their env unset, and only light up when configured).
>
> **Phases are ordered cheapest-first:** Phases 0–3 need **no accounts** (just Docker +
> Node). Phase 4 needs **free-tier SaaS** signups. Phase 5 is **Stripe test mode**. Phase 6
> is **production build + deploy**. Work top-to-bottom, or jump to the integration you care
> about.

## How to use this

- Each item is a `- [ ]` checkbox — tick it once you've seen the **Expect** result.
- Every integration is verified **twice**: the **degraded/unset** behavior (the stub) *and*
  the **configured** behavior (the real thing). Both matter — graceful degradation is a
  feature here.
- Commands are **Windows PowerShell-first** (the repo is developed on Windows). Bash
  equivalents are given where they differ.

### Dry-run provenance

Phases **0–3 were executed end-to-end on a Windows dev box (2026-06-28)** while authoring
this doc; the **Expect** blocks quote real output. The one Phase-3 item left in its degraded
state then — **local Meilisearch `/search`** — was lit up and verified end-to-end on
**2026-06-30** (details in the `/search` row of Phase 3). **All of Phase 4 (free-tier SaaS)
was since run end-to-end 2026-07-05 → 07** — every section verified live against real creds
(see each section's ✅ banner). **Phase 6 cloud deploy was run end-to-end on Fly.io
2026-07-13** (see the Fly.io ✅ banner — real host + managed Postgres, `/api/health` +
sign-up→DB proven). **Phase 5 (Stripe test mode) was run end-to-end 2026-07-13** — real hosted
checkout → webhook → `subscriptions` row (+ idempotent redelivery), customer reuse, billing-portal
round-trip, dunning `past_due` sync (via a test clock), webhook 400/503/429 hardening, and the A13
live cancel-on-delete (see the Phase 5 ✅ banner). The Vercel/Railway deploy paths remain authored
from the code + official docs, marked _(authored — not run on this box)_ where they couldn't
be exercised without credentials.

### Conventions & gotchas (read once)

- **PowerShell `curl` is an alias for `Invoke-WebRequest`** — its flags differ from real
  curl. Use **`curl.exe`** in the examples below (Windows 10+ ships it), or translate to
  `Invoke-WebRequest`.
- **Per-command env vars**: PowerShell has no `VAR=x cmd` prefix. Use
  `$env:VAR="x"; cmd` (and `Remove-Item Env:\VAR` to unset). Bash: `VAR=x cmd`.
- **Ports used:** app `3000` (dev) / `3100` (ad-hoc prod) · Postgres `5432` · Meilisearch
  `7700` · Storybook `6006` · email preview `3001` · bundle analyzer `4000`.
- **Server cleanup gotcha:** stopping a backgrounded `next start` can leave an **orphaned
  Node process holding the port**. If a port is stuck, find + kill it:
  `Get-NetTCPConnection -LocalPort 3100 | Select-Object -Expand OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }`
  (don't kill Docker/Chrome). _Observed during this dry-run — real._
- The web app loads the **monorepo-root `.env`** via `dotenv-cli` for every
  dev/build/start/test:e2e script. One file is the single source of truth for local env.

---

## Phase 0 — Setup & prerequisites _(no account)_

- [ ] **Toolchain present.** `node -v` ≥ v24 · `pnpm -v` (11.x; via corepack) · `docker --version` · (optional) `gh --version`.
  - _Expect (this box):_ `v24.17.0`, `11.7.0`, `Docker version 20.10.10`, `gh 2.95.0`.
- [ ] **Create the env file.** `Copy-Item .env.example .env` (Bash: `cp .env.example .env`).
- [ ] **Set `BETTER_AUTH_SECRET`** (≥32 chars) in `.env`. Generate one cross-platform:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  (the placeholder seeded from `.env.example` is long enough to pass the `min(32)` validation, so the app boots with it — replace it with a real generated secret before anything non-local).
- [ ] **`DATABASE_URL` matches compose** — default `postgresql://postgres:postgres@localhost:5432/appdb` lines up with `docker/docker-compose.yml`.
- [ ] **Start backing services.** `docker compose -f docker/docker-compose.yml up -d`
  - _Expect:_ `nwb-postgres` + `nwb-meilisearch` both reach **healthy** (`docker ps`).
- [ ] **Install deps.** `pnpm install`
  - _Expect:_ "Already up to date" / lockfile passes (an "Update available" pnpm banner is cosmetic).
- [ ] **Apply migrations.** `pnpm --filter @repo/db db:migrate`
  - _Expect:_ `migrations applied successfully!`
- [ ] **Seed the example entity.** `pnpm --filter @repo/db db:seed`
  - _Expect:_ `Seeded 8 posts for author "seed-author@example.com" (idempotent — re-running is a no-op).`
- [ ] **Meilisearch healthy.** `curl.exe -s http://localhost:7700/health`
  - _Expect:_ `{"status":"available"}`

---

## Phase 1 — Offline quality gates & dev tooling _(no account)_

The CI `verify` lane in one place, plus the dev tools that are wired but not part of `pnpm dev`.

### Core gate (mirrors CI)

- [ ] **Lint** — `pnpm lint`  → _Expect:_ Biome `Checked NNN files … No fixes applied` + `turbo lint` all packages pass.
- [ ] **Type-check** — `pnpm type-check`  → _Expect:_ all packages `tsc --noEmit` pass (8 tasks).
- [ ] **Build** — `pnpm build`  → _Expect:_ `web:build` succeeds; route legend prints `○ Static` / `◐ Partial Prerender` / `ƒ Dynamic` (so PPR/Cache-Components is active).
- [ ] **Unit tests** — `pnpm test`  → _Expect:_ Vitest green across the six test-bearing packages — `@repo/validators`, `@repo/ui`, `@repo/jobs`, `@repo/auth`, `@repo/email`, `web` (e.g. **136** web tests as of P3-5).
- [ ] **Coverage gate** — `pnpm test:coverage`
  - _Expect:_ thresholds enforced and met — `@repo/validators` 100% all; `@repo/auth` 100% all (scoped to `config.ts`); `web` 100% stmts/funcs/lines, ~91% branch. A drop fails with exit 1.

### Supply chain

- [ ] **Audit** — `pnpm audit --audit-level high --ignore-registry-errors`
  - _Expect:_ exits **0** (this box, 2026-07-23: `--audit-level high` passes; several transitive advisories are remediated live by the pnpm `overrides:` entries in `pnpm-workspace.yaml`, and two `fast-uri` GHSAs are deferred in `auditConfig.ignoreGhsas` pending the fix's age-gate — so a bare `pnpm audit` reports `2 high (2 ignored)`, not a clean tree; see [MAINTENANCE.md → Watch items](MAINTENANCE.md)). A *new* high/critical outside the allowlist turns it red.
- [ ] **Renovate config valid** — `pnpm dlx --package renovate renovate-config-validator .github/renovate.json`
  - _Expect:_ `Config validated successfully` (downloads the renovate package on first run).

### Dev tooling (each ships green)

- [ ] **Dashboards-as-code validate** — `pnpm --filter @repo/observability check`
  - _Expect:_ `[observability] config OK` + lists 1 monitor (`app-health`) + 1 heartbeat (`jobs-worker`). No creds needed.
- [ ] **Email templates render** — `pnpm --filter @repo/email exec email export --dir ./src/templates --outDir $env:TEMP/email-export --pretty`
  - _Expect:_ "Successfully exported emails" — 8 HTML files (welcome, verify-email, reset-password, change-email, verify-new-email, email-changed-notice, delete-account, organization-invitation).
- [ ] **Email preview server** _(starts a server; Ctrl-C to stop)_ — `pnpm --filter @repo/email preview` → open http://localhost:3001 and click through the templates.
- [ ] **Storybook gallery** _(starts a server)_ — `pnpm storybook` → http://localhost:6006; toggle the dark-mode theme switch; the `ThemeToggle` story's menu works.
- [ ] **Bundle analysis** — `pnpm --filter web analyze` (interactive treemap on :4000) or `pnpm --filter web analyze:output` (writes a static report under `apps/web/.next/diagnostics/analyze`).
- [ ] **Bundle-size budget** — after any `pnpm --filter web build`, run `pnpm --filter web size`.
  - _Expect:_ both entries green (Client JS ~640 kB < 750 kB, CSS ~11 kB < 15 kB, gzipped). Budgets live in `apps/web/.size-limit.json`; the opt-in CI `perf` job runs this same check (`ENABLE_PERF`). See DEPLOYMENT.md → Performance budgets.
- [ ] **Fresh-app scaffold** _(into a throwaway dir, don't run in the repo)_ — `node scripts/init-app.mjs` rewrites app identity; exercise it on a copy/clone, not your working tree.

---

## Phase 2 — DB-backed automated suites _(no account; Docker up)_

- [ ] **DB integration tests** — `pnpm --filter @repo/db test:integration`
  - _Expect:_ **3 files / 15 tests** pass (posts keyset pagination + `leftJoin` author, subscriptions upsert/idempotent/cascade, uploads persist/idempotent/null-MIME/cascade) against real Postgres.
- [ ] **Jobs integration test** — `pnpm --filter @repo/jobs test:integration`
  - _Expect:_ **1 test** passes — pg-boss enqueue → worker process round-trip in an isolated `pgboss_test` schema.
- [ ] **Background-jobs cross-process demo** (two shells):
  - Shell A: `pnpm --filter @repo/jobs start` → _Expect:_ `[jobs] worker started — watching: welcome-email`
  - Shell B: `pnpm --filter @repo/jobs enqueue:demo you@example.com` → _Expect:_ `enqueued.`
  - Back in Shell A → _Expect (email unset):_ `[jobs] welcome-email for you@example.com skipped — email not configured` (proves the job crossed processes; a real send appears here once Resend is set — Phase 4).
- [ ] **E2E + a11y suite** — `$env:CI="true"; pnpm test:e2e`  _(then `Remove-Item Env:\CI`)_
  - `CI=true` forces `workers=1` + retries, mitigating a **known local flake**.
  - _Expect (CI):_ all specs green — the full `apps/web/e2e/*.spec.ts` set (home, auth, posts, admin family, a11y, security-headers, account family, data-export, i18n, organization, passkey, two-factor, billing-org, csp-nonce, email-suppression, image-optimization, magic-link, state, uploads).
  - ⚠️ **Known environmental flake on this dev box:** the `signUp → /dashboard` redirect is timing-fragile here — during this dry-run **10 passed**, `posts.spec` was flaky (passed on retry), and `admin.spec` failed on that redirect. **This is environmental, not a code bug** (documented in PROJECT_STATUS / [BACKLOG → Watch](BACKLOG.md)); the suite is **green in CI**. If a spec fails locally: rerun, or trust the CI lane — `gh run watch <id>`, confirmed with `gh run view <id> --json status,conclusion`.

---

## Phase 3 — Manual feature verification in the browser _(no account; Docker up)_

Run the app and click through. Use **dev** for fast iteration; use the **ad-hoc prod build**
for header/CSP checks.

```powershell
pnpm dev                      # dev server on http://localhost:3000
# — or, for prod-accurate headers/CSP on a separate port:
pnpm --filter web build
$env:PORT=3100; $env:AUTH_TRUSTED_ORIGINS="http://localhost:3100"; pnpm --filter web start
```

### Landing & theming
- [ ] **`/`** renders the "next-web-boilerplate" hero + the `@repo/ui` card with Primary/Secondary/Outline/Destructive buttons.
- [ ] **Dark mode** — the top-right toggle switches Light / Dark / System with **no flash** on reload (next-themes pre-paint script).

### Auth (C1) — email **unset** path (default)
- [ ] **Sign up** at `/signup` → lands on **`/dashboard`** immediately (no verification required when email is unconfigured).
- [ ] **Sign out** (user menu) → redirected out; revisiting `/dashboard` bounces to `/login`.
- [ ] **Sign in** at `/login` with the same creds → back on `/dashboard`.
- [ ] **Proxy gate (signed out)** — `curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" http://localhost:3100/dashboard`
  - _Expect:_ `307` → `…/login?redirectTo=%2Fdashboard`. Same for `/account`, `/admin`. _(Verified live.)_
- [ ] **Reverse gate** — while signed in, visiting `/login` or `/signup` redirects to `/dashboard`.
- [ ] **Forgot password** at `/forgot-password` → always shows a **neutral** "if an account exists…" message (no account enumeration), regardless of address.
- [ ] **Reset dead-end** — open `/reset-password` with no/expired `?token` → renders a dead-end with a "request a new link" path.
- [x] **Compromised-password check (HIBP, Band-1 Tier-4)** — a known-breached password is rejected on the password-setting paths (`/sign-up/email`, `/change-password`, `/reset-password`); a fresh unique password is accepted. _Live-verified 2026-07-07 on a fresh :3100 prod build: `Password123` (1.5M breaches) → `400 PASSWORD_COMPROMISED` at both sign-up and change-password; a fresh password → `200` (user + session created). k-anonymity SHA-1-prefix call to `api.pwnedpasswords.com`, no secret; **fails closed** if HIBP is unreachable. See AUTH.md → Compromised-password check._
- [x] **Two-factor auth (2FA / TOTP, Band-2 Tier-4)** — from `/account`, enroll (password → QR/manual key + backup codes → first authenticator code activates it), then sign out and sign in: after the password step the login form shows an **inline code step** (not `/dashboard`); a live TOTP — or a backup code via the fallback — lands on `/dashboard`. Regenerate + disable also password-gated; an OAuth-only account sees a "set a password first" pointer. _Live-verified 2026-07-08 on a fresh prod build (email off) via the serial `e2e/two-factor.spec.ts` (in-repo RFC-6238 TOTP helper — no dep): enroll → regenerate → disable, and enroll → sign-out → TOTP challenge → backup-code challenge → `/dashboard`. Served on **:3000** so the browser Origin matches `BETTER_AUTH_URL` (a port mismatch 403s the `/two-factor/*` POSTs on CSRF). See AUTH.md → Two-factor authentication._
- [x] **Opt-in CAPTCHA (Cloudflare Turnstile, A12 Tier-4)** — with both `TURNSTILE_*` vars set, the auth forms render the Turnstile widget, the submit stays disabled until it yields a token, and the server verifies the `x-captcha-response` header on sign-up / sign-in / password-reset; with the env unset (default), no plugin registers and the forms are unchanged. _Live-verified 2026-07-11 with Cloudflare's **dummy test keys** (no account needed — see AUTH.md → Bot protection for the key values): server leg on `:3100` (secret set + no header → 400 "Missing CAPTCHA response"; + token → 401 passthrough; secret unset → 401, no gate); keyed UI loop (always-pass secret → widget mints a token → sign-up lands on `/dashboard`, no CSP errors; always-fail secret → inline "Captcha verification failed", stays on `/signup`). Keyless e2e regression-free. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is build-time-inlined → **rebuild** after setting it (the secret is a runtime var → restart)._

### Account (M3 · P2-1 · P2-2) — `/account`
- [ ] **Edit display name** → saves; the new name shows after refresh.
- [ ] **Change password** (credential user) card present → change succeeds; other sessions are revoked.
- [ ] **Email change — immediate path** (email unset): changing the email applies **immediately** and the page refreshes to the new address (the two-hop verified path needs Resend → Phase 4).
- [ ] A **social-only** user (after Phase 4 OAuth) sees a "set a password via /forgot-password" pointer instead of the password card.
- [ ] **Sessions card (P2-1)** — sign in from a second browser/context → both sessions list (device label, IP, times); **Revoke** the other one → row disappears optimistically; the revoked context's next DB-backed read re-gates to `/login` (≤ 5 min cookie-cache window). _(E2E-covered: `account-sessions.spec.ts`.)_
- [ ] **Danger zone — immediate deletion (P2-2, email unset)** — wrong password is rejected inline; correct password deletes → full navigation to `/goodbye`; the deleted credentials can't sign in; user-FK rows (posts/uploads/subscriptions) cascade away. _(E2E-covered: `account-deletion.spec.ts`; the verification-gated path needs Resend → Phase 4.)_

### RBAC / admin (Step 21 · D2)
- [ ] **Promote the first admin out-of-band** (never self-service):
  `docker exec nwb-postgres psql -U postgres -d appdb -c "UPDATE \"user\" SET role='admin' WHERE email='you@example.com';"`
- [ ] As that admin, the header shows an **Admin** nav link; `/admin` lists users.
- [ ] **Promote/demote another user** via the row control (optimistic — flips instantly, reconciles).
- [ ] **Anti-lockout** — your own row shows **"(you)"** instead of a button (can't self-demote).
- [ ] **Non-admin** user → `/admin` returns **404** and shows **no** Admin nav link.

### Posts (`/posts`) — the copy-me entity (Step 28 · D1 · D4)
- [ ] **List** shows seeded posts; **"Load more"** pages by keyset cursor (8 seeded > 5/page).
- [ ] **Create** a post (signed in) → appears **optimistically** at the top, then reconciles.
- [ ] **Edit** your post inline → updates optimistically.
- [ ] **Delete** your post → removed optimistically.
- [ ] **Rollback demo** — try to edit/delete **another author's** post (e.g. a seeded one) → it changes optimistically then **rolls back** on the typed `Forbidden`.
- [ ] **Cached count** — `<PostStats>` shows a count; creating a post busts the cache (`updateTag("posts")`).

### Notifications (`/notifications`) — realtime SSE (Tier 4 · A22)
- [x] **Live push across connections** — sign in, open `/notifications` in two tabs; wait for the **Live** stream badge in both, then **Send test notification** in one → the other's feed prepends the row + the unread badge updates **without a reload** (plus a toast); **Mark all read** clears the badge; the rows survive a refresh (persisted `notifications` table). Needs no env beyond the DB — works with everything else unset; if the stream is down the send still lands via refetch ("refresh to see new"). _E2E-verified in-commit 2026-07-12 via `e2e/notifications.spec.ts` — two browser contexts prove the cross-connection `pg_notify` → single LISTEN client → in-process fan-out → `EventSource` push. See API.md → Realtime / SSE._

### Scaffold demos — degraded behavior (env unset)
- [ ] **`/state`** — toggling either `UiStoreDemo` instance updates **both** (shared Zustand store).
- [x] **`/search`** — type a term + **Search** → "Search is not configured." (Meili env unset). Logged-out **Reindex posts from database** → "Unauthorized".
  - **Light up local search (free, no account):** uncomment in `.env` → `MEILISEARCH_HOST="http://localhost:7700"` and `MEILISEARCH_API_KEY="dev_meili_master_key_change_me"` (must match the compose `MEILI_MASTER_KEY`); restart. Then sign in, click **Reindex posts from database** → "Reindexed N posts.", and a search returns hits.
  - ✅ **Verified end-to-end on this box (2026-06-30):** uncommenting the two vars against the running `nwb-meilisearch` flips the tRPC `search.search` read path from `configured:false` → `configured:true`; **Reindex** → "Reindexed 8 posts." (this repaired a *stale persisted index* — `pagination` went from 0 hits → "Cursor pagination, not offset"); **index-on-write + delete** confirmed (created then deleted an `xyzzyplugh` post — searchable immediately on create, gone on delete, no reindex needed); re-commenting the vars degrades back to `configured:false`. The logged-out-reindex "Unauthorized" and "Search is not configured" guards are also unit-tested (`apps/web/src/server/actions/post.test.ts`). Note: the Meili Docker volume persists the index across restarts, so a fresh box may already hold stale docs — reindex to reconcile.
- [ ] **`/uploads`** — the Uploadthing **UploadButton** renders; without `UPLOADTHING_TOKEN` an upload fails gracefully (requires sign-in). `curl.exe http://localhost:3100/api/uploadthing` returns route config JSON (handler mounts without a token).
- [x] **`/uploads` read path + delete, degraded (P2-3)** — signed in with rows in the `uploads` table (seed via psql if needed), the "Your uploads" card lists them (`image/*` thumbnails); **Delete** removes the row optimistically (token unset → row-only delete). _Live-verified 2026-07-03 on a fresh :3100 prod build (seeded rows → real-UI list/delete → account deletion enqueued the surviving key → worker drained with the graceful skip). The configured loop is Phase 4._
- [ ] **`/observability`** — four buttons: **Capture a test error (Sentry)**, **Send a structured log (BetterStack)**, **Capture an event (PostHog)**, **Throw a render error (test boundary)**. With env unset each is a no-op (status text says so) and the `example-flag` shows **unconfigured**. The render-error button hits the app `error.tsx` boundary.

### Platform: health, headers, rate limits, SEO
- [ ] **Health (ready)** — `curl.exe -s http://localhost:3100/api/health`
  - _Expect:_ `200` `{"status":"ok",...,"checks":{"database":"up"}}` _(verified live)_.
- [ ] **Health (down)** — `docker stop nwb-postgres` → `curl.exe -i http://localhost:3100/api/health` → **503** `"database":"down"`; then `docker start nwb-postgres`. _(Safe; not run during dry-run to avoid disrupting the shared DB.)_
- [ ] **Prod security headers** — `curl.exe -I http://localhost:3100/`
  - _Expect (verified live):_ `Content-Security-Policy` (incl. `upgrade-insecure-requests`, `script-src 'self' 'unsafe-inline' https://js.stripe.com` — **no** `unsafe-eval`), `Strict-Transport-Security` (prod-only), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- [x] **CSP nonce mode (path-to-100 #10)** — build with `CSP_MODE=nonce` (bash: `CSP_MODE=nonce pnpm --filter web build`), serve, then `curl.exe -I http://localhost:3100/` twice.
  - _Expect:_ `script-src 'self' 'nonce-<base64>' 'strict-dynamic' …` with **no** script `'unsafe-inline'` (style-src keeps it), a **different nonce** on the second request, same on `/es`; every `<script>` tag in `curl.exe -s http://localhost:3100/ | findstr "<script"` carries that request's `nonce="…"`; pages render dynamic (no PPR). Starting a **static** build with `CSP_MODE=nonce` at runtime changes **nothing** (build-time knob).
  - ✅ **Verified live 2026-07-17** on a fresh keyless `:3100` nonce build: rotating per-request nonce on `/` + `/es`, all script tags stamped, zero console CSP violations across landing → signup → dashboard → posts (create, incl. the `updateTag` cached-count bust) → account; default-build headers stayed **byte-identical** to pre-#10; runtime-override no-op confirmed. The `e2e/csp-nonce.spec.ts` matrix pins this in the `csp-nonce` CI lane (`ENABLE_CSP_NONCE`, on in this repo).
- [ ] **Dev header variance** — `pnpm dev` then `curl.exe -I http://localhost:3000/` → CSP gains `'unsafe-eval'` + `connect-src … ws:`, and **no** HSTS. _(Authored — dev not booted during dry-run.)_
- [ ] **PostHog proxy reachable with CSP on** — `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3100/ingest/static/array.js` → **200** _(verified live)_.
- [ ] **Auth rate limit** — POST `/login` (wrong password) >5×/min → **HTTP 429**. (Better Auth `customRules`.)
- [ ] **tRPC rate limit** — hammer `/posts` or `/search` (`post.list` / `search.search`) >20×/min from one IP → `TOO_MANY_REQUESTS` (HTTP 429).
- [ ] **SEO / PWA routes** — all `200` _(verified live)_: `/robots.txt` (text/plain), `/sitemap.xml` (application/xml), `/manifest.webmanifest` (application/manifest+json), `/opengraph-image` (image/png); favicons `/icon` + `/apple-icon` render.

---

## Phase 4 — Free-tier SaaS integrations _(free accounts)_  _(✅ COMPLETE — all sections run live 2026-07-05 → 07; see each section's banner)_

For each: **sign up → copy key(s) into root `.env` → restart the app → assert it lights up.**
All are optional and independent; the app keeps building/running if you skip any.

### Resend (email) — unlocks verification, reset, welcome, two-hop email change, magic link, bounce/complaint suppression

> ✅ **Section verified live 2026-07-01 → 05** (hop-2 delivery closed 2026-07-14; magic link +
> bounce/complaint added 2026-07-16) — full record:
> [archive/VERIFICATION_PROVENANCE.md → Resend](archive/VERIFICATION_PROVENANCE.md#resend-email).
>
> ⚠️ **Test-sender restriction:** `onboarding@resend.dev` sends without domain verification
> **but only delivers to the email you registered the Resend account with** — any other
> recipient returns a 403 (and the D7 job then throws + retries). Verify a domain to reach
> arbitrary recipients. **Subaddresses of the owner address (`you+tag@…`) are rejected
> too**, and in the auth flows the 403 is invisible: `@repo/auth` discards the send
> helper's typed error, so the auth endpoint returns 200 and nothing is delivered
> (observed 2026-07-03 during the P2-6 live check). Test auth email flows with the exact
> registered address.

- [x] Sign up at resend.com → **API Keys** → create a key. Set in `.env`:
  `RESEND_API_KEY="re_…"` and `EMAIL_FROM="onboarding@resend.dev"` (the shared test sender works without domain verification; use your verified domain for real mail).
- [x] Restart. **Now verification is required:** sign up → page shows **"check your inbox"** (not an immediate session). ✅ verified 2026-07-03 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#resend-email)
- [x] Click the verification link → session created → a **Welcome** email arrives (sent via the D7 background job — run the worker: `pnpm --filter @repo/jobs start`). ✅ verified 2026-07-05 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#resend-email)
- [x] **Password reset** — `/forgot-password` → email arrives → `/reset-password?token=…` sets a new password; old password no longer works. (The token expires in **1 h** — re-request and click promptly.) ✅ verified 2026-07-05 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#resend-email)
- [x] **Two-hop email change** (current email **verified**): `/account` → change email →
  (hop 1) a confirm link goes to your **old** address → approve →
  (hop 2) a verify link goes to your **new** address → click →
  change applies, the **old** address gets a "your email was changed" notice, and **other sessions are revoked**.
  - To reach the verified state for testing, you can flip it directly:
    `docker exec nwb-postgres psql -U postgres -d appdb -c "UPDATE \"user\" SET email_verified=true WHERE email='you@example.com';"`
  - ✅ verified 2026-07-05 (M6/M7 live); hop-2 **delivery** closed 2026-07-14 against a real verified sending domain — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#resend-email)
- [x] **Magic-link sign-in** (env-gated on email config): with Resend set, `/login` shows
  "Email me a sign-in link" → request → link in the email signs you in; the link is
  single-use. Mechanics →
  [context/auth/factors.md](context/auth/factors.md).
  ✅ verified 2026-07-16 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#resend-email)
- [x] **Bounce/complaint suppression** (`POST /api/resend/webhook`, gated on
  `RESEND_WEBHOOK_SECRET`): a permanent-bounce or complaint event adds the address to
  `email_suppressions`; every send helper then skips it. Mechanics →
  [services/resend.md](context/services/resend.md).
  ✅ verified 2026-07-16 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#resend-email)
- [x] **Degraded check** (regression guard): with the keys removed, all of the above no-op gracefully and signup returns to the immediate-session path. (Blank the key **from bash** — PowerShell `$env:X=""` deletes the var and dotenv-cli reloads the live key.) ✅ verified 2026-07-05 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#resend-email)

### Sentry (errors/traces)

> ✅ **Section verified live 2026-07-06 → 07** (capture + CSP-report + degraded 2026-07-06;
> source-map upload 2026-07-07) — full record:
> [archive/VERIFICATION_PROVENANCE.md → Sentry](archive/VERIFICATION_PROVENANCE.md#sentry-errorstraces).

- [x] Create a project at sentry.io → copy the **DSN**. Set `NEXT_PUBLIC_SENTRY_DSN="https://…"` in `.env`; restart. (`NEXT_PUBLIC_*` is build-time-inlined — **build after** setting the DSN; a plain restart isn't enough for the client SDK.) ✅ verified 2026-07-06 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#sentry-errorstraces)
- [x] On `/observability`, click **Capture a test error (Sentry)** (and/or **Throw a render error**) → the event appears in your Sentry **Issues**. (A sentry.io DSN needs **no** CSP change — the shipped `https://*.sentry.io` connect-src covers it.) ✅ verified 2026-07-06 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#sentry-errorstraces)
- [x] _(Optional)_ **Source-map upload** at build: set `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, and flip `@sentry/cli` to `true` in `pnpm-workspace.yaml` `allowBuilds`, then `pnpm build` → maps upload (Turbopack-supported). ✅ verified 2026-07-07 (incl. minified → original-source symbolication, confirmed headlessly via the Sentry API) — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#sentry-errorstraces)
- [x] _(Optional)_ **CSP violation reporting** (P3-6 recipe): apply the SECURITY.md "CSP violation reporting" diff with your real DSN, rebuild/restart, load any page and run `fetch("https://example.com/")` in the console → the violation arrives in your Sentry project (their CSP/security-report handling). (Two live-verified gotchas: Sentry silently drops security reports for `localhost` pages, and the modern `report-to` uploader never fires under browser automation — SECURITY.md → "CSP violation reporting" has the mechanics.) ✅ verified 2026-07-06 → 07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#sentry-errorstraces)
- [x] **Degraded check** (regression guard): DSN unset → the SDK is a no-op again. ✅ verified 2026-07-06 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#sentry-errorstraces)

### OpenTelemetry (opt-in OTLP trace export)

> ✅ **Section verified live 2026-07-16** (shipped with path-to-100 #9) against a local
> `otel/opentelemetry-collector` in all three env states — baseline (endpoint unset →
> zero collector traffic), OTLP-only, and dual Sentry + OTLP — full record:
> [archive/VERIFICATION_PROVENANCE.md → OpenTelemetry](archive/VERIFICATION_PROVENANCE.md#opentelemetry-opt-in-otlp-trace-export).

- [x] Run a local collector + set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, restart (no rebuild), drive a few pages → span batches appear in `docker logs` within ~5s. _The exact config + one-liner is in [services/sentry.md](context/services/sentry.md)._
- [x] **Degraded check** (regression guard): endpoint unset → zero OTel activity; the Sentry init is byte-identical to before (`openTelemetrySpanProcessors: []`). ✅ verified 2026-07-16 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#opentelemetry-opt-in-otlp-trace-export)

### BetterStack (logs) + dashboards-as-code

> ✅ **Section verified live 2026-07-07** against a real free-tier BetterStack account
> (Telemetry Source for logs + an Uptime API token for dashboards-as-code) — full record:
> [archive/VERIFICATION_PROVENANCE.md → BetterStack](archive/VERIFICATION_PROVENANCE.md#betterstack-logs--dashboards-as-code).

- [x] Create a **Source** (Telemetry → Sources) → copy its **source token** + **ingesting host**. Set `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL` in `.env`; restart. (`BETTER_STACK_INGESTING_URL` needs the `https://` scheme and **no path**.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#betterstack-logs--dashboards-as-code)
- [x] On `/observability` click **Send a structured log (BetterStack)**, and make any tRPC call (e.g. load `/posts`) → structured log lines (tRPC telemetry: `path`/`durationMs`/`ok`) appear in BetterStack Live tail. (Unset → these print to console instead.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#betterstack-logs--dashboards-as-code)
- [x] **Dashboards-as-code** — create an **Uptime API token**; `$env:BETTER_STACK_API_TOKEN="…"; pnpm --filter @repo/observability sync` → idempotent upsert of the `app-health` monitor + `jobs-worker` heartbeat. Copy the heartbeat's ping URL → set `BETTER_STACK_HEARTBEAT_URL` for the worker so a dead worker pages you. (⚠️ BetterStack rejects a `localhost` monitor URL with `422` — run the sync with a public `SITE_URL`; with the API token unset, `sync` no-ops and exits 0.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#betterstack-logs--dashboards-as-code)

### PostHog (analytics + flags)

> ✅ **Section verified live 2026-07-07** against a real free-tier PostHog project (US
> region) — full record:
> [archive/VERIFICATION_PROVENANCE.md → PostHog](archive/VERIFICATION_PROVENANCE.md#posthog-analytics--flags).
>
> ⚠️ **`NEXT_PUBLIC_*` is build-time-inlined** — set the key **then `pnpm --filter web build`**
> (a restart is NOT enough for the client SDK; same rule as the Sentry DSN). Confirmed the
> key is baked into a client chunk after build, absent after the keyless rebuild.
>
> ⚠️ **posthog-js has a client-side BOT FILTER that silently drops `capture()`/`identify()`
> under browser automation** — and it makes the SDK *look* live while dropping every event:
> config/flags/extensions (`/ingest/array/<key>/config.js`, `/ingest/flags/`, surveys,
> web-vitals, dead-clicks) all load, but **no event-ingestion POST ever leaves**. The debug
> tell is `[PostHog.js] [WebExperiments] Refusing to render … likely bot`. `isLikelyBot`
> (posthog-js 1.391.2) keys on **three** signals: the `userAgent` string, `navigator.webdriver`,
> **and `navigator.userAgentData.brands`** — and headless Chromium's `brands` still contains
> `"HeadlessChrome"` even after you override the UA string, so overriding UA + `webdriver`
> alone is NOT enough. Defeat all three (real Chrome UA **+** `navigator.webdriver → false`
> **+** `navigator.userAgentData` with clean brands) to observe the real POSTs. This is a
> test-harness artifact only: a real human browser is never bot-flagged, so the identical
> `posthog.capture`/`posthog.identify` path runs and sends for real users (the filter is
> *supposed* to drop bot traffic).

- [x] Create a project at posthog.com → **Project API Key** + region host. Set `NEXT_PUBLIC_POSTHOG_KEY="phc_…"` and `NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"` (or `eu`); restart. (PostHog needs **no** CSP change — it's reached via the same-origin `/ingest` rewrite.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#posthog-analytics--flags)
- [x] On `/observability` click **Capture an event (PostHog)** → `observability_demo_event` shows in PostHog **Activity**. (Traffic is same-origin via the `/ingest` proxy.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#posthog-analytics--flags)
- [x] Create a feature flag **`example-flag`** in PostHog → `/observability` shows the flag as **on/off** (server-evaluated, no flicker). (Only the client KEY is build-time-inlined — the flag VALUE is read per-request server-side, so toggling it in PostHog needs no rebuild.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#posthog-analytics--flags)
- [x] **User identification (P2-5)** — browse signed-out (events are anonymous) → sign in → PostHog **People** shows a person whose distinct id is the Better Auth user id with `email`/`name` set, and the pre-login anonymous events merged into it → sign out → subsequent events attribute to a **new** anonymous id (reset), not the person. OAuth sign-in identifies too (the watcher, not the forms, drives it). ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#posthog-analytics--flags)
- [x] **Degraded check** (regression guard): keys unset → the browser SDK is inert and the flag reads "unconfigured". ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#posthog-analytics--flags)

### Uploadthing (file uploads → DB)

> ✅ **Section verified live 2026-07-07** against a real Uploadthing app (region `sea1`) —
> files confirmed in real UT storage via their `*.ufs.sh` URLs (**200 = stored → 404 =
> deleted**) — full record:
> [archive/VERIFICATION_PROVENANCE.md → Uploadthing](archive/VERIFICATION_PROVENANCE.md#uploadthing-file-uploads--db).
>
> ⚠️ **The `onUploadComplete` callback only fires in `next dev` on localhost — NOT in a prod
> build.** This inverts the usual "verify against a fresh prod build" rule for this one
> integration. UT 7.7.4 derives `isDev` from `NODE_ENV === "development"` and sends it with
> the presigned-URL request. `isDev:true` (dev) → UT pushes completion down an **outbound
> dev stream** the server already holds open (reaches localhost fine) → `onUploadComplete`
> runs → the `uploads` row lands. `isDev:false` (prod `next start`) → UT makes an **inbound
> server-to-server callback** to the derived callback URL (`http://localhost:3000/api/uploadthing`),
> which UT's cloud **cannot reach** → the callback never fires → **no row is written** (the
> file still uploads + serves; only persistence is missed). Confirmed both ways on this box.
> This is the Uploadthing analog of "webhooks need a public endpoint" (like `stripe listen`):
> a real deploy has a public callback URL, so the prod path works there. **The delete paths
> are unaffected** — `deleteUpload` + the `delete-uploads` job both call `UTApi().deleteFiles()`
> (a direct server→UT API call, no inbound callback), so Rows 3–4 verify identically in dev
> or prod. **Local prod-build workaround:** `UPLOADTHING_CALLBACK_URL` + a tunnel — the
> worked runbook is in SERVICES.md → Uploadthing. **Live-proven 2026-07-17** (program #4b —
> cloudflared tunnel → prod callback POSTed in → `uploads` row landed; keyless surface
> e2e-pinned by `e2e/uploads.spec.ts`) — full record:
> [archive/VERIFICATION_PROVENANCE.md → Uploadthing](archive/VERIFICATION_PROVENANCE.md#uploadthing-file-uploads--db).

- [x] Create an app at uploadthing.com → **API Keys** → copy the token. Set `UPLOADTHING_TOKEN="…"` in `.env`; restart. (`UPLOADTHING_TOKEN` is a plain server var → **restart, not rebuild**.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#uploadthing-file-uploads--db)
- [x] Sign in → `/uploads` → upload an image (≤4 MB) → succeeds; a row lands in the **`uploads`** table (check `pnpm --filter @repo/db db:studio`, keyed by storage `key`, idempotent). (Run under `next dev` for the dev-stream callback — ⚠️ above.) ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#uploadthing-file-uploads--db)
- [x] **Full delete loop (P2-3, configured)** — the upload shows in the "Your uploads" card (thumbnail); **Delete** removes the row AND the file — its `ufs.sh` URL stops serving (the action is fail-closed: the row only goes once storage deletion succeeded). ✅ verified 2026-07-07 (the no-token depth 2026-07-03) — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#uploadthing-file-uploads--db)
- [x] **Avatar upload → `user.image` (Band-1 Tier-4)** — on `/account`, the Profile card's **Photo** section uploads a photo via the `avatarUploader` route → `user.image` is set → the round avatar renders there **and** in the dashboard-header user menu; **Remove** nulls it (fallback initials return). (The header avatar lags a removal by up to the 5-min session cookie-cache; the card updates optimistically.) ✅ verified 2026-07-08 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#uploadthing-file-uploads--db)
- [x] **Account-deletion file cleanup (configured)** — upload a file, delete the account from `/account`, run the worker (`pnpm --filter @repo/jobs start`) → the `delete-uploads` job logs `removed 1/1 file(s)` and the `ufs.sh` URL stops serving. ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#uploadthing-file-uploads--db)

### OAuth (GitHub + Google social login)

> ✅ **Section verified live 2026-07-07** — real GitHub and Google OAuth flows each completed
> to `/dashboard` with **no code change** (a social button renders **iff** the provider has
> both id + secret; plain server vars → restart, not rebuild; `signIn.social` is a top-level
> navigation → no CSP allowlist entry) — full record:
> [archive/VERIFICATION_PROVENANCE.md → OAuth](archive/VERIFICATION_PROVENANCE.md#oauth-github--google-social-login).
>
> ⚠️ **A GitHub _App_ client id (`Ov23li…`) works for the OAuth sign-in flow** — a classic
> _OAuth App_ is not strictly required. Both use the same `github.com/login/oauth/authorize`
> web flow, and Better Auth's `github` provider drove a GitHub-App credential to a completed
> sign-in + linked `account` row here (classic OAuth Apps work identically). ⚠️ **Google's
> consent screen in _Testing_ mode only admits listed test users** — add the sign-in Google
> account as a **test user**, else Google returns access-denied.

- [x] **GitHub** — create an OAuth App (Settings → Developer settings); callback `http://localhost:3000/api/auth/callback/github`. Set `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`; restart. ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#oauth-github--google-social-login)
- [x] **Google** — create OAuth credentials (Google Cloud console); callback `http://localhost:3000/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`; restart. ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#oauth-github--google-social-login)
- [x] `/login` + `/signup` now render a social button **per configured provider** (an unconfigured provider shows **no** button). Sign in via each → lands on `/dashboard`. ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#oauth-github--google-social-login)

### Upstash Redis (distributed rate limiting) — optional

> ✅ **Section verified live 2026-07-07** against a real Upstash Redis DB. `UPSTASH_*` are
> plain server vars → **restart, not rebuild**. Unlike the other Phase-4 keys, the creds were
> **blanked back out** after the check — Upstash is the *multi-instance-only* driver, and
> local dev keeps the shipped in-memory default. The two guarded tRPC procedures are
> `post.list` + `search.search` (`rateLimitedProcedure`, **20 req / 60 s** per IP per path —
> [trpc.ts:118](../apps/web/src/server/trpc/trpc.ts#L118)). Full record:
> [archive/VERIFICATION_PROVENANCE.md → Upstash](archive/VERIFICATION_PROVENANCE.md#upstash-redis-distributed-rate-limiting).
>
> ✅ **The tRPC 429 now carries the standard `RateLimit-*` + `Retry-After` headers** (Tier-4
> B1, 2026-07-08). Both HTTP-429 surfaces — the tRPC `rateLimitedProcedure` and the Stripe
> webhook — emit them via the shared `rateLimitHeaders()` helper
> ([rate-limit.ts](../apps/web/src/lib/rate-limit.ts)); the tRPC path stashes the blocked
> bucket on ctx and the fetch handler's `responseMeta`
> ([route.ts](../apps/web/src/app/api/trpc/[trpc]/route.ts)) writes the headers. Auth routes
> keep Better Auth's own `X-Retry-After`. Live-verified: a `post.list` 200 carries no
> rate-limit headers; the 21st hit → `429` with `RateLimit-Limit: 20`, `RateLimit-Remaining: 0`,
> `RateLimit-Reset`/`Retry-After` as live delta-seconds. See [SECURITY.md](context/SECURITY.md)
> → Rate limiting → 429 response headers. ⚠️ The distributed driver
> **fails OPEN** ([rate-limit.ts:140](../apps/web/src/lib/rate-limit.ts#L140)) — a transient
> Redis blip allows the request rather than locking everyone out; flip to fail-closed there if
> your app prefers it. ⚠️ To force the in-memory fallback while the creds are in `.env`, blank
> the vars **from bash** before starting (dotenv-cli won't override an already-set empty shell
> var); `$env:X=""` in PowerShell *deletes* the var instead.

- [x] Create a Redis DB at upstash.com → copy the **REST URL + token**. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; restart (`Redis.fromEnv()` reads exactly these two names). ✅ verified 2026-07-07 — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#upstash-redis-distributed-rate-limiting)
- [x] The app-level limiter switches from in-memory to the distributed sliding-window driver (required for multi-instance/serverless). Re-run the tRPC 429 check; the limit now holds across instances. ✅ verified 2026-07-07 (four independent tells: enforcement at exactly 20, the Redis key write, a 429 surviving a server restart, and the in-memory negative control) — full record: [archive/VERIFICATION_PROVENANCE.md](archive/VERIFICATION_PROVENANCE.md#upstash-redis-distributed-rate-limiting)

---

## Phase 5 — Stripe (test mode) _(free test mode; needs an account + the Stripe CLI)_  ✅ VERIFIED

> ✅ **Verified end-to-end in Stripe test mode 2026-07-13** (fresh prod build on `:3000`,
> headless Stripe CLI — no `stripe login`): hosted checkout → webhook → idempotent
> `subscriptions` row, customer reuse (P2-4a), billing-portal round-trip (P2-4b), test-clock
> dunning → `past_due` (P2-4c), webhook 400/503/429 hardening, and the A13 live
> cancel-on-delete. Gotcha: test mode needs a customer-portal configuration — one API
> `billing_portal.configurations.create` surfaces the account default. Full record:
> [archive/VERIFICATION_PROVENANCE.md → Stripe](archive/VERIFICATION_PROVENANCE.md#phase-5--stripe-test-mode).
>
> ✅ **Per-org billing (#11) verified end-to-end in test mode 2026-07-17** (fresh prod build
> on `:3100`): org-context checkout → `subscriptions` row with `organization_id` set and
> `user_id` NULL (the XOR ownership), idempotent on resend; `/premium` unlocked for every
> member while a plain member sees no billing controls; portal on the **org's** customer;
> org-delete → the worker canceled the org's Stripe subscription. Full record:
> [archive/VERIFICATION_PROVENANCE.md → Stripe](archive/VERIFICATION_PROVENANCE.md#phase-5--stripe-test-mode).

- [x] Get **test** keys from the Stripe Dashboard. Set in `.env`: `STRIPE_SECRET_KEY="sk_test_…"` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_…"`.
- [x] Run the webhook forwarder (prints the signing secret):
  `stripe listen --forward-to localhost:3000/api/stripe/webhook` → copy `whsec_…` into `STRIPE_WEBHOOK_SECRET`; restart the app. _(Headless variant used: `stripe listen --api-key sk_test_… --forward-to …` — no browser `stripe login` needed; `--print-secret` mints the same `whsec_`.)_
- [x] **Checkout flow** — sign in → `/billing` → **Subscribe** → redirected to Stripe hosted Checkout → pay with test card `4242 4242 4242 4242` (any future expiry/CVC) → returns to `/billing/success`. _(On the current sandbox Checkout UI the card fields mount inline (`#cardNumber/#cardExpiry/#cardCvc`) only after the **Card** payment-method radio is selected.)_
- [x] **Webhook persistence** — the `checkout.session.completed` event fires → a row upserts into the **`subscriptions`** table (`db:studio`), idempotent on redelivery (event resend kept a single row, `created_at` unchanged). Also try `stripe trigger checkout.session.completed`.
- [x] **Repeat checkout reuses the customer (P2-4a)** — with a recorded subscription, click **Subscribe** again → complete checkout → the Stripe Dashboard shows **one** customer for the user (the session was created with `customer`, not `customer_email`; before P2-4 every checkout minted a duplicate).
- [x] **Billing portal round-trip (P2-4b)** — after the checkout lands, `/billing` shows the **"Your subscription"** card (status + renewal date) → **Manage billing** → Stripe-hosted portal opens for the right customer → "Return" lands back on `/billing`. (Test mode ships a default portal configuration; if the API errors, save one under Settings → Billing → Customer portal — or `POST /v1/billing_portal/configurations` once, which surfaces the account default.)
- [x] **Payment-failure sync (P2-4c)** — the handler resolves the subscription via `invoice.parent.subscription_details` and re-projects the row's `status` from the retrieved subscription (`db:studio`). A trigger-fabricated invoice references an unrecorded subscription (deliberate no-op), so this was proven the strong way: a **test clock** with the recorded subscription on a failing card (`4000 0000 0000 0341`) advanced past renewal → real `invoice.payment_failed` → row flips to `past_due`.
- [x] **Webhook hardening** — bad signature → **400**; unconfigured (keys removed) → **503**; flood the endpoint → **429** (`Retry-After`).
- [x] **Degraded checks** _(live-verified on this box 2026-07-03, :3100 prod build)_ — logged-out **Subscribe** → "Unauthorized"; logged-in with no keys → "Stripe is not configured"; no recorded subscription → no "Your subscription" card; seeded row + no keys → card renders and **Manage billing** returns the typed unconfigured error.
- [x] **Per-org billing (#11)** _(live-verified 2026-07-17 — the banner above)_ — with an **active org**: Subscribe as org owner → checkout → webhook → row with `organization_id` (no `user_id`); `/premium` unlocked for **every member**; plain member sees the owners/admins notice (no controls; the action gate is unit-pinned to run **before** the config gate); portal opens on the org's customer; org delete → worker cancels the org's Stripe subscription. Keyless context plumbing: `e2e/billing-org.spec.ts`.

---

## Phase 6 — Production build & deployment

### Local Docker image _(free)_
- [ ] **Build** from repo root — `docker build -f docker/Dockerfile -t nwb-web .` (multi-stage; sets `BUILD_STANDALONE=1` internally; no secrets baked).
- [ ] **Run** — `docker run -p 3000:3000 --env-file .env nwb-web` → app serves on `:3000`.
- [ ] **Container health** — `docker ps` shows the container **healthy** (the image's `HEALTHCHECK` hits `/api/health`). A down DB flips it to `unhealthy`.
- [ ] **Migrations are out-of-image** — the runtime has no `drizzle-kit`; run `DATABASE_URL=… pnpm --filter @repo/db db:migrate` from the host/CI against the target DB first.

### prod-compose (app + Postgres + Meili + worker) _(free)_
- [ ] `docker compose -f docker/docker-compose.prod.yml up --build` → `web` + `-prod` Postgres/Meili + the **`worker`** (D7) come up on one network; secrets load from root `.env`, with service-name overrides for `DATABASE_URL`/`MEILISEARCH_HOST`.
- [ ] Apply migrations once the DB is up; hit `http://localhost:3000/api/health` → 200.

### Vercel _(detailed; free tier)_
- [ ] Push the repo to GitHub; **Import** it in Vercel (auto-detects Next.js — zero config; it ignores `output: standalone`, so no `BUILD_STANDALONE` needed).
- [ ] In **Project → Settings → Environment Variables**, set the required vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`=your Vercel URL) plus any feature keys from Phases 4–5. Add a managed Postgres (Vercel Postgres / Neon / Supabase) for `DATABASE_URL`.
- [ ] **Run migrations against the prod DB** before/at first deploy: `DATABASE_URL="<prod>" pnpm --filter @repo/db db:migrate`.
- [ ] Deploy → open the URL → `/api/health` is 200, sign-up/sign-in works, headers present (grade via securityheaders.com / Mozilla Observatory).
- [ ] _(If you use auth on a separate domain or previews)_ add those origins to `AUTH_TRUSTED_ORIGINS`.

### Fly.io _(verified live 2026-07-13)_

> ✅ **Verified end-to-end on Fly.io 2026-07-13.** The committed `docker/Dockerfile` + `fly.toml`
> deployed to a real host with managed Postgres — a test app in a personal Fly org, single
> `shared-cpu-1x`/512 MB machine + an unmanaged `fly postgres` (`shared-cpu-1x`/256 MB, 1 GB
> vol). Checks that passed: the app's `fly.dev` URL `/api/health` → **200 `{"database":"up"}`**;
> homepage 200 with the full prod security-header set (CSP · HSTS · X-Frame-Options · COOP);
> `fly status` machine `started`, **1/1 checks passing**; and a real **sign-up POST → 200 + a
> `__Secure-better-auth.session_token` cookie → the user row confirmed in the managed Postgres**
> (auth + DB write end-to-end). Worked runbook: [DEPLOYMENT.md → Fly.io](context/DEPLOYMENT.md#flyio-worked-runbook).

- [x] **Fly.io** — `fly apps create` → `fly postgres create` + `attach` (sets `DATABASE_URL` to a **direct** session conn — pg-boss/SSE `LISTEN` need it) → migrate via `fly proxy` + `pnpm --filter @repo/db db:migrate` (runtime image has no drizzle-kit) → `fly secrets set BETTER_AUTH_SECRET`/`BETTER_AUTH_URL=https://<app>.fly.dev` → `fly deploy --ha=false`. Run the D7 worker as a second Fly app from the Dockerfile's `worker` target if you need background jobs.

### Railway _(pointer)_
- [ ] **Railway** — deploy `docker/Dockerfile`; add Postgres + Meilisearch as Railway services; set env vars; run migrations.

### CI & extras
- [ ] **Watch CI** — push a branch / open a PR → `gh run watch <id>`, then `gh run view <id> --json status,conclusion` reports `success` (don't rely on `watch --exit-status` alone); the `verify` · `audit` · `e2e` jobs go green.
- [ ] **CodeQL** _(opt-in)_ — only after the repo is **public or GHAS-enabled**: `gh variable set ENABLE_CODEQL --body true`; findings land under Security → Code scanning. (Skipped/neutral by default.)
- [ ] **Turbo remote cache** _(opt-in)_ — `pnpm turbo login` + `pnpm turbo link` (Vercel) **or** set `TURBO_API`/`TURBO_TOKEN`/`TURBO_TEAM` (self-hosted); add `TURBO_REMOTE_CACHE_SIGNATURE_KEY` for signed artifacts.

---

## Appendix — env var → feature map

| Var(s) | Feature | Phase | Without it |
| --- | --- | --- | --- |
| `DATABASE_URL` | Postgres (everything) | 0 | **required** — app won't start |
| `DB_POOL_MAX` | app DB-pool `max` cap (A29) | 6 | pg's built-in default (`max: 10`); invalid value fails loud at boot |
| `BETTER_AUTH_SECRET` | session signing | 0 | **required** — app won't start |
| `BETTER_AUTH_URL` / `AUTH_TRUSTED_ORIGINS` / `SITE_URL` | auth origin / CSRF / SEO base | 0/3 | sensible localhost defaults |
| `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` | search (`/search`, post indexing) | 3 (local, free) | "Search is not configured" |
| `RESEND_API_KEY` + `EMAIL_FROM` | email verify / reset / welcome / email-change | 4 | sends no-op; verification off |
| `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`/`PROJECT`/`AUTH_TOKEN`) | error tracking (+ source maps) | 4 | SDK is a no-op |
| `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL` | structured logs | 4 | logs → console |
| `BETTER_STACK_API_TOKEN` / `BETTER_STACK_HEARTBEAT_URL` | dashboards-as-code / worker heartbeat | 4 | `sync` no-ops; no heartbeat |
| `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` | analytics + flags | 4 | SDKs inert |
| `UPLOADTHING_TOKEN` | file uploads → `uploads` table | 4 | uploads fail gracefully |
| `GITHUB_*` / `GOOGLE_*` (id+secret pairs) | OAuth social login | 4 | no social button shown |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | distributed rate limiting | 4 | in-memory per-instance limiter |
| `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile CAPTCHA on sign-up / sign-in / password-reset | 3 (dummy test keys, free) | no plugin, no widget — forms unchanged |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Checkout + webhook → `subscriptions` | 5 | Checkout 503 / "not configured" |

> Source of truth for validation: `apps/web/src/env.ts`. Reference docs: per-area files in
> `docs/context/` (AUTH, SERVICES, SECURITY, DEPLOYMENT, DATABASE, TESTING).
