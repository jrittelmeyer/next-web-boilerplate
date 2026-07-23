# Per-item build lessons preserved verbatim from project-state memory, 2026-07-23

The project-state persistent memory was slimmed on 2026-07-23 (context-engineering
overhaul); each lesson below survives in memory as a one-liner pointing here. This file
is the verbatim record. (`[[slug]]` links refer to other memory files in the Claude Code
memory directory, not repo files.)

## Path-to-100 program lessons

- **#11 lessons (non-derivable):** the post-checkout redirect on a :3100 verify box
  refuses (success_url = BETTER_AUTH_URL :3000) — the webhook path is unaffected;
  drive post-payment assertions by goto, not the redirect. Drizzle wraps PG errors —
  the violated-constraint name is on `error.cause`, not the message. With live test
  keys in root .env the billing e2e's Subscribe click redirects to REAL Stripe
  checkout — the spec asserts either-outcome (typed keyless error OR stripe.com
  redirect). Better Auth org-delete nulls ONLY the deleter's activeOrganizationId —
  other members' sessions keep a dangling id (page falls back to personal via the
  org-row existence check; actions fail closed).
- **#4b RESOLVED 2026-07-17** — cloudflared (downloaded to scratchpad, no install)
  quick tunnel ran fine once John approved; proof per the committed runbook (prod
  :3000 + `UPLOADTHING_CALLBACK_URL` from bash → callback through the tunnel → row;
  dated box in VERIFICATION.md). Lessons: the standing test account + request-jar
  sign-in drove it cleanly; the /uploads row **Delete needs `click({force:true})`**
  (a real-PostHog-key build renders the ConsentBanner → intercept; dispatchEvent on
  the button alone did NOT fire the action the first try).
