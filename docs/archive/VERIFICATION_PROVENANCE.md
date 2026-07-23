# Verification provenance — one-time narratives

> One-time verification narratives moved out of docs/VERIFICATION.md on 2026-07-23 — the
> checklist keeps the dated ✅ lines; this file keeps the full provenance.

Everything below is preserved verbatim as it stood in [../VERIFICATION.md](../VERIFICATION.md)
(Phases 4–5) — whole section banners and whole checklist rows, step text included — with only
relative link paths adjusted for this file's location. A "⚠️ above" inside a narrative refers
to the standing gotcha boxes that remain beside the corresponding checklist section.

## Phase 4 — Free-tier SaaS integrations

### Resend (email)

> ✅ **Section COMPLETE (2026-07-01 → 05; hop-2 delivery closed 2026-07-14; magic link + bounce/complaint added 2026-07-16).** All rows
> verified on this box against fresh prod builds on **:3000** (origin-exact — real form POSTs
> pass the origin check), inbox side via a real inbox: welcome **send path**
> 2026-07-01 (worker → real Resend message id); signup flip + resend button + verify-link →
> session 2026-07-03 (P2-6 loop); welcome **delivery**, the password-reset loop, the two-hop
> email change (M6/M7) and the degraded re-check 2026-07-05 (dated notes per row below). Root
> `.env` keeps the live `RESEND_API_KEY` + `EMAIL_FROM` (gitignored — not committed); the
> worker and all servers were stopped afterwards (worker restart: `pnpm --filter @repo/jobs
> start`). The one leg the sandbox sender could not prove — hop-2 **delivery** of the email
> change to a non-owner address — is now **verified 2026-07-14** against a real verified
> sending domain; see the dated note on the two-hop row below.

- [x] Restart. **Now verification is required:** sign up → page shows **"check your inbox"** (not an immediate session). _Verified 2026-07-03 (P2-6 live loop, fresh prod build on :3000) — including the **Resend verification email** button: a second real delivery arrived, and the 4th click inside a minute rendered the inline rate-limit error._
- [x] Click the verification link → session created → a **Welcome** email arrives (sent via the D7 background job — run the worker: `pnpm --filter @repo/jobs start`). _Verified 2026-07-05, full fresh loop: signup → real verification email delivered → link click → signed-in `/dashboard` (`get-session`: `emailVerified: true`) → worker logged `welcome-email sent (id: 8606f9ab-…)` → **"Welcome!" delivered to the real inbox**. Bonus: on worker start the stale job enqueued 2026-07-01 (worker was down) drained and delivered too — pg-boss retains queued jobs across days._
- [x] **Password reset** — `/forgot-password` → email arrives → `/reset-password?token=…` sets a new password; old password no longer works. _Verified 2026-07-05: real "Reset your password" delivery → emailed link → "Password updated"; old password rejected inline ("Invalid email or password"), new password signs in to `/dashboard`. **Gotcha:** the token expires in 1 h and Better Auth prunes the expired `verification` row — a first attempt clicked >1 h after the request bounced to `/reset-password?error=INVALID_TOKEN` (empty table). Re-request and click promptly._
- [x] **Two-hop email change** (current email **verified**): `/account` → change email →
  (hop 1) a confirm link goes to your **old** address → approve →
  (hop 2) a verify link goes to your **new** address → click →
  change applies, the **old** address gets a "your email was changed" notice, and **other sessions are revoked**.
  - To reach the verified state for testing, you can flip it directly:
    `docker exec nwb-postgres psql -U postgres -d appdb -c "UPDATE \"user\" SET email_verified=true WHERE email='you@example.com';"`
  - _Verified 2026-07-05 (M6/M7 live): hop-1 **"Confirm your email change"** (the dedicated template) delivered to the **old** address's real inbox and click-approved; the sandbox sender can't deliver hop-2 to a non-owner address (silent 403, ⚠️ above), so the real Better-Auth-generated hop-2 link was captured via a temporary server-side log (reverted, never committed) and clicked in the requesting browser → change applied (`get-session` → new address, `emailVerified: true`), the old address received **"Your email address was changed"**, and the **other** session was revoked (probed alive pre-click → null after) while the clicking session survived. The only unproven leg was hop-2 **delivery**, now **closed 2026-07-14** (next bullet)._
  - _Hop-2 **delivery** verified 2026-07-14 (a real sending domain verified in Resend; `EMAIL_FROM` switched to a `noreply@` address on it). Full two-hop driven live end-to-end via curl + the real inbox: sign-up → verify (stateless JWT link) → `change-email` → hop-1 **"Confirm your email change"** delivered to the old `+alias` and approved → hop-2 **"Confirm your new email address" delivered to the new `+alias` inbox** and clicked → change applied (`get-session` + DB `user` row → new address, `email_verified=true`; `audit_log` recorded `user.email_changed`). Deliverability proven independently: a domain send landed in **INBOX** (SPF/DKIM/DMARC aligned, observed) and Resend reported the non-owner `+alias` sends **Delivered**. New-domain **greylisting** deferred first-contact to each new recipient by a few minutes (warmup, expected — not a misconfig). The two hop links were read directly from the recipient inbox; servers stopped + the throwaway test user removed afterwards._
- [x] **Magic-link sign-in** (env-gated on email config): with Resend set, `/login` shows
  "Email me a sign-in link" → request → link in the email signs you in; the link is
  single-use. _Verified live 2026-07-16 on a fresh :3100 prod build (real key): the
  affordance renders and `/sign-in/magic-link` returned `{status:true}` (real send);
  full request → captured link → session → replay-rejection loop proven in
  `e2e/magic-link.spec.ts` via the test-only capture seam. Mechanics →
  [context/AUTH.md](../context/AUTH.md#magic-link-sign-in-env-gated-path-to-100-6)._
- [x] **Bounce/complaint suppression** (`POST /api/resend/webhook`, gated on
  `RESEND_WEBHOOK_SECRET`): a permanent-bounce or complaint event adds the address to
  `email_suppressions`; every send helper then skips it. _Verified live 2026-07-16 on
  :3100 (minted secret): signed bounce POST → 200 → suppression row via psql; tampered
  signature → 400; a real magic-link request to the suppressed address returned the
  neutral `{status:true}` with the logged skip and no Resend send. The
  genuine-Resend-origin proof (needs a public tunnel) stays an optional rider —
  [SERVICES.md → Resend](../context/SERVICES.md#bounce--complaint-handling-path-to-100-8)._
- [x] **Degraded check** (regression guard): with the keys removed, all of the above no-op gracefully and signup returns to the immediate-session path. _Verified 2026-07-05 on the same prod build with the key blanked **from bash** (`RESEND_API_KEY="" pnpm --filter web start` — PowerShell `$env:X=""` DELETES the var and dotenv-cli would reload the live key): signup → immediate session → `/dashboard` (no "check your inbox"); `/forgot-password` renders its neutral sent state with nothing dispatched. Throwaway user removed afterwards._

### Sentry (errors/traces)

> ✅ **Section COMPLETE (2026-07-06 → 07).** Capture + CSP-report + degraded verified
> 2026-07-06 against a real free-tier DSN (us region); **source-map upload verified
> 2026-07-07** (row below, confirmed headlessly via the Sentry API). Root `.env` keeps the
> live `NEXT_PUBLIC_SENTRY_DSN` (gitignored — SDK stays lit like the other sections); the
> source-map `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` are CI/build-time only and were
> reverted to commented placeholders, and `@sentry/cli` back to `false`, after the check (the
> shipped network-light default). Servers stopped after; the verify auth token was revoked.

- [x] Create a project at sentry.io → copy the **DSN**. Set `NEXT_PUBLIC_SENTRY_DSN="https://…"` in `.env`; restart. _Verified 2026-07-06: free-tier project (us region); DSN into root `.env` → **fresh prod build** served on :3000. `NEXT_PUBLIC_*` is build-time-inlined, so build **after** setting the DSN (a plain restart isn't enough for the client SDK); the SDK flips on via `enabled: Boolean(dsn)` in all three runtime configs._
- [x] On `/observability`, click **Capture a test error (Sentry)** (and/or **Throw a render error**) → the event appears in your Sentry **Issues**. _Verified 2026-07-06 (Playwright-driven prod build on :3000): the capture click POSTed an envelope to `o…ingest.us.sentry.io/api/…/envelope/` → **200**, Sentry assigned event ids (`5a6a1c7f…`, `8f534dd2…`); **Throw a render error** rendered the `error.tsx` boundary ("Something went wrong") and its `captureException` envelope was accepted (`ccf8d0d7…`). All SDK traffic passed the shipped `https://*.sentry.io` connect-src — a sentry.io DSN needs **no CSP change**. Issues confirmed visually in the Sentry UI._
- [x] _(Optional)_ **Source-map upload** at build: set `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, and flip `@sentry/cli` to `true` in `pnpm-workspace.yaml` `allowBuilds`, then `pnpm build` → maps upload (Turbopack-supported). _Verified 2026-07-07 against the real project (`na-kuf/nextjs-boilerplate`). **Upload (machine signal):** `CI=1 pnpm --filter web build` (`CI` unsilences the `silent:!process.env.CI` guard) → the `runAfterProductionCompile` hook uploaded maps — build log showed `Bundled 76 files for upload` → `Uploaded files to Sentry` → `File upload complete`, `Release: 832ca34…` (HEAD SHA), `Upload type: artifact bundle`, and a Source Map Upload Report pairing each JS chunk to its `.map` via **debug id**. **Symbolication (headless, no UI read):** with a **User Auth Token** (`project:releases` + `event:read`), re-triggering the same **Throw a render error** + **Capture a test error** on the served build (:3000) produced events whose frames resolved **minified → original source** — the render error went from the pre-maps baseline `app:///_next/static/chunks/3ezvv6ce3-gqm.js:20:187134` (fn `uf`, no context) to **`apps/web/src/components/observability/observability-demo.tsx:21:15`** (fn `Component`, 11 lines of source context, matching the `throw` at line 21); the manual capture resolved to `observability-demo.tsx:26` (the `captureError` fn). Debug ids match the served bundle to the uploaded maps, so no release coordination is needed. **Reverted after:** `@sentry/cli` back to `false` + creds back to commented placeholders (the shipped network-light default — a no-creds forced rebuild attempts **no** upload and compiles clean); auth token revoked. **Gotcha:** on **win32-x64** the `sentry-cli` binary ships prebuilt via the `@sentry/cli-win32-x64` **optional dependency**, so it is resolvable even with `allowBuilds:false` — the flip is still the correct **cross-platform** step (other platforms fetch the binary via the gated postinstall), but on this box the gate did not actually block it; blanking the creds is what exercises the no-upload path._
- [x] _(Optional)_ **CSP violation reporting** (P3-6 recipe): apply the SECURITY.md "CSP violation reporting" diff with your real DSN, rebuild/restart, load any page and run `fetch("https://example.com/")` in the console → the violation arrives in your Sentry project (their CSP/security-report handling). This confirms the Sentry-side half the 2026-07-05 local check couldn't: modern `report-to` upload needs a trusted-https endpoint, so only the legacy `report-uri` POST was captured locally (against a sink). _Verified 2026-07-06→07 (recipe applied ad hoc with the real DSN, reverted after): all three header pieces rendered exactly as designed; a real browser-generated violation report was **delivered to the real Sentry endpoint → 200** via the legacy leg (`report-uri` alone → Chromium page-context `application/csp-report` POST, i.e. pre-2026-browser behavior); and report→event processing was **confirmed in Issues** (search `event.type:csp`). The endpoint also answers the CORS preflight and 200s **both** wire formats POSTed directly. Two gotchas, both verified live: (1) **Sentry silently drops security reports for `localhost` pages** — 200-accepted but no event, even with the "localhost" inbound filter **off** (paired probes: the identical report with a non-localhost `document-uri` created the event; the localhost one never did). A local-page test can therefore never surface an event — prove processing with a non-localhost `document-uri` probe and treat the delivery 200 as the local success signal. (2) The modern `report-to` **background uploader never fires under browser automation** (Playwright Chromium headless/headed, real Chrome under automation, Firefox 151: the report registers and queues, no upload leaves) — and a registered `report-to` group suppresses `report-uri`, so an automated full-recipe check observes nothing. Net: the modern leg is only observable by hand on a **deployed (non-localhost)** page; SECURITY.md → "CSP violation reporting" has the mechanics._
- [x] **Degraded check** (regression guard): DSN unset → the SDK is a no-op again. _Verified 2026-07-06 (shipped config, DSN commented out, fresh rebuild): **zero** sentry.io requests across page load + capture click + render-error click (buttons show their no-op status text; boundary still renders), and the header set is byte-identical to the shipped one (no reporting directives). DSN restored to `.env` afterwards._

### OpenTelemetry (opt-in OTLP trace export)

> ✅ **Section COMPLETE (2026-07-16, shipped with path-to-100 #9).** Verified against a
> local `otel/opentelemetry-collector` (OTLP/HTTP on :4318, debug exporter) with fresh
> prod builds on :3100, all three env states: **baseline** (endpoint unset → app healthy,
> zero collector traffic — prior behavior exactly), **OTLP-only** (keyless build, no DSN
> anywhere → 22-span batches at the collector, nothing sent to Sentry), and **dual**
> (DSN + endpoint → `transaction` envelopes at a local Sentry ingest sink **and** 36-span
> batches at the collector from the same requests). Span evidence included Next.js
> internals (`middleware GET`, `resolve page components`), `pg.query`/`pg-pool.connect`,
> and Better Auth `/get-session` handler spans; `OTEL_SERVICE_NAME=nwb-web` appeared as
> the `service.name` resource attribute. Verified runtime-gated: the endpoint was set
> only at `next start`, against builds that never saw it.

- [x] **Degraded check** (regression guard): endpoint unset → zero OTel activity; the Sentry init is byte-identical to before (`openTelemetrySpanProcessors: []`). _Verified 2026-07-16 (run A above)._

### BetterStack (logs) + dashboards-as-code

> ✅ **Section COMPLETE (2026-07-07).** All three rows verified against a real free-tier
> BetterStack account: a Telemetry **Source** (logs) + an **Uptime API token**
> (dashboards-as-code). Logs confirmed landing in the BetterStack Live tail; the sync
> upsert + worker heartbeat verified via the Uptime API. Root `.env` keeps the live
> `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL` (gitignored — logs stay lit,
> like Resend/Sentry). The Uptime API token was used ad-hoc (never persisted). The two
> `sync`-created resources were **deleted after verification** (they pointed at a
> placeholder host and would false-alert) — `sync` recreates them idempotently on a real
> deploy. Servers + worker stopped afterward.

- [x] Create a **Source** (Telemetry → Sources) → copy its **source token** + **ingesting host**. Set `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_URL` in `.env`; restart. _Verified 2026-07-07 (fresh prod build on :3000). **Gotcha:** `BETTER_STACK_INGESTING_URL` needs the `https://` scheme and **no path** — `env.ts` validates it as a URL, and `@logtail/next` POSTs to it verbatim (`getIngestURL` returns it unchanged). A direct probe POST to the host with `Authorization: Bearer <token>` → **HTTP 202**, independently confirming the creds before booting the app._
- [x] On `/observability` click **Send a structured log (BetterStack)**, and make any tRPC call (e.g. load `/posts`) → structured log lines (tRPC telemetry: `path`/`durationMs`/`ok`) appear in BetterStack Live tail. (Unset → these print to console instead.) _Verified 2026-07-07 (Playwright-driven prod build on :3000). **Configured:** the demo button (`observability demo: structured info/error log`) and the `/posts` `post.list` telemetry (`trpc.request {path,type,durationMs,ok}`) shipped to BetterStack — **zero** console lines + no fetch errors (the SDK took the network branch), and all three (my probe + the demo pair + the `trpc.request` lines) were **confirmed in the BetterStack Live tail**. **Degraded** (vars re-commented, restart): the identical lines pretty-print to the server console instead — e.g. `info - trpc.request { path: 'post.list', type: 'query', durationMs: 248, ok: true }`. The ship-vs-console flip is gated by `isEnvVarsSet()` (needs BOTH token + URL) at `@logtail/next`'s `sendLogs`._
- [x] **Dashboards-as-code** — create an **Uptime API token**; `$env:BETTER_STACK_API_TOKEN="…"; pnpm --filter @repo/observability sync` → idempotent upsert of the `app-health` monitor + `jobs-worker` heartbeat. Copy the heartbeat's ping URL → set `BETTER_STACK_HEARTBEAT_URL` for the worker so a dead worker pages you. _Verified 2026-07-07: first `sync` → `created` both; re-run → `updated` both (idempotent — the Uptime API showed exactly **1** `app-health` monitor, no duplicate). Worker heartbeat proven end-to-end: set `BETTER_STACK_HEARTBEAT_URL` to the heartbeat's ping URL → `pnpm --filter @repo/jobs start` logged `heartbeat enabled — pinging every 60s` and pinged immediately → the heartbeat's Uptime-API status flipped `pending` → **`up`**. Degraded: with `BETTER_STACK_API_TOKEN` unset, `sync` logs `not set — skipping (no-op)` and exits **0**. ⚠️ **Gotcha:** BetterStack **rejects a `localhost` monitor URL with `422 "URL is invalid"`** — the `app-health` monitor derives its URL from `SITE_URL ?? BETTER_AUTH_URL`, so a local `.env` (localhost) can't create it. Run the sync with a public `SITE_URL` (used `https://example.com` as a placeholder to verify the mechanism); the real monitor lights up once `SITE_URL` points at a deployed origin. Both placeholder resources were deleted (`204`) after the check._

### PostHog (analytics + flags)

> ✅ **Section COMPLETE (2026-07-07).** All four rows verified against a real free-tier
> PostHog project (US region, Product analytics + Feature flags) on a fresh prod build on
> **:3000**. Client SDK traffic confirmed 2xx through the same-origin `/ingest` proxy; the
> event + person confirmed in the PostHog UI (the Project API key is **write-only** — it can
> submit but not read, same posture as the Sentry DSN). Root `.env` keeps the live
> `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` (gitignored — stays lit like
> Resend/Sentry/BetterStack). Throwaway signup user deleted after; servers stopped.

- [x] Create a project at posthog.com → **Project API Key** + region host. Set `NEXT_PUBLIC_POSTHOG_KEY="phc_…"` and `NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"` (or `eu`); restart. _Verified 2026-07-07: US project, key into root `.env` → **fresh prod build** on :3000 (build after setting the key — NEXT_PUBLIC inlined). SDK lights up: `/ingest/static/array.js → 200` (same-origin asset proxy) and the client provider inits (remote `config.js` + `/ingest/flags/` fetched; `_POSTHOG_REMOTE_CONFIG` on `window`). PostHog needs **no CSP change** — it's reached via the `/ingest` rewrite ('self' covers it)._
- [x] On `/observability` click **Capture an event (PostHog)** → `observability_demo_event` shows in PostHog **Activity**. (Traffic is same-origin via the `/ingest` proxy.) _Verified 2026-07-07 (Playwright-driven prod build on :3000, bot-filter defeated — see ⚠️ above): the capture POSTed through the proxy `/ingest/i/v0/e/ → 200` (+ `/ingest/e/ → 200`), and `observability_demo_event` (property `source: observability-demo`) was **confirmed in the PostHog Activity feed**._
- [x] Create a feature flag **`example-flag`** in PostHog → `/observability` shows the flag as **on/off** (server-evaluated, no flicker). _Verified 2026-07-07: flag created **enabled** → the server-rendered `/observability` HTML showed `example-flag: on` (baked into the SSR output — no client flicker); disabled it in the PostHog UI → reload → `off` **immediately** (no rebuild). The flag VALUE is evaluated per-request server-side via `posthog-node` `isFeatureEnabled("example-flag", "observability-demo-user")` — only the client KEY is build-time-inlined._
- [x] **User identification (P2-5)** — browse signed-out (events are anonymous) → sign in → PostHog **People** shows a person whose distinct id is the Better Auth user id with `email`/`name` set, and the pre-login anonymous events merged into it → sign out → subsequent events attribute to a **new** anonymous id (reset), not the person. OAuth sign-in identifies too (the watcher, not the forms, drives it). _Verified 2026-07-07 (Playwright-driven, bot-filter defeated; RESEND blanked from bash → fresh signup gets an immediate session): read posthog's persisted `distinct_id` at each stage — **anonymous** `019f3d8b-bfb9-…` → **after sign-in** flips to `GuxAIVEGKSvSlGVGxLruuoKOzjCIRnd0` which **=== the Better Auth `user.id`** from `get-session` (email + name both set per the `identify` payload) → **after sign-out** a **new** anon id `019f3d8b-c7df-…` (reset). The signed-in **person was confirmed in PostHog People** (distinct id = the user id, anon events merged). The watcher (`components/observability/posthog-provider.tsx` → `lib/posthog-identity.ts`) drives every path — including OAuth's redirect return — not the forms. Throwaway user deleted after._
- [x] **Degraded check** (regression guard): keys unset → the browser SDK is inert and the flag reads "unconfigured". _Verified 2026-07-07 (keys re-commented, **fresh keyless rebuild** — confirmed the `phc_…` key is absent from the client bundle): the server-rendered flag reads `unconfigured`, and a browser load + capture-button click made **zero** `/ingest`/`posthog.com` requests (the provider is a transparent passthrough when the key is unset) — the button no-ops. Keys restored to `.env` after._

### Uploadthing (file uploads → DB)

> ✅ **Section COMPLETE (2026-07-07).** All four rows verified live against a real
> Uploadthing app (region `sea1`) — files uploaded to real UT storage and confirmed by
> HTTP status of their `*.ufs.sh` URLs (**200 = stored/serving → 404 = deleted**), plus the
> `uploads` table and the worker log. Root `.env` keeps the live `UPLOADTHING_TOKEN`
> (gitignored, send-only — stays lit like Resend/Sentry/BetterStack/PostHog). Throwaway
> users deleted, storage swept to 0 files, servers + worker stopped afterward.

_Tail of the standing ⚠️ dev-callback box — the 2026-07-17 prod-callback live proof:_

> or prod. **Local prod-build workaround:** `UPLOADTHING_CALLBACK_URL` + a tunnel — the
> worked runbook is in SERVICES.md → Uploadthing. **Live-proven 2026-07-17 (program #4b —
> closes the prod-callback gap above):** cloudflared quick tunnel → prod `next start` :3000
> with the override → a signed-in 70-byte-PNG upload's completion callback POSTed in
> through the tunnel (the prod server logged `handleCallbackRequest` → "Sent callback
> result to UploadThing") → the `uploads` row landed (`key=KdFsS5…RnF0`) and the "Your
> uploads" card rendered it; Delete then swept row + file (the real `ufs.sh` URL
> 200 → **404**), storage back to 0. The keyless `/uploads` surface is e2e-pinned by
> `e2e/uploads.spec.ts` (2026-07-16).

- [x] Create an app at uploadthing.com → **API Keys** → copy the token. Set `UPLOADTHING_TOKEN="…"` in `.env`; restart. _Verified 2026-07-07: live token (app `bd7mdm8njh`, region `sea1`) into root `.env`. `UPLOADTHING_TOKEN` is a **plain server var → restart, not rebuild** (the client `UploadButton` hits the same-origin `/api/uploadthing`; nothing is `NEXT_PUBLIC`). Both the web server (`dotenv -e ../../.env`) and the standalone worker (`packages/jobs/src/load-env.ts` loads root `.env`) pick it up — the worker logged `injected env (13) from ..\..\.env`._
- [x] Sign in → `/uploads` → upload an image (≤4 MB) → succeeds; a row lands in the **`uploads`** table (check `pnpm --filter @repo/db db:studio`, keyed by storage `key`, idempotent). _Verified 2026-07-07 (Playwright-driven, `next dev` for the dev-stream callback — see ⚠️ above; RESEND blanked from bash → fresh signup gets an immediate session): a 1×1 PNG uploaded → `onUploadComplete` fired via the dev stream (`POST /api/uploadthing?slug=imageUploader 200` → `handleCallbackRequest: Sent callback result to UploadThing`) → one `uploads` row landed (`key=KdFsS5…Ahki`, `name=ut-test.png`, `size=70`, `type=image/png`, `url=<ufs.sh>`), the file's `ufs.sh` URL returned **200**, and the "Your uploads" card rendered its thumbnail. Idempotency is code-guaranteed (`onConflictDoUpdate(target: uploads.key)`) + covered by the DB integration test — a callback redelivery can't be forced live, so it wasn't re-driven._
- [x] **Full delete loop (P2-3, configured)** — the upload shows in the "Your uploads" card (thumbnail); **Delete** removes the row AND the file — its `ufs.sh` URL stops serving (the action is fail-closed: the row only goes once storage deletion succeeded). _(The no-token depth — seeded-row list/delete, plus the account-deletion `delete-uploads` job draining with the graceful skip — was live-verified 2026-07-03.)_ _Verified 2026-07-07 (configured, live): pre-delete the file served (`ufs.sh` → **200**); clicking **Delete** removed the row optimistically → the same real `ufs.sh` URL then returned **404** and the DB row count for that user went to **0**. Fail-closed proven: `deleteUpload` called `UTApi().deleteFiles(realKey)` against real UT storage → the file actually left storage **before** the row was deleted (a remote failure would keep the row honest)._
- [x] **Avatar upload → `user.image` (Band-1 Tier-4)** — on `/account`, the Profile card's **Photo** section uploads a photo via the `avatarUploader` route → `user.image` is set → the round avatar renders there **and** in the dashboard-header user menu; **Remove** nulls it (fallback initials return). _Live-verified 2026-07-08 on a fresh prod build (Playwright-driven; RESEND + UPLOADTHING blanked from bash): with `user.image` seeded, the image rendered in **both** the header and the card (shared `Avatar` primitive, `<img data-slot="avatar-image">`); the `UploadButton` rendered **styled** (the card imports `@uploadthing/react/styles.css` — without it the button is bare text, caught + fixed during this verify); **Remove** → optimistic fallback + "Photo removed." + the DB column went `NULL`. The `input[type=file]` control still mounted with `UPLOADTHING_TOKEN` unset (**graceful degradation**). **Not driven live:** the upload→`onUploadComplete` **write** leg — like `imageUploader` it fires only under `next dev` on localhost (⚠️ above); it's unit-tested (`avatarKeyFromUrl`) + shares the imageUploader/D9 pattern. **Note:** the header avatar lags a `removeUserAvatar` by up to the session `cookieCache` maxAge (5 min) — the card updates optimistically; the header reads the cookie-cached session._
- [x] **Account-deletion file cleanup (configured)** — upload a file, delete the account from `/account`, run the worker (`pnpm --filter @repo/jobs start`) → the `delete-uploads` job logs `removed 1/1 file(s)` and the `ufs.sh` URL stops serving. _Verified 2026-07-07 (live): fresh signup → uploaded (row landed, `ufs.sh` → 200) → deleted the account from `/account` (immediate flow — email unset ⇒ no confirmation-link hook, password-verified). `beforeDelete` captured the key while the row existed; the `uploads` row **cascaded** (count → 0); `[auth] account.deleted { userId }` logged and `afterDelete` **enqueued** `delete-uploads {keys:[realKey]}` into `pgboss.job` (state `created`) — the file still served (**200**) at this point (deletion is deferred to the worker). Started the worker → it drained the job and logged `[jobs] delete-uploads for <userId>: removed 1/1 file(s)`, the job flipped to `completed`, and the real `ufs.sh` URL then returned **404**._

### OAuth (GitHub + Google social login)

> ✅ **Section COMPLETE (2026-07-07).** Both providers verified live end-to-end — a real
> GitHub OAuth flow and a real Google OAuth flow each completed to `/dashboard`. **No code
> change** — the providers are already fully wired: `configuredOAuthProviders()`
> (`lib/auth-providers.ts`, `server-only`) and `socialProviders()` (`@repo/auth/config`)
> mirror the same both-id+secret gate, so a button renders **iff** the provider can complete
> a sign-in; `signIn.social` is a **top-level navigation** (same class as Stripe hosted
> checkout) → **no CSP allowlist entry**. Plain server vars → **restart, not rebuild**; served
> on :3000 (auth-origin exact). Root `.env` keeps the live `GITHUB_CLIENT_ID/SECRET` +
> `GOOGLE_CLIENT_ID/SECRET` (gitignored; stays lit like the other Phase-4 keys). The
> consent/sign-in leg isn't reliably headless (provider bot-detection + 2FA + consent), so it
> was driven in a **headed** browser with the user signing in live; the button-render matrix +
> authorize-URL construction were fully machine-verified.

- [x] **GitHub** — create an OAuth App (Settings → Developer settings); callback `http://localhost:3000/api/auth/callback/github`. Set `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`; restart. _Verified 2026-07-07: creds into root `.env` (plain server vars → restart, no rebuild). `POST /api/auth/sign-in/social {provider:github}` (Origin :3000) returned the correct authorize URL — `github.com/login/oauth/authorize?…client_id=Ov23li…&redirect_uri=…%2Fcallback%2Fgithub&scope=read:user user:email` + PKCE `S256`._
- [x] **Google** — create OAuth credentials (Google Cloud console); callback `http://localhost:3000/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`; restart. _Verified 2026-07-07: creds into root `.env`. `POST /api/auth/sign-in/social {provider:google}` returned the correct authorize URL — `accounts.google.com/o/oauth2/v2/auth?…client_id=…apps.googleusercontent.com&redirect_uri=…%2Fcallback%2Fgoogle&scope=email profile openid` + PKCE. Consent screen was Testing-mode → the sign-in account added as a test user._
- [x] `/login` + `/signup` now render a social button **per configured provider** (an unconfigured provider shows **no** button). Sign in via each → lands on `/dashboard`. _Verified 2026-07-07 — **render matrix** (server HTML via curl): both configured → GitHub + Google buttons + "Or continue with" on **both** `/login` and `/signup`; blank Google (from bash) → only GitHub renders and `/sign-in/social {google}` → `PROVIDER_NOT_FOUND`; blank both → **no** social section at all (0 markers — `SocialSignIn` returns `null`). **Round-trips** (headed Playwright, user signed in live): GitHub → `/dashboard` ✓ **and** Google → `/dashboard` ✓; each landed a linked row in `account` (`github` id `2482336`, `google` id `114881996096198936732`) beside the existing `credential` account for the same verified-email user; the **P2-5 PostHog identify watcher** fired on **both** OAuth returns (`distinct_id === user.id`). The degraded/unset case is the render-matrix "blank both" row — the social section is gone when nothing is configured._

### Upstash Redis (distributed rate limiting)

> ✅ **Section COMPLETE (2026-07-07).** The app-level limiter's in-memory → distributed
> swap was verified live against a real Upstash Redis DB. `UPSTASH_*` are plain server vars
> → **restart, not rebuild** (nothing `NEXT_PUBLIC`); served on a fresh prod build at :3000.
> Root `.env` did **not** keep the creds — unlike the other Phase-4 keys, Upstash is the
> *multi-instance-only* driver, so it was **blanked back out** after the check and local dev
> keeps the shipped in-memory default (the throwaway Redis DB was deleted). The two guarded
> tRPC procedures are `post.list` + `search.search` (`rateLimitedProcedure`, **20 req / 60 s**
> per IP per path — [trpc.ts:118](../../apps/web/src/server/trpc/trpc.ts#L118)); the check drove
> `post.list` headlessly via the batch=1 + superjson curl recipe.

- [x] Create a Redis DB at upstash.com → copy the **REST URL + token**. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; restart. _Verified 2026-07-07: live REST creds into root `.env` (plain server vars → restart, no rebuild); a direct REST `PING` returned `PONG` and `DBSIZE` was `0` (clean baseline). `Redis.fromEnv()` reads exactly these two names. Blanked back out after the section (see blockquote)._
- [x] The app-level limiter switches from in-memory to the distributed sliding-window driver (required for multi-instance/serverless). Re-run the tRPC 429 check; the limit now holds across instances. _Verified 2026-07-07 (four independent tells): **(1) enforcement** — hammering `post.list` from one source gave exactly 20×`200` then `429` (`TOO_MANY_REQUESTS`, `httpStatus:429`), matching the coded `limit:20, windowSec:60`. **(2) Redis write path** — `DBSIZE` went `0 → 1` and the one key was `nwb:ratelimit:trpc:post.list:<ip>:<window>` (the `@upstash/ratelimit` `slidingWindow` prefix — impossible via the in-memory path). **(3) holds across instances** — saturated to `429`, killed the server, started a **fresh** process, and the immediate first hit was still `429` (the counter lives in Redis; in-memory would reset to a fresh 20). **(4) negative control** — with `UPSTASH_*` blanked from bash, the in-memory driver still enforced `429` at 20 but wrote **no** Redis keys (`DBSIZE` unchanged at 1), and the same saturate→restart→hit sequence returned `200` (reset) — the exact mirror of tell 3, proving 3 was genuinely Redis-backed._

## Phase 5 — Stripe (test mode)

> ✅ **Verified end-to-end in Stripe test mode 2026-07-13** (fresh prod build on `:3000`, Stripe
> CLI `v1.43.8` driven headlessly with `--api-key` — no `stripe login`; the webhook forwarder's
> signing secret matched `STRIPE_WEBHOOK_SECRET`). Proven: a real hosted-Checkout payment
> (`4242…`) → `checkout.session.completed` **200** → a `subscriptions` row (`active`), **idempotent**
> on event resend (still one row); **customer reuse (P2-4a)** — a second checkout kept **one** Stripe
> customer; **billing portal (P2-4b)** — the "Your subscription" card + Manage billing opened the
> Stripe portal for the right customer and Return landed back on `/billing`; **dunning (P2-4c)** —
> a **test-clock** renewal on a failing card (`4000 0000 0000 0341`) fired `invoice.payment_failed`
> and flipped the row to **`past_due`**; **webhook hardening** — bad/missing signature **400**,
> keys-removed instance **503**, flood **429** (`Retry-After` + `RateLimit-*`, limit 100/min);
> and **A13 cancel-on-delete** — deleting the account enqueued the `cancel-stripe-subscriptions`
> job and the `@repo/jobs` worker **canceled all 3** of the account's subscriptions in Stripe
> (2 `active` + 1 `past_due`), the DB rows cascading to 0. One gotcha surfaced: test mode needs a
> customer-portal configuration — the first API `billing_portal.configurations.create` surfaced the
> account default, after which the portal works.

> ✅ **Per-org billing (#11) verified end-to-end in test mode 2026-07-17** (fresh prod build on
> `:3100`, same headless Stripe CLI + forwarder). Proven: an org-context hosted checkout (`4242…`)
> → `checkout.session.completed` → a `subscriptions` row with **`organization_id` set and
> `user_id` NULL** (the XOR ownership), **idempotent** on event resend (still one row);
> `/billing` as the org's surface (owner sees the "Organization subscription" card + portal, which
> opened on the **org's** Stripe customer); `/premium` **unlocked for the owner AND a plain
> second member** via the org subscription, while that member saw the owners/admins notice and
> **no subscribe/manage controls**; and **org-delete cleanup** — deleting the org enqueued the
> cancel job and the worker **canceled 1/1** on Stripe (`status: canceled` confirmed via the API),
> the DB row cascading away and the owner's `/billing` falling back to the personal surface.
> (One topology artifact, not a bug: the post-payment redirect targets `BETTER_AUTH_URL` (`:3000`),
> so on a `:3100` verify box the success redirect refuses — the webhook path is unaffected.)