- E2E baseline **58 tests (54 + 4 billing-org since #11): ~49 passed / 4–7
  known-flaky (ALL the signup→dashboard family; each passes on retry) + 1
  admin-pagination fail that is DETERMINISTIC locally** — the stale-user count
  crossed the spec's 500-row walk cap (508+ `@example.com` users, still growing).
  CI (fresh throwaway Postgres) is green/immune. **RESOLVED 2026-07-18** by the
  postgres-18 volume wipe (wave record above) — local admin-pagination red cleared.
  A long loaded run can also drop ONE extra spec 3-retries-deep as pure load noise
  (2026-07-17: org posts-scoping failed in the full run, 7/7 in isolation) — isolate
  before suspecting a regression; CI is the arbiter. The nonce-mode e2e
  (`CSP_MODE=nonce CI=true … test:e2e`) is separate: 4 tests, ~12s.
- #9 OTel lessons: the NEXT_PUBLIC-server-bundle-inlining / `SENTRY_DEBUG` /
  local-Sentry-ingest-sink tricks live in [[prod-verify-3100-recipe]] (one source).
  Only here: **the OTLP exporter's default flush is ~5s** — wait before reading
  collector logs; `OTEL_*` vars are genuinely runtime (no `NEXT_PUBLIC_` prefix).
- Program session lessons (non-derivable): **the locale cookie redirects later
  unprefixed navs** — after any `/es/*` visit, `goto /signup` 307s to `/es/signup`;
  browser-driving scripts must fill the LOCALIZED form. Catalog key-tree parity is a
  one-line node flat-compare (485 keys as of #7). **An upsert's conflict-update
  timestamp must use the SAME clock as the column default** — `new Date()` vs
  `defaultNow()` ran backwards (Docker Postgres ~700ms ahead); fix `` sql`now()` ``.
  **Root `.env` values are QUOTED** — a `grep|cut` export carries literal `"`
  (drizzle-kit exits 1 with ZERO output); strip `| tr -d '"'`. **Better Auth's DB
  rate-limiter window SLIDES** and counters survive restarts → back-to-back e2e runs
  429 (the magic-link spec resets its keys via `support/db.ts
  resetMagicLinkRateLimit`). Playwright `webServer.env` merges over process.env and
  beats the start script's dotenv — keeps the :3001 capture server's fake creds
  authoritative. Phantom IDE diagnostics again (~40×) — trust Biome CLI/tsc
  ([[session-tooling-gotchas]]). **Owner-items sweep 2026-07-14→15: ALL CLOSED** —
  Fly teardown + token revoke ([[fly-deploy-gotchas]]) · Renovate LIVE (dashboard =
  issue #1, Monday batches, majors behind approval; Mend Silent-mode gotcha →
  MAINTENANCE.md) · PayPal funding live (FUNDING.yml + Sponsorships, GraphQL-verified)
  · CODECOV_TOKEN decided-SKIP (in-repo gates already enforce) · Dependabot override
  trio + emptied `ignoreGhsas` (record → MAINTENANCE.md Watch items). Public commits:
  dedicated-email identity, NO trailers ([[commit-coauthor-both-models]]).
  Non-derivable leftovers: **Renovate opens NO PRs for lockfile-only transitives**
  (why Dependabot+overrides was the tool); uploadthing's exact effect pins are deps,
  not peers (zero peer warnings).

## Non-derivable per-item lessons (carry forward — the docs carry everything else)

- **Admin plugin — the staleness trade-off (KEY DECISION):** every `/admin/*` plugin endpoint
  authorizes off the cookie-cached SESSION role (≤5 min stale), so **ban/unban = fresh-gated
  DIRECT DB writes** (the plugin endpoint would wrongly forbid a just-promoted admin; verified
  promote-then-ban E2E) while **impersonation MUST use the plugin** (cookie swap) and carries
  the window: a just-promoted admin must re-sign-in first.
  - The Server-Action cookie swap DOES flush via `nextCookies()` (proven by the
    cache-bypassed `get-session` probe); UI must do a FULL nav (`window.location`) to load it.
  - The impersonation E2E must RE-SIGN-IN the admin after `promoteToAdmin`;
    `session.impersonatedBy` IS in session output. `ImpersonateControl` hides on self + admin targets.
  - **LOCAL admin-pagination flake = DB accumulation, NOT code.** The spec walks every user
    (cap 500); a local DB accumulating stale `@example.com` e2e users eventually never
    terminates. CI immune. Cleared 2026-07-18 by the postgres-18 volume wipe; if it regrows,
    the fix is `DELETE FROM "user" WHERE email LIKE '%@example.com'` (cascades; spare the
    real accounts; the mass DELETE trips the safety classifier — needs John's OK).
- **i18n — Windows/VSCode `git mv` trap:** `git mv <dir>` fails "Permission denied" (VSCode
  watchers hold recursive DIRECTORY handles). Individual FILE renames are NOT blocked →
  `mkdir -p` targets, `git mv` file-by-file, then `find … -depth -type d -empty -delete`
  (git still records `R` renames). Reusable for any large restructure here.
- **Passkeys:**
  - A new button whose accessible name CONTAINS an existing button's name collides under
    Playwright's default substring match — fix at the SELECTOR (`exact: true`); when adding a
    button, grep e2e for `name:` prefixes.
  - **Run the FULL e2e suite before pushing, not just the new spec** — a selector collision
    only surfaces when the OTHER specs run. Local mirror: `CI=true RESEND_API_KEY="" pnpm
    --filter web test:e2e` (bash-set the blank).
  - Passkey E2E = Chrome CDP virtual authenticator (`WebAuthn.enable` +
    `addVirtualAuthenticator{ctap2, internal, resident, automaticPresenceSimulation}`); the
    resident cred lives on the CONTEXT (survives sign-out); sign IN before delete.
  - **`gh run watch --exit-status` reported exit 0 on a FAILED run (twice)** — never trust it;
    re-confirm `gh run view <id> --json conclusion` ([[gh-ci-access]]).
- **A23 / SSE reconnect backfill:** the fix is a stream-scoped `hasConnected` closure (NOT a
  ref). **`context.setOffline(true)` canNOT force an EventSource reconnect** (localhost
  keep-alive survives CDP offline) — drive the drop at the network edge: `page.route` the
  stream URL, `route.fulfill` the FIRST connect with a self-closing SSE body
  (`": connected\n\n"`, `text/event-stream`), HOLD the reconnect behind a promise, release
  after the send lands. `route.continue()` streams SSE transparently. Offline status string =
  "Reconnecting…".
- **A24 / unread badge:** on the SSE push **INVALIDATE (refetch) rather than optimistically
  `++`** — the sender's OWN tab also receives that NOTIFY (double-count risk); set straight to
  `{count:0}` on mark-all-read. The notification ROUTER stays off the measured coverage set.
- **A25 / infinite-query cache:** the SSE push must dedupe across ALL loaded pages; the
  `setQueryData` key must be `infiniteQueryKey({limit})` with the SAME input as the options.
  E2E: a button under the local ConsentBanner — `click({force:true})` does NOT help; use
  `.dispatchEvent("click")`. `-g "<title>"` doesn't survive `pnpm --filter web test:e2e --`
  (dotenv eats it); run playwright directly from apps/web via
  `pnpm exec dotenv -e ../../.env -- playwright test <file> -g "<title>"`.
- **Consent / data-export:** use posthog-js `get_explicit_consent_status()` (NOT
  `has_opted_in/out_capturing()` — opt-out-by-default reads "denied", banner never shows).
  A real local `NEXT_PUBLIC_POSTHOG_KEY` renders the ConsentBanner in prod builds →
  bottom-click interception; full local E2E needs a KEYLESS REBUILD from bash
  (`NEXT_PUBLIC_POSTHOG_KEY="" RESEND_API_KEY="" pnpm --filter web build`; PowerShell
  `$env:X=""` DELETES the var). The Playwright PROCESS needs `DATABASE_URL`
  (support/db.ts) — run via the dotenv-wrapped `test:e2e` script.
- **2FA:** React reuses a controlled `<Input>` DOM node across two forms at the same tree
  position → the new field silently stops accepting keystrokes; force a remount (distinct
  component types + per-variant `key`). `enable({password})` does NOT activate — the FIRST
  `verifyTotp` flips it (abandoned enroll = un-enrolled; TOTP verify is stateless, same-window
  replay safe). `/two-factor/enable` is 3/min per IP — drain ~65s between local re-runs.
  Serve prod on **:3000** (a mismatched port 403s the 2FA POSTs on CSRF).
- **Orgs:** `@repo/ui` floor breaches surface on a branch's FIRST CI run — re-base the floor,
  don't add smoke tests. A DropdownMenu item opening a dialog must NOT `preventDefault()` its
  `onSelect` (leftover `aria-hidden`) — deferred open + deferred nav (in AUTH.md).
- **Visual regression:** `reuseExistingServer:true` reuses a STALE orphaned Storybook →
  false-green mutation tests; kill the orphan first. The mega-test needs
  `test.setTimeout(180_000)`. Lane LIVE since A28: 56 `…-linux.png` committed +
  `ENABLE_VISUAL` set + the job runs **inside `container:
  mcr.microsoft.com/playwright:v1.61.0-noble`** (a bare runner's font set fails every
  text-bearing story). Regenerate linux baselines by TAR-COPYING the repo into the container
  (in-container `pnpm install` over the mount aborts on win32 node_modules; forcing CI=true
  would purge the host tree) — generate, re-run in ASSERT mode, copy back only the PNGs; run
  the docker command from PowerShell, not Git Bash. Keep the image tag + UI.md recipe tag in
  lockstep with `@playwright/test`. An intended visual change rebases BOTH platform sets.
  New stories: `--update-snapshots=missing` writes only the new baselines (reports "failed"
  on first-write but writes; re-run to confirm green).
- **Perf budget:** Next 16's build table no longer prints First Load JS — measure the emitted
  files. To prove a dormant CI lane: set the var + push an EMPTY trigger commit → watch →
  delete the var + `git reset --hard <real-tip>` + `--force-with-lease` before merge.
- **SBOM:** Trivy image = `ghcr.io/aquasecurity/trivy` (Docker Hub 401s);
  `MSYS_NO_PATHCONV=1 docker run --rm -v //var/run/docker.sock:/var/run/docker.sock … image
  --format cyclonedx --quiet nwb-web:ci`. The image SBOM inventories what's PHYSICALLY in
  node_modules — bundled app deps are correctly absent; don't chase "missing components".
- **Slim worker:** the esbuild bundle needs ZERO runtime externals except `pg-native`;
  esbuild MUST alias `server-only` → the empty stub. KEEP the final stage named `worker`
  (compose builds `target: worker`).
- **DB rate-limit storage:** cross-restart proof = trip 5/min → 429 → RESTART → first hit
  STILL 429; beat the 60s window race with `UPDATE rate_limit SET
  last_request=(extract(epoch from now())*1000)::bigint` first; control = DELETE row → 401 +
  recreated count=1.
- **A12 CAPTCHA:** the durable gotcha is [[better-auth-conditional-plugin-tuple]];
  Cloudflare's dummy test keys (in AUTH.md) make the flow verifiable with no account.
- **A13 cancel-on-delete:** the correct integration point is the **D7 job pattern, NOT inline
  in the auth hook** (`@repo/auth` can't import apps/web's `getStripe`; never block deletion
  on a Stripe call). `beforeDelete` captures non-terminal sub ids via a
  `pendingStripeCancellations` Map → `afterDelete` enqueues → a `@repo/jobs` handler with its
  OWN env-gated `new Stripe(...)`. `subscriptions.id` IS the Stripe `sub_…` id — `cancel(row.id)`
  directly. Keyless verify: enqueue fake ids → worker logs the unconfigured skip (proves
  routing); configured branch = mocked-`stripe` unit test (`vi.hoisted`).
- **A27–A32 closes:** knip auto-runs `pnpm install` when package.json changed (a seeded
  fake-dep probe gets installed — revert needs a fresh install). A29's `DB_POOL_MAX` validates
  in `packages/db/src/client.ts` itself (deliberately NOT app env.ts). A30/A32: verify doc
  snippets via a scratch compile in apps/web/src, deleted pre-commit (knip flags leftovers).
  A31 typedRoutes is a SILENT NO-OP under this tsconfig (`.next` exclude wins over the
  generated-types include); probe with deliberately-typo'd hrefs. A32's timeZone SSR mismatch
  is INVISIBLE on one machine (server zone == browser zone) — verify via locale-diff (/en vs
  /es), UTC-not-wall-clock time, and raw-SSR-HTML == hydrated DOM. Prefetched feed rows ARE
  server-rendered (un-awaited `void prefetchInfiniteQuery` still lands in SSR HTML).
  Browser-driving gotchas: sign in via the context request jar
  (`ctx.request.post("/api/auth/sign-in/email", {headers:{Origin:BASE}})`); the notifications
  page holds an open SSE stream → `networkidle` NEVER settles (use `domcontentloaded`); after
  a soft nav, wait on a DOM element, not `waitForURL`.
