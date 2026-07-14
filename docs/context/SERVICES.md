# Services

> When to load: working on Stripe, Resend, Sentry, PostHog, Uploadthing, Meilisearch, background jobs (`@repo/jobs` / pg-boss), or observability dashboards-as-code (`@repo/observability`).

---

## Stripe (Payments)

- SDK: `stripe` (server). **No client SDK is installed** — the hosted Checkout
  flow redirects server-side to `session.url`, so `@stripe/stripe-js` /
  `@stripe/react-stripe-js` aren't needed. Add them only when you build a
  client-side Elements / embedded-checkout surface (the publishable key env var
  is already reserved for that).
- Pattern: Stripe Checkout (hosted page) — simplest, PCI-compliant by default.
- Server client: `apps/web/src/lib/stripe.ts` (`import "server-only"`). It's
  app-only (both consumers live in `apps/web`) and a thin config singleton, so it
  stays in the app rather than a `@repo/*` package — same posture SERVICES.md uses
  for `lib/uploadthing.ts`. Promote to a package only if a second app needs it.
- Webhook handler: `apps/web/src/app/api/stripe/webhook/route.ts`.

**Server client (`lib/stripe.ts`):** unlike the Resend client (constructs
eagerly, only warns on a missing key), `new Stripe("")` **throws** — so it can't
be constructed at import time without breaking the "builds without creds"
guarantee. It's a **lazy guarded singleton** instead:
```typescript
import { getStripe, isStripeConfigured } from "@/lib/stripe";
// getStripe() constructs on first use (throws if STRIPE_SECRET_KEY is unset);
// callers gate on isStripeConfigured() first and degrade gracefully.
```
`apiVersion` is **pinned** to the exact string the installed `stripe` major (v22 →
`2026-05-27.dahlia`) is generated against, so wire shapes are deterministic and
the SDK's TS types match. Read it from `stripe/cjs/apiVersion.js` and bump in
lockstep with the SDK major.

**Flow:**
1. User clicks "Subscribe" → Server Action (`server/actions/billing.ts` →
   `createCheckoutSession`, auth-gated, returns `{ error } | { data: { url } }`)
   creates a Checkout Session → client redirects to `session.url`. On a **repeat
   checkout** the action reuses the user's recorded Stripe customer (P2-4a): it
   reads the latest-created `subscriptions` row and passes
   `customer: stripeCustomerId`; only a first checkout passes `customer_email`
   (the two are mutually exclusive on the API — without reuse, every checkout
   mints a duplicate Stripe customer). The Stripe call is try/caught → typed
   error, since a recorded customer deleted in the Dashboard makes `create` throw.
2. Stripe redirects back to `/billing/success?session_id=...` (UX cue only).
3. Stripe sends `checkout.session.completed` webhook → handler verifies the
   signature, then **upserts** the `subscriptions` row (Phase 3 · C4). The
   Server Action stamps `metadata.userId` on the session so the webhook can map
   the subscription back to a user (see the handler notes below).

**Billing portal (P2-4b):** `createBillingPortalSession` (same file, same shape —
session gate → 5/min per-user rate limit → config gate) resolves the latest
`subscriptions` row (**no row → typed "No billing history"**; the button only
renders with a row, but Server Actions are public endpoints and must self-gate)
and returns `billingPortal.sessions.create({ customer, return_url: /billing }).url`
for a client redirect. `/billing` renders the "Your subscription" card (status +
renewal date, a direct-table server read like /uploads) with the "Manage billing"
button only when a row exists. NOTE: the portal requires a **saved customer-portal
configuration** in the Stripe Dashboard — test mode ships a default; live mode
errors until one is saved (Settings → Billing → Customer portal).

The example action uses inline `price_data` (a $10/mo "Example Pro Plan") so it's
self-contained — no pre-created Stripe Dashboard Price is required to exercise it.
A minimal demo lives at `/billing` (+ `/billing/success`), public scaffold like
`/state`; delete it when a real billing surface lands.

**Webhook handler** (`api/stripe/webhook/route.ts`):
- `export const runtime = "nodejs"` — the sync `constructEvent` needs Node crypto.
- Read the **raw body** with `await req.text()` (never the parsed JSON — the
  signature is computed over the exact bytes) and the `stripe-signature` header.
- `getStripe().webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)` —
  throws on a bad/forged signature → respond `400`. Returns `503` when unconfigured.
- **DB persistence is implemented** (Phase 3 · C4) — it writes the `subscriptions`
  table via `@repo/db` (schema + rationale in [DATABASE.md](DATABASE.md)):
  - `checkout.session.completed` is the **row creator** — the only event carrying
    our `userId` (via the Checkout Session `metadata.userId`). It resolves the
    subscription/customer ids off the session, `subscriptions.retrieve(...)`s the
    subscription for status/price/period, and **upserts** (`onConflictDoUpdate` on
    the id PK, so a redelivered event is idempotent).
  - `customer.subscription.updated` / `deleted` **update by subscription id** only
    (no `userId` on these events) — a no-op when no checkout row exists.
  - `invoice.payment_failed` (P2-4c) syncs dunning state: the pinned API version
    has **no top-level `invoice.subscription`** — the ref lives at
    `invoice.parent.subscription_details.subscription` (absent for one-off /
    quote invoices → skipped). The handler `subscriptions.retrieve()`s it for the
    authoritative post-failure status (`past_due` / `canceled` / `unpaid` depends
    on the account's dunning settings — never hardcode) and updates by id.
    `customer.subscription.updated` also fires on the status *transition*, so this
    is belt-and-braces immediacy — and the canonical hook a real app extends with
    dunning email/notification logic.
  - `price` + `current_period_end` are read from `sub.items.data[0]` (the pinned
    API version moved them off the top-level subscription onto the item).
  - Stays behind the `503` gate, so an unconfigured build/run never reaches `@repo/db`.

**Account-deletion cleanup (A13):** deleting a user (the `/account` danger zone)
cascades the local `subscriptions` **row** away, but **Stripe keeps billing** unless
the subscription is canceled on Stripe's side — so the boilerplate cancels it via the
D7 job pattern (never blocks the deletion; keeps `@repo/auth` free of any Stripe
env/dep): `user.deleteUser.beforeDelete` (`packages/auth/src/auth.ts`) captures the
user's non-terminal `subscriptions` ids **while the rows still exist**, `afterDelete`
enqueues the `cancel-stripe-subscriptions` job **only once the account is gone**, and
the `@repo/jobs` worker (`handlers/cancel-stripe-subscriptions.ts`) cancels each via
its own env-gated Stripe client (graceful no-op + log when Stripe is unconfigured).
**Policy:** cancel **immediately** (the account is gone, so period-end access is
meaningless and a userless-but-active subscription is a reconciliation hazard) and
**keep the Stripe customer** (invoice/tax history survives). Both are one-line swaps —
`subscriptions.update(id, { cancel_at_period_end: true })` for period-end,
`customers.del(customerId)` to also delete the customer. See AUTH.md → Danger zone.

**Entitlement gating (A2) — reading the table back.** The webhook *writes* the
`subscriptions` table; `apps/web/src/lib/subscription.ts` *reads* it for access
control — the #1 thing a real SaaS fork does. `hasActiveSubscription(userId)`
looks up the user's newest row and applies the pure `isSubscriptionActive`
predicate — **`status ∈ {active, trialing}` AND (`currentPeriodEnd` null OR in the
future)**. It's a **local DB read, no Stripe call**, so gating works with Stripe
unconfigured (an unentitled user simply never has an entitling row). The
**`/premium`** demo route is the worked consumer — a public, self-gating server
page with three states (signed-out → sign-in · signed-in-unentitled → `/billing` ·
entitled → the premium content). Copy the one-line gate into any Server Component,
Server Action, or tRPC procedure. To exercise it without Stripe creds, insert a
fake `active` row for a test user (see [DATABASE.md](DATABASE.md) → Stripe
subscriptions → How it's read). Not to be confused with A13 (cancel-on-delete,
above) — separate concern.

**Key env vars** (all **optional** — the app builds/runs without Stripe, mirroring
the env-gated email/OAuth providers):
- `STRIPE_SECRET_KEY` — server-side only.
- `STRIPE_WEBHOOK_SECRET` — for verifying webhook signatures (printed by
  `stripe listen` for local dev).
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — client-safe; reserved (unused by the
  hosted-redirect flow). Must also be listed in `experimental__runtimeEnv` in
  `env.ts` because it's a `NEXT_PUBLIC_` var.

**Critical:** Always verify webhook signatures with `stripe.webhooks.constructEvent()`. Never trust unverified webhook payloads.

**Local webhook testing** (needs Stripe test keys):
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints whsec_… → STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed                       # fire a test event
```
Offline (no keys), the verification path can be exercised with
`Stripe.webhooks.generateTestHeaderString()` → `constructEvent()`.

**Remove it** (self-contained — nothing else depends on payments):
1. Delete (under `apps/web/src/`) `lib/stripe.ts`, `lib/subscription.ts`,
   `server/actions/billing.ts`, `app/api/stripe/webhook/route.ts`, and the
   `app/[locale]/billing/`, `app/[locale]/premium/`, `components/billing/` trees — plus
   their `*.test.ts(x)` siblings.
2. Drop the DB table: delete `packages/db/src/schema/subscriptions.ts`, remove its line from
   `schema/index.ts`, then `pnpm --filter @repo/db db:generate` a migration dropping `subscriptions`.
3. `pnpm --filter web remove stripe` **and** `pnpm --filter @repo/jobs remove stripe` (A13).
4. Remove from `.env.example` + `env.ts`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (drop both its `client` entry **and** its
   `experimental__runtimeEnv` line).
5. Trim the CSP in `next.config.ts`: drop `https://js.stripe.com` (`script-src`),
   `https://js.stripe.com https://hooks.stripe.com` (`frame-src`), `https://api.stripe.com`
   (`connect-src`).
6. Grep for links to `/billing` + `/premium` and remove them. Then unwire **A13** (cancel-on-delete):
   drop the subscription-capture block in `packages/auth/src/auth.ts` `deleteUser.beforeDelete`, the
   enqueue in `afterDelete`, and the `pendingStripeCancellations` Map; delete
   `packages/jobs/src/handlers/cancel-stripe-subscriptions.ts(.test.ts)`; remove its
   `JOBS.cancelStripeSubscriptions` entry + payload from `queues.ts` and its `boss.work`
   registration in `worker.ts` (step 3's `@repo/jobs` remove covers the dep).

---

## Resend (Email)

- Package: `@repo/email` (built in Step 9; wired into auth in Step 19) — **server-only**,
  raw `.tsx` (no build step), so it's listed in `apps/web/next.config.ts` `transpilePackages`.
- SDK: `resend` (the send client) + `@react-email/components` (template primitives) +
  `@react-email/render` (HTML render + the plain-text part; also `resend`'s peer).
- Exports: `.` → `getResend()` + `isEmailConfigured()` + the `send*` helpers
  (`import "server-only"`); `./templates/*` → templates.
- Import rule: `@repo/email` may import only from `@repo/validators` (see ARCHITECTURE.md).
  It is consumed by `@repo/auth` (the Better Auth callbacks) and app Server Actions.

**Structure:**
```text
packages/email/src/
  client.ts                   — import "server-only" + lazy getResend() (guarded singleton)
  send.tsx                    — isEmailConfigured() + sendVerificationEmail / sendPasswordResetEmail / sendWelcomeEmail / sendChangeEmailConfirmationEmail / sendNewEmailVerificationEmail / sendEmailChangedNoticeEmail / sendDeleteAccountVerificationEmail / sendOrganizationInvitationEmail
  index.ts                    — re-exports getResend + the send helpers + isEmailConfigured
  templates/welcome.tsx       — WelcomeEmail
  templates/verify-email.tsx  — VerifyEmail (sign-up email verification link)
  templates/reset-password.tsx— ResetPasswordEmail (password reset link)
  templates/change-email.tsx  — ChangeEmail (M6 hop-1: confirm-from-old-address link)
  templates/verify-new-email.tsx    — VerifyNewEmail (M7 hop-2: confirm-your-NEW-address link)
  templates/email-changed-notice.tsx— EmailChangedNotice (M7: out-of-band "your email was changed" alert to the OLD address; informational, no link)
  templates/delete-account.tsx— DeleteAccount (P2-2: confirm-account-deletion link; only sent when email is configured — see AUTH.md → Danger zone)
  templates/organization-invitation.tsx — OrganizationInvitation (org invite accept-link; degrades to the UI's copyable link when email is unset — see AUTH.md → Organizations)
```
(Each template has a named export for app use + a default export for the preview CLI.)

**Lazy client (`getResend()`):** `new Resend(undefined)` **throws** `"Missing API key"`
in resend v6, so the client must NOT be constructed at import time — otherwise any
module that imports `@repo/email` (notably `@repo/auth`, which sits in the
`/api/auth` route graph) would break `next build` with `RESEND_API_KEY` unset. It's
a **lazy guarded singleton** (same posture as `lib/stripe.ts`): constructed on first
use, and only ever reached after an `isEmailConfigured()` gate, so the no-creds build
and run stay graceful.

**Sending email** — prefer the send helpers (they own the env gate + graceful
degradation; the example Server Action `apps/web/src/server/actions/email.tsx` just
delegates to `sendWelcomeEmail`):
```typescript
import { sendWelcomeEmail } from "@repo/email";

// Never throws when unconfigured: returns { error } and (outside production) logs
// the action link for local dev. Returns { data: { id } } on a real send.
await sendWelcomeEmail({ to: user.email, name: user.name });
```
The same helpers back Better Auth's `sendVerificationEmail` / `sendResetPassword` /
`afterEmailVerification` / `user.changeEmail.sendChangeEmailConfirmation` callbacks —
see [AUTH.md](AUTH.md).

**Multipart (P1-3):** every send carries both parts — Resend renders the HTML from
`react`, and `send()` attaches a `text` part rendered from the same tree via
`@react-email/render`'s `{ plainText: true }` (deliverability/spam scoring +
text-only clients). Best-effort: if the plain-text render throws, the send proceeds
HTML-only with a logged warning. Preview the text output with the same export CLI:
add `--plainText` to the `email export` command below.

**Render tests (A5):** `src/templates.test.tsx` renders all 8 templates to both HTML
and plain-text — the same `@react-email/render` calls used above — asserting non-empty
output with the dynamic content (name, links); `src/send.test.tsx` locks the
unconfigured → `{ error }` degradation contract across every helper. Run with
`pnpm --filter @repo/email test` (coverage-gated in CI — see [TESTING.md](TESTING.md#coverage)).

**Dev preview** — interactive template preview in the browser (opt-in, not part of
`pnpm dev`; runs on :3001 to avoid the Next app on :3000):
```bash
pnpm --filter @repo/email preview   # → email dev --dir ./src/templates --port 3001
```
To render a template to static HTML (CI-friendly, no server):
`pnpm --filter @repo/email exec email export --dir ./src/templates --outDir <tmp> --pretty`.
The CLI's generated `.react-email/` working dir is gitignored.

**Key env vars** (both **optional** — the app builds/runs without them; a send fails
gracefully when absent, mirroring the env-gated OAuth providers):
- `RESEND_API_KEY` — read by the client in `@repo/email`; validated at the app boundary.
- `EMAIL_FROM` — verified sender address, bare or `Name <address>` (both shapes Resend
  accepts; format-validated in `env.ts`). E.g. `onboarding@resend.dev` for testing; a
  verified-domain address (e.g. `noreply@mail.yourdomain.com`) for real mail.

**Production sending domain & deliverability.** The shared `onboarding@resend.dev` sender
only delivers to the address your Resend account is registered under (any other recipient
403s — silently, since the auth callbacks discard the send error); a **verified domain**
lifts that so the app can mail arbitrary recipients. Prefer a dedicated **sending subdomain**
(e.g. `mail.yourdomain.com`) — it isolates transactional-sending reputation from your root
and lets you keep a strict DMARC on the root:

1. **Add the domain in Resend** (Domains → Add) and pick a region near your app. Resend
   generates three records to publish at your DNS provider:

   | Type | Host | Value | Purpose |
   | --- | --- | --- | --- |
   | MX | `send.mail.yourdomain.com` | `feedback-smtp.<region>.amazonses.com` (prio 10) | Return-Path / bounce routing |
   | TXT | `send.mail.yourdomain.com` | `v=spf1 include:amazonses.com ~all` | **SPF** — authorizes Resend's servers |
   | TXT | `resend._domainkey.mail.yourdomain.com` | `p=…` (Resend-generated key) | **DKIM** — signs each message |

2. **Add DMARC yourself** (Resend won't generate it): TXT at `_dmarc.mail.yourdomain.com` →
   `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; fo=1`. Start at `p=none` (monitor
   only, nothing gets blocked), then tighten to `quarantine`/`reject` once the aggregate
   reports at `rua` show SPF+DKIM aligning.
3. **Verify** in Resend, then set `EMAIL_FROM` to an address on the domain.

**DNS-provider gotcha (GoDaddy et al.):** the record **Name** field is *relative* — enter
`send.mail` / `resend._domainkey.mail` / `_dmarc.mail`, **not** the full hostname (the
provider appends the root; pasting the FQDN yields `…yourdomain.com.yourdomain.com` and
verification silently fails). On Cloudflare, set these **DNS-only** (unproxied) and paste the
DKIM TXT verbatim. **New-domain warmup:** the first sends to each *new* recipient are commonly
**greylisted** — deferred, then delivered on the ESP's retry a few minutes later — until the
domain builds reputation; expected, not a misconfiguration. A well-formed message with correct
SPF/DKIM/DMARC alignment lands in the **inbox**, not spam.

**Removing email is load-bearing — degrade or swap, don't delete.** `@repo/email` underpins
core auth flows (sign-up verification, password reset, email-change confirm, org invites), so
unlike the other integrations it isn't a clean rip-out. It already degrades gracefully:
1. **Just stop sending:** leave `RESEND_API_KEY`/`EMAIL_FROM` unset (the default) — sends become
   no-ops that log the action link in dev. For prod, also relax Better Auth's
   `requireEmailVerification` ([AUTH.md](AUTH.md)) or sign-up can't complete.
2. **Swap providers:** replace the `resend` client in `packages/email/src/client.ts` + `send.tsx`
   with your ESP, keeping the `send*` / `isEmailConfigured()` surface — then `@repo/auth` and every
   Server Action call site need no change.
3. **Fully remove `@repo/email`:** only after neutralizing every caller — the Better Auth email
   callbacks (`packages/auth/src/auth.ts`), `server/actions/email.tsx`, and the `welcome-email`
   job — and accepting that verification/reset/change flows stop working. Swapping the provider (2)
   is almost always the better move.

---

## Sentry (Error Tracking)

- SDK: `@sentry/nextjs` (v10). Pulls `@sentry/webpack-plugin` / `@sentry/bundler-plugin-core`
  for build-time source-map handling; that in turn pulls `@sentry/cli`, whose
  native binary is intentionally **not** built by default (see below).
- Captures unhandled errors and Next.js performance data once a DSN is set.

**Config layout** — this repo uses the **current Sentry + Next 16 instrumentation
pattern**, not the older bare `sentry.client.config.ts` trio. All files live under
`apps/web/src/`:
- `instrumentation-client.ts` — browser `Sentry.init`; exports
  `onRouterTransitionStart = Sentry.captureRouterTransitionStart` (App Router nav tracing).
- `sentry.server.config.ts` / `sentry.edge.config.ts` — `Sentry.init` per runtime.
- `instrumentation.ts` — `register()` dynamically imports the server/edge config by
  `process.env.NEXT_RUNTIME`; exports `onRequestError = Sentry.captureRequestError`
  (captures errors in RSCs / route handlers / Server Actions).
- `next.config.ts` — wrapped with `withSentryConfig(nextConfig, {...})`.

**Graceful when unconfigured:** every `Sentry.init` passes
`dsn: process.env.NEXT_PUBLIC_SENTRY_DSN` + `enabled: Boolean(dsn)`. With the DSN unset
the SDK is a no-op (it does **not** throw — so unlike `lib/stripe.ts`/`lib/posthog.ts`
no guarded singleton is needed). `withSentryConfig` passes `org`/`project`/`authToken`
only when present, so a no-creds build never attempts source-map upload and never needs
the `@sentry/cli` binary — the build succeeds without observability creds.

> **Turbopack note:** Next 16's `next build` uses Turbopack. The Sentry SDK's
> *runtime* instrumentation works regardless of bundler, and source-map **upload now
> works under Turbopack too** — supported and on by default since
> `@sentry/nextjs@10.13` and `next@15.4.1` (this repo: 10.59 / 16.2.9), via Next's
> `runAfterProductionCompile` hook, so **no webpack build is needed**. The boilerplate
> default uploads nothing (no
> token); to enable upload, set `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`)
> and flip `@sentry/cli` to `true` in `pnpm-workspace.yaml` `allowBuilds` (the binary
> that performs the upload). Also: `disableLogger` is deprecated/unsupported under
> Turbopack — omitted here on purpose.

**Key env vars** (all **optional** — the app builds/runs without Sentry):
- `NEXT_PUBLIC_SENTRY_DSN` — enables the SDK (client + server). Unset → no-op.
- `SENTRY_ORG`, `SENTRY_PROJECT` — source-map upload target (build/CI).
- `SENTRY_AUTH_TOKEN` — CI only, for source-map upload / releases. To actually
  upload, also flip `@sentry/cli` to `true` in `pnpm-workspace.yaml` `allowBuilds`
  (left `false` so installs stay network-light — see DEPLOYMENT.md).

**Remove it** (self-contained):
1. Delete (under `apps/web/src/`) `instrumentation-client.ts`, `instrumentation.ts` (Sentry is
   its only content), `sentry.server.config.ts`, `sentry.edge.config.ts`.
2. Unwrap `next.config.ts`: remove the `import { withSentryConfig }` line and `export default
   nextConfig` directly instead of `withSentryConfig(nextConfig, {…})`.
3. `pnpm --filter web remove @sentry/nextjs`; optionally drop the `@sentry/cli` entry from
   `pnpm-workspace.yaml` `allowBuilds`.
4. Remove from `.env.example` + `env.ts`: `NEXT_PUBLIC_SENTRY_DSN` (`client` entry +
   `experimental__runtimeEnv` line), `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
5. Trim the CSP `connect-src` in `next.config.ts`: drop `https://*.sentry.io`.

---

## BetterStack / Logtail (Logging)

- SDK: `@logtail/next` (BetterStack's Next.js logger; `withLogtail`/`log` are aliases
  of the rebranded `withBetterStack`/`log`).
- Usage: structured server-side logging via the `log` export. Used directly in
  server code (Server Actions / route handlers / RSCs) — no next.config wrapper is
  required for the scaffold (`withBetterStack` is available for automatic request +
  web-vitals logging as an opt-in).

```typescript
import { log } from "@logtail/next";
import { after } from "next/server";

log.info("User signed in", { userId: session.user.id });
log.error("Stripe webhook failed", { error: err.message });
// Flush via next/after (D4): runs AFTER the response is sent, so a short-lived/serverless
// runtime can't freeze before the batched logs ship — without blocking the response.
after(() => log.flush());
```

**Graceful when unconfigured:** with the source token + ingesting URL unset, `log`
**falls back to console** (it never throws), so the app runs identically without
BetterStack creds. Example scaffold: `apps/web/src/server/actions/observability.ts`
(`logExampleEvent`, returns the typed `{ error } | { data }` shape).

**Key env vars** (both **optional**; both needed to actually ship logs):
- `BETTER_STACK_SOURCE_TOKEN` — the source token. *(The SDK also reads the legacy
  `LOGTAIL_SOURCE_TOKEN`. Note: it is **not** `BETTERSTACK_API_KEY` — verified against
  the installed `@logtail/next@0.3.1` source.)*
- `BETTER_STACK_INGESTING_URL` — the per-source ingesting host from the BetterStack
  dashboard (legacy `LOGTAIL_URL`). The logger needs **both** token and URL set.

**Swap, don't delete — `log` is the app's logging façade.** `@logtail/next`'s `log` is imported
across the server layer (`server/trpc/trpc.ts`, every `server/actions/*`, the Uploadthing router)
and already **falls back to `console`** when the env is unset:
1. **Just stop shipping logs:** leave `BETTER_STACK_SOURCE_TOKEN`/`BETTER_STACK_INGESTING_URL`
   unset (the default) — `log` is console-only. Nothing to remove.
2. **Fully drop `@logtail/next`:** add a local `log` shim (e.g. `apps/web/src/lib/log.ts` wrapping
   `console` with the same `{ info, warn, error, flush }` shape), swap
   `import { log } from "@logtail/next"` → the shim across every file that uses it
   (grep `@logtail/next`), then `pnpm --filter web remove @logtail/next` and drop the two
   `BETTER_STACK_*` env vars.
3. The BetterStack **dashboards-as-code** package (`@repo/observability`) is a separate concern —
   see its removal note at the end of this doc.

---

## PostHog (Analytics + Feature Flags)

- SDKs: `posthog-js` (client), `posthog-node` (server).
- **Client provider:** `apps/web/src/components/observability/posthog-provider.tsx`
  (`"use client"`), mounted in the root layout. Guarded `posthog.init()` (only when
  `NEXT_PUBLIC_POSTHOG_KEY` is set) and renders `children` straight through, so it's a
  transparent passthrough when unconfigured and **does not widen the RSC boundary**
  (see [STATE.md](STATE.md)).
- **Server client:** `apps/web/src/lib/posthog.ts` (`import "server-only"`), a lazy
  guarded singleton (`getPostHogServer()` + `isPostHogConfigured()`) — **same posture
  as `lib/stripe.ts`/`lib/search.ts`**. Used for feature-flag evaluation and
  server-side capture. Feature flags are checked **server-side** to avoid client flicker.
- **User identification (P2-5):** `PostHogAuthSync`, a tiny watcher inside the
  provider's *configured* branch, subscribes to Better Auth's `useSession` and calls
  `posthog.identify(user.id, { email, name })` when a signed-in session appears with
  PostHog still on an anonymous id (merging the device's pre-login events into the
  person), and `posthog.reset()` on a sign-out **transition** (new anonymous id, so a
  shared device doesn't attribute the next visitor's events; reopening with an
  *expired* session deliberately does NOT reset — PostHog ties reset to explicit
  logout). It's a **session watcher, not per-form calls**: OAuth sign-in returns via a
  top-level redirect (no client success callback ever runs), and sessions also end
  outside the sign-out button (remote revoke, account deletion) — one component covers
  every path. The identify id equals the Better Auth user id, i.e. exactly the
  `distinctId` the server-side flag checks pass, so client + server land on one person
  profile. Decision logic is extracted to `lib/posthog-identity.ts` (unit-tested +
  coverage-gated, the `user-agent.ts` pattern); a direct user-A→user-B cookie swap
  resets before re-identifying so A's events never merge into B. When unconfigured
  the watcher never mounts — no `useSession` subscription, zero cost (the one cost
  when configured: a client get-session fetch per hard load).

- **Consent gating (B3 · Band 3):** the client SDK inits with
  `opt_out_capturing_by_default: true`, so **no events, pageviews, or `identify` fire
  until the user explicitly opts in** — GDPR-friendly by default. A `ConsentBanner`
  (`components/observability/consent-banner.tsx`), rendered only inside the provider's
  *configured* branch, asks once: **Accept** → `posthog.opt_in_capturing()`, **Decline**
  → `posthog.opt_out_capturing()`. posthog-js persists that single opt-in/out record (the
  consent decision itself — the one thing it may store pre-consent), so the banner shows
  once and the choice survives reloads. Withdrawing/changing it later lives on `/account`
  (the **Privacy & data** card, `components/account/privacy-card.tsx`). The tri-state
  decision logic (`granted`/`denied`/`unset`) is a pure, unit-tested `readConsent()`
  (`lib/consent.ts`); the shared reactive store + mutators are `useConsent()`
  (`components/observability/use-consent.ts`), woken by `notifyConsentChanged()` on each
  choice and once after `posthog.init` (posthog-js emits no consent/ready event). When
  unconfigured, none of this mounts — nothing to consent to.

```typescript
// Server-side feature flag (RSC) — degrade gracefully, never throw:
if (isPostHogConfigured()) {
  const on = await getPostHogServer().isFeatureEnabled("example-flag", distinctId);
}
```

**`/ingest` reverse proxy:** `next.config.ts` adds `rewrites()` (+ `skipTrailingSlashRedirect`)
that proxy `/ingest/*` → the PostHog ingestion host and `/ingest/static/*` → the
`-assets` host (both derived from `NEXT_PUBLIC_POSTHOG_HOST`). The client SDK uses
`api_host: "/ingest"` so analytics traffic is same-origin and dodges ad-blockers.

**Key env vars** (all **optional** — unset means the SDKs are inert):
- `NEXT_PUBLIC_POSTHOG_KEY` — project API key; `isPostHogConfigured()` gates on it.
- `NEXT_PUBLIC_POSTHOG_HOST` — region ingestion host: `https://us.i.posthog.com` (US)
  or `https://eu.i.posthog.com` (EU). Defaulted to US at use sites. The legacy
  `app.posthog.com` is deprecated for ingestion.

**Remove it** (self-contained):
1. Delete (under `apps/web/src/`) `lib/posthog.ts`, `lib/posthog-identity.ts` (+ `.test.ts`),
   `lib/consent.ts` (+ `.test.ts`), `components/observability/posthog-provider.tsx`,
   `components/observability/consent-banner.tsx`, `components/observability/use-consent.ts`.
   Then drop the analytics section from `components/account/privacy-card.tsx` (or delete the
   whole card if no data-export control remains) and its render in
   `app/[locale]/(dashboard)/account/page.tsx`.
2. Unmount the provider in `app/[locale]/layout.tsx` (the document shell): drop the
   `PostHogProvider` import + wrapper, keeping the other providers nested as they are.
3. Remove the `/ingest` proxy in `next.config.ts`: the `posthogHost`/`posthogAssetHost` consts,
   both `rewrites()` entries, and `skipTrailingSlashRedirect` (added only for the proxy).
4. `pnpm --filter web remove posthog-js posthog-node`.
5. Remove from `.env.example` + `env.ts`: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
   (`client` entries + `experimental__runtimeEnv` lines).
6. Trim the CSP `connect-src` in `next.config.ts`: drop `https://*.posthog.com`. Then grep for any
   `getPostHogServer()` / `isPostHogConfigured()` feature-flag call sites and remove them.

---

## Uploadthing (File Uploads)

- SDKs: `uploadthing` (server SDK + route handler) + `@uploadthing/react`
  (client helpers: `generateUploadButton`/`generateUploadDropzone`). Both are
  normal npm deps in `apps/web` (compiled — **not** in `transpilePackages`,
  unlike raw-`.tsx` `@repo/ui`/`@repo/email`).
- File router: `apps/web/src/lib/uploadthing.ts` (`import "server-only"`) —
  defines allowed file types/sizes and gates uploads behind a Better Auth session.
- Route handler: `apps/web/src/app/api/uploadthing/route.ts` —
  `createRouteHandler({ router })`, exports `{ GET, POST }`.
- Client helpers: `apps/web/src/lib/uploadthing-client.ts` — exports typed
  `UploadButton`/`UploadDropzone` via a **type-only** import of `OurFileRouter`,
  so the server-only router (and its auth/db imports) never reach the client bundle.

**File router (`lib/uploadthing.ts`):** two routes. `imageUploader`
(images, 4 MB, max 1 file): its `.middleware()` resolves the session with
`auth.api.getSession({ headers: req.headers })` and throws `UploadThingError`
when unauthenticated, then applies the same per-user `rateLimit` the write Server
Actions use (P2-3, 10/min — the thrown message surfaces in `onUploadError`); the
returned `{ userId }` is passed to `.onUploadComplete()`.
**`onUploadComplete` persists the file** (Phase 3 · D9) — it upserts `file.ufsUrl`
(plus `name`/`size`/`type`) against `metadata.userId` into the `uploads` table via
`@repo/db`, keyed by Uploadthing's storage `key` so a redelivered callback is
idempotent (the upload analog of the C4 Stripe webhook). Errors propagate so a
non-2xx makes Uploadthing retry. See [DATABASE.md](DATABASE.md) (`uploads`).

**`avatarUploader`** (Band-1 Tier-4 — the worked "real feature" wiring of this
integration): same auth+`rateLimit` gate but tighter (2 MB) and persisted to the
caller's own **`user.image`**, *not* the `uploads` table (an avatar is profile state
you replace, not a file you manage in the `/uploads` list). Its `onUploadComplete`
reads the previous `user.image`, points it at `file.ufsUrl`, then **best-effort
deletes the replaced file** (`avatarKeyFromUrl()` in `lib/avatar.ts` recovers the
storage `key` from the stored URL → `UTApi().deleteFiles`) so changing an avatar
never orphans storage. The companion **`removeUserAvatar` Server Action**
(`server/actions/avatar.ts`) nulls `user.image` + best-effort deletes the file, but
**fail-OPEN** (nulling the column is the user-visible effect and must always land) —
the deliberate inverse of `deleteUpload`'s fail-closed stance. Surfaced by
`components/account/avatar-card.tsx` on `/account` and rendered via the `@repo/ui`
`Avatar` primitive there **and** in the dashboard-header user menu (both fall back to
the user's initial). Like `imageUploader`, the write leg's `onUploadComplete` is
**dev-only on localhost** (VERIFICATION.md ⚠️); the render + `removeUserAvatar` paths
work on any build.

**Styling:** the prebuilt stylesheet is imported by every surface that mounts an
`UploadButton` (`import "@uploadthing/react/styles.css"` — the `/uploads` demo page and
the `avatar-card` client component), **not** via the `withUt` Tailwind plugin — `withUt`
targets a v3-style `tailwind.config.js`, and this repo is on Tailwind v4 (CSS-config).
The prebuilt CSS styles the `.ut-*` classes self-containedly without touching the v4
`@source` setup. (Skip the import and the button renders as bare unstyled text.)

**Demo:** a public scaffold route at `/uploads` (like `/billing`, `/state`)
renders an `<UploadButton endpoint="imageUploader">`. The upload is
auth-gated and needs `UPLOADTHING_TOKEN` to store files; without it the route
still mounts and uploads fail gracefully. Delete when a real upload surface lands.

**Read path + delete (P2-3 — completes the D9 loop):** signed-in visitors to
`/uploads` also get a **"Your uploads"** card — a direct `uploads`-table read in
the page (the P2-1 sessions-card pattern; thumbnails for `image/*`, newest first)
with per-row **Delete** via the `deleteUpload` Server Action
(`server/actions/uploads.ts`): session gate → per-user `rateLimit` (10/min) →
row-level ownership check → remote-first delete. **Fail-closed when configured**:
`UTApi.deleteFiles(key)` must succeed before the row is deleted, so a storage
failure surfaces as the typed error and nothing is orphaned at a still-served
`ufs.sh` URL; with the token unset the remote call is skipped and the row alone is
deleted (such rows are leftovers from a previously-configured run). The row is
removed optimistically client-side (`components/uploads/uploads-list.tsx`;
`router.refresh()` is background reconcile only). The `UTApi` client lives behind
`getUTApi()`/`isUploadthingConfigured()` in `lib/uploadthing-api.ts` (the
`getStripe()`/`getResend()` lazy pattern — `new UTApi()` resolves the token per
request, not at construction, verified in 7.7.4).

**Optimized remote images (A6):** the `/uploads` thumbnail (`uploads-list.tsx`) is
the worked **`next/image`** example — remote uploads render through the optimizer
(responsive `srcset` + modern formats) instead of a plain `<img>`. It works because
`next.config.ts` allows the Uploadthing served host in `images.remotePatterns`
(`{ protocol: "https", hostname: "*.ufs.sh", pathname: "/f/*" }` — files are served at
`https://<appId>.ufs.sh/f/<key>`). The browser only loads the same-origin
`/_next/image?url=…` proxy (`img-src 'self'`); Next fetches `ufs.sh` **server-side**, so
this needs **no CSP change** (see [SECURITY.md](SECURITY.md)). The thumbnail is a fixed
40 px square, so it uses explicit `width`/`height` (a variable-size gallery would use
`fill` + a sized container instead). Avatars stay on the `@repo/ui` `Avatar` primitive's
plain `<img>` — that framework-agnostic package must not depend on `next/image`, and
Radix's `AvatarImage` gives the load-error→initials fallback `next/image` doesn't.

**Key env var** (**optional** — the app builds/runs without it, mirroring the
env-gated Stripe/email/OAuth providers):
- `UPLOADTHING_TOKEN` — read automatically by `createRouteHandler` at request
  time (not at module load), so an unset token never breaks the build. Get it
  from the Uploadthing dashboard (app → API Keys).

**Local testing:** `GET /api/uploadthing` returns the route config without a
token (verifies the handler mounts); a real upload needs a token + a signed-in
session + a file, so it's exercised only when `UPLOADTHING_TOKEN` is set.

**Account deletion cleans up files (P2-2 caveat, closed by P2-3):** deleting a
user cascades the `uploads` **rows** away; the remote **files** are handled by the
`delete-uploads` background job (`@repo/jobs` — the D7 pattern, same reason the
welcome email is a job: never block an auth flow on an external service). Better
Auth's `user.deleteUser.beforeDelete` captures the account's storage keys while
the rows still exist; `afterDelete` enqueues only once the account is actually
gone; the worker calls `UTApi.deleteFiles(keys)` (idempotent — safe under
pg-boss's at-least-once retries). **Graceful when unconfigured:** with no
`UPLOADTHING_TOKEN` the handler completes with a "skipped — N file(s) left in
storage" log instead of retrying forever (nothing a retry could fix; in practice
files only exist if a previously-configured run wrote them). See AUTH.md → Danger
zone.

**Remove it** (self-contained — but note avatars ride on it):
1. Delete (under `apps/web/src/`) `lib/uploadthing.ts`, `lib/uploadthing-client.ts`,
   `lib/uploadthing-api.ts`, `app/api/uploadthing/route.ts`, `server/actions/uploads.ts`, the
   `app/[locale]/uploads/` route, and `components/uploads/` — plus `*.test.ts` siblings.
2. Drop the DB table: delete `packages/db/src/schema/uploads.ts`, remove its line from
   `schema/index.ts`, then `db:generate` a drop migration.
3. `pnpm --filter web remove uploadthing @uploadthing/react`.
4. Remove `UPLOADTHING_TOKEN` from `.env.example` + `env.ts`.
5. Trim `next.config.ts`: drop `https://*.uploadthing.com https://*.ingest.uploadthing.com` from
   the CSP `connect-src`, **and** the `images.remotePatterns` `*.ufs.sh` entry.
6. Unhook the cleanup job: remove the `delete-uploads` handler + queue entry in `@repo/jobs` and
   the `afterDelete` enqueue in `packages/auth/src/auth.ts`.
7. **Avatars ride on this integration** (`avatarUploader`): also remove `server/actions/avatar.ts`,
   `lib/avatar.ts`, `components/account/avatar-card.tsx` — or repoint avatars at another uploader.
   The `@repo/ui` `Avatar` primitive (initials fallback) stays regardless.

---

## Meilisearch (Search)

- SDK: `meilisearch` (JS client). The exported client class is **`Meilisearch`**
  (one capital — not the older `MeiliSearch` casing). The API-error class is
  `MeilisearchApiError` (its `cause?.code` carries the Meilisearch error code).
- Self-hosted locally via docker-compose (`getmeili/meilisearch`, port 7700).
- Server client: `apps/web/src/lib/search.ts` (`import "server-only"`). App-only
  and a thin config singleton, so it stays in the app rather than a `@repo/*`
  package — **same posture as `lib/stripe.ts`/`lib/uploadthing.ts`**, and it keeps
  the `meilisearch` dep out of `@repo/db` (which is pure Drizzle/Postgres). Promote
  to a package only if a second app needs it.

**Server client (`lib/search.ts`):** like `new Stripe("")` (and unlike the Resend
client, which only warns), `new Meilisearch({ host })` **validates the host and
throws** on an empty/invalid one — so it can't be constructed at import time
without breaking the "builds without creds" guarantee. It's a **lazy guarded
singleton**:
```typescript
import { getSearchClient, isSearchConfigured, POSTS_INDEX } from "@/lib/search";
// getSearchClient() constructs on first use (throws if MEILISEARCH_HOST is unset);
// callers gate on isSearchConfigured() first and degrade gracefully.
```
The index backs the real `posts` entity (Step 28): `POSTS_INDEX = "posts"`, and the
`PostDocument` interface (`{ id, title, content }`) is a projection of a `posts` row.

**Read/write split** (per [API.md](API.md)):
- **Searching is a READ → tRPC.** `searchRouter.search` (`publicProcedure`, input
  `{ query }`) in `server/trpc/routers/search.ts` returns
  `{ configured: boolean; hits: PostDocument[] }`. It degrades to empty hits —
  never a 500 — when search is unconfigured, and treats a not-yet-created index
  (`index_not_found`) as an expected empty state; any other engine error becomes a
  `TRPCError`.
- **Indexing is a write/side-effect → Server Action.** It lives with the entity's
  writes in `server/actions/post.ts`: `createPost` indexes the new row on write,
  `deletePost` removes its document, and `reindexPosts` bulk-rebuilds the index from
  the DB (auth-gated + rate-limited **3/min per user** — tighter than the 10/min on
  create/update because one call is a full-table scan + bulk index write). Each
  `await`s the enqueued task (`.addDocuments(...).waitTask()`) so an immediate search
  sees the change. Per-post indexing is **best-effort** — a search outage is logged
  but never fails the DB write; `reindexPosts` repairs the index later.

```typescript
// Indexing (server-side only): wait for the async task so results are queryable.
await getSearchClient().index<PostDocument>(POSTS_INDEX).addDocuments(docs).waitTask();
// Searching:
const { hits } = await getSearchClient().index<PostDocument>(POSTS_INDEX).search(query, { limit: 20 });
```

**This IS the "real app" pattern** (Step 28 replaced the old hardcoded
`EXAMPLE_DOCUMENTS` scaffold): the index is kept in sync from inside the same Server
Actions that create / delete the rows (see [DATABASE.md](DATABASE.md)). Because
`db:seed` is DB-only (`@repo/db` stays Meilisearch-free), seeded rows aren't searchable
until indexed — which is exactly what `reindexPosts` (the `/search` button) is for.

**Index settings as code (P2-7):** without a pin, an index is born from the first
`addDocuments` with **engine defaults** — `searchableAttributes: ["*"]` makes `id`
searchable (an id fragment matches documents) and the shape drifts with whatever
engine version first touched the volume. `POSTS_INDEX_SETTINGS` (`lib/search.ts`,
typed against the SDK's `Settings`) pins:
- `searchableAttributes: ["title", "content"]` — **order matters**: the
  `attributeRank` ranking rule scores title hits above content hits; `id` is
  deliberately excluded.
- `displayedAttributes: ["id", "title", "content"]` — the `/search` UI keys hits
  on `id`.
- `rankingRules` — pinned to the compose-pinned engine's defaults (v1.48.1:
  `words, typo, proximity, attributeRank, sort, wordPosition, exactness` — v1.48
  split the legacy `attribute` rule into `attributeRank` + `wordPosition`; the
  legacy name is still accepted but fresh indexes get the new ones).

`reindexPosts` applies the settings **unconditionally before** `addDocuments`
(`updateSettings(...).waitTask()`), so the documented repair path also repairs a
default-shaped index. **Settings-on-create (A8):** the write path also ensures the
settings on the **first** index-creating write, via a memoized
`ensurePostsIndexSettings()` (`lib/search.ts`) that `indexPost` awaits before
`addDocuments`. It runs `updateSettings(...).waitTask()` **once per process** and
caches the resolved promise, so only the first `createPost` into a fresh index pays
the roundtrip — every later write is effectively free — and an index born from a
single-doc write now gets the pinned shape instead of engine defaults. It's
**best-effort** (inside `indexPost`'s try/catch, like the `addDocuments` itself): a
settings outage is logged, never fails the DB write, and clears the memo so a later
write retries. `reindexPosts` keeps its own unconditional `updateSettings` — the
idempotent repair path for a drifted/stale index, not routed through the cache.
**Fork guidance:** to make
a new field searchable, extend `PostDocument`, add the field to
`POSTS_INDEX_SETTINGS`, and click Reindex (settings-only changes don't require
re-adding documents — Meilisearch rebuilds the index from stored documents).

**Demo:** a public scaffold route at `/search` (like `/uploads`, `/billing`,
`/state`) — a search box (the tRPC query) plus a "Reindex posts from
database" button (`reindexPosts`). Logged-out reindex shows "Unauthorized"; past the
3/min cap it shows "Too many requests…"; an unset env shows "not configured". Create
posts on `/posts` to index them on write. Delete when a real search surface lands.

**Who may reindex (P1-2 decision):** any signed-in user, rate-limited — the demo flow
after `db:seed` depends on the button, and the operation is an idempotent upsert
repair, so the abuse vector is cost (capped), not authority. A real app should
admin-gate it instead: swap the session check for `requireAdmin()` exactly as
`setUserRole` does (`server/actions/admin.ts`).

**Local engine** (`docker/docker-compose.yml`, service `meilisearch` →
`nwb-meilisearch`): runs with `MEILI_ENV=development` (keeps the search-preview UI
at `http://localhost:7700` and is lenient about key length) and a local-dev
`MEILI_MASTER_KEY` (overridable via a root-`.env` `MEILI_MASTER_KEY`; the default
is **not** a real secret). Health: `GET http://localhost:7700/health` → `available`.
In production use `MEILI_ENV=production` with a strong master key.

**Key env vars** (both **optional** — the app builds/runs without search, mirroring
the env-gated Stripe/email/Uploadthing/OAuth providers):
- `MEILISEARCH_HOST` — e.g. `http://localhost:7700`. `isSearchConfigured()` gates
  on this.
- `MEILISEARCH_API_KEY` — the instance master key; **must match** the compose
  service's `MEILI_MASTER_KEY` for local dev.

**Remove it** (self-contained; unhook index-on-write):
1. Delete (under `apps/web/src/`) `lib/search.ts`, the `app/[locale]/search/` route,
   `components/search/`, and `server/trpc/routers/search.ts`, then remove `searchRouter`
   from the tRPC root router.
2. Unhook indexing in `server/actions/post.ts`: remove the `indexPost`/de-index calls in
   `createPost`/`updatePost`/`deletePost`, plus the `reindexPosts` action and
   `ensurePostsIndexSettings`.
3. `pnpm --filter web remove meilisearch`.
4. Remove `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` from `.env.example` + `env.ts`.
5. Remove the local engine from `docker/docker-compose.yml` (+ the prod compose): the
   `meilisearch` service, the `meilisearch_data` volume, and the `MEILI_MASTER_KEY`.
6. No CSP entry (search is server-to-server) and no DB table to drop.

---

## Background jobs (`@repo/jobs` / pg-boss) — D7

Postgres-backed durable job queue. **No new infra service** — pg-boss reuses the
app's Postgres (the same `DATABASE_URL`); the only runtime cost is one extra
long-lived process (the worker). Library: `pg-boss` (exact-pinned — it publishes
very frequently; see [DECISIONS.md](DECISIONS.md)).

**Two halves, split by process:**
- **Producer (web app):** `enqueue(JOBS.x, payload)` from `@repo/jobs`. This is the
  only surface the app imports; it's a single INSERT into the `pgboss` schema. It's
  **graceful by design** — if `DATABASE_URL` is unset, the DB is down, or the schema
  can't be created, it logs and no-ops, so it NEVER breaks the request that triggered
  it. `enqueue.ts` carries the `server-only` guard, so pg-boss never reaches a client
  bundle.
- **Consumer (worker):** a standalone process — `pnpm --filter @repo/jobs start` (or
  the `worker` Docker service). It owns the `pgboss` schema + maintenance loop and
  runs the `boss.work()` handlers. **Optional:** if it's down, jobs harmlessly queue
  in `pgboss.job` until it's back. Nothing about running the app requires it.

**The example job — `welcome-email`:** `@repo/auth`'s `afterEmailVerification` used to
send the welcome email inline; it now `enqueue(JOBS.welcomeEmail, …)` and the worker's
handler calls `@repo/email`'s `sendWelcomeEmail` out-of-band. The handler completes the
job on success or an unconfigured-email no-op, and **throws on a real provider error so
pg-boss retries** (at-least-once delivery). To add a job: add its name + Zod payload to
`src/queues.ts`, a handler in `src/handlers/`, and register it in `src/worker.ts`.

**The recurring example — `cleanup-expired-verifications` (A3):** the two jobs above are
*event-driven* (the web app `enqueue`s them in response to something). This one is
**scheduled** — the worked example for cron/housekeeping. `worker.ts` calls
`boss.schedule(JOBS.cleanupExpiredVerifications, "0 3 * * *", {}, { tz: "UTC" })` on boot and
its handler deletes Better Auth `verification` rows past their `expiresAt` (dead email-verify /
password-reset tokens that would otherwise accumulate). pg-boss's cron scheduler runs only
because the worker is `supervise:true` (see `boss.ts`), and it **persists the schedule in the
`pgboss.schedule` table** — so re-registering on every boot is an idempotent upsert (keyed by
queue name) and the schedule survives restarts. Inspect it with `boss.getSchedules()` or
`SELECT * FROM pgboss.schedule;`, change it with another `schedule()` call, remove it with
`boss.unschedule(name)`. It's **at-least-once, not exactly-once**: a tick missed while the
worker is down runs late, and the delete is idempotent so a retry is safe. To fire it on demand
(no waiting for 03:00), `send` the queue directly: `boss.send(JOBS.cleanupExpiredVerifications,
{})` — the running worker picks it up.

**Run it / see it work (deterministic, no email needed):**
```bash
docker compose -f docker/docker-compose.yml up -d        # Postgres
pnpm --filter @repo/jobs start                           # worker (one shell)
pnpm --filter @repo/jobs enqueue:demo you@example.com    # enqueue (another shell)
# → the worker stdout logs the welcome-email outcome (a real send if RESEND_* is set,
#   else the "skipped — email not configured" line) — proving it crossed processes.
```

**Schema ownership:** pg-boss creates + migrates its OWN tables under the `pgboss`
schema on `boss.start()`. **Drizzle does not manage them** and there is no migration
conflict — see [DATABASE.md](DATABASE.md). **Env:** none new — it reuses `DATABASE_URL`
(plus whatever a given job needs, e.g. `RESEND_API_KEY`/`EMAIL_FROM` for the welcome
email). **Deploy:** run the worker as a second process — see [DEPLOYMENT.md](DEPLOYMENT.md).

**Liveness (optional):** the worker pings a BetterStack heartbeat on an interval when
`BETTER_STACK_HEARTBEAT_URL` is set (fire-and-forget; no-op + never disturbs jobs when
unset — `packages/jobs/src/heartbeat.ts`), so a crashed worker pages you instead of
silently letting jobs pile up. The heartbeat itself is defined as code in
`@repo/observability` (see below).

**Failed jobs, retries & where they land (A20).** A handler that **throws** signals failure;
pg-boss retries it per the queue's retry policy. These queues use the **defaults** (`worker.ts`
calls `boss.createQueue(queue)` with no options) — verified against `pg-boss@12.20.0`:
- `retryLimit: 2` → **3 attempts total** before a job is given up on. This is why the handlers
  throw **only on a real error**: `welcome-email` / `delete-uploads` return (complete) on the
  unconfigured no-op so nothing retries, and throw on a genuine provider failure so pg-boss does.
- `retryDelay: 0`, `retryBackoff: false` → retries fire immediately. For a flaky external call,
  pass `{ retryDelay: 60, retryBackoff: true }` to that queue's `boss.createQueue(...)`.
- `expireInSeconds: 900` → a handler still running after 15 min is killed and counts as a failed
  attempt.

**Lifecycle / where they land:** `created → active → completed` on success; a throw goes to
`retry` (attempts left) then **`failed`** (exhausted). Failed jobs are **not deleted** — they
stay in `pgboss.job` (rolling into `pgboss.archive` after the ~14-day retention), so a failure
is inspectable, never silent:
```sql
-- recent failures (the worker console shows handler errors live; this is the durable record)
SELECT name, state, retry_count, created_on, completed_on, output
FROM pgboss.job WHERE state = 'failed' ORDER BY created_on DESC LIMIT 50;
-- older ones roll into pgboss.archive (same columns)
```
`boss.getJobById(queue, id)` fetches one job's row/state programmatically.

**Requeue / dead-letter:** pg-boss does **not** auto-retry a job once it's `failed`. To
reprocess, either `enqueue(JOBS.x, payload)` a fresh job, or give the queue a **dead-letter
queue** so exhausted jobs route somewhere you watch — `boss.createQueue(queue, { deadLetter:
"failed-jobs" })` (create the `failed-jobs` queue too), then `boss.work("failed-jobs", …)` to
alert/inspect. Note the `boss.on("error", …)` handler and the BetterStack heartbeat cover the
**worker process** (crashes / maintenance failures), *not* individual failed jobs — a DLQ or a
periodic `state = 'failed'` query is what surfaces those.

**Remove it** (drop the package + unhook the producers):
1. Delete `packages/jobs/` and remove the `@repo/jobs` dependency from **both**
   `apps/web/package.json` and `packages/auth/package.json`.
2. Unhook the producers in `packages/auth/src/auth.ts`: the `enqueue(JOBS.welcomeEmail, …)` in
   `afterEmailVerification` (revert to an inline `sendWelcomeEmail`, or drop it) and the
   `enqueue(JOBS.deleteUploads, …)` in the `deleteUser.afterDelete` hook.
3. Remove the CI step `pnpm --filter @repo/jobs test:integration` from `.github/workflows/ci.yml`
   (e2e lane).
4. Remove the `worker` service (+ its heartbeat env) from `docker/docker-compose.prod.yml`.
5. Optionally `DROP SCHEMA pgboss CASCADE` in your database (pg-boss created it). No env vars to
   remove — it reused `DATABASE_URL`.
6. **Trade-off:** the welcome email + upload cleanup become **inline/synchronous** again — simpler,
   but you lose retries and the "never block an auth flow on an external service" decoupling. Keep
   the worker if either matters.

---

## Dashboards-as-code (`@repo/observability`) — BetterStack

The monitoring/alerting config that watches everything above — checked into the repo as
code instead of living only in a vendor UI. Target is **BetterStack** (it already carries
this repo's logs via `@logtail/next`); its Uptime API gives HTTP *monitors* + *heartbeats*.
**Dev/CI-only — never imported by the app**, so zero build/bundle/CSP cost.

**What's defined** (`packages/observability/src/config.ts`, typed + Zod-validated by
`schema.ts`):
- **`app-health` monitor** — HTTP check on `${SITE_URL ?? BETTER_AUTH_URL}/api/health`
  expecting `200`; the probe returns `503` when the DB is unreachable (see the health
  route), so "alert on not-200" is exactly right.
- **`jobs-worker` heartbeat** — the pg-boss worker pings it on an interval; BetterStack
  alerts if the pings stop (a dead worker otherwise just silently queues jobs).

**Apply it** (graceful — mirrors `enqueue()` / `getStripe()`):
```bash
pnpm --filter @repo/observability check   # Zod-validate config — no creds (runs in CI)
pnpm --filter @repo/observability sync    # upsert to BetterStack — needs BETTER_STACK_API_TOKEN
```
`sync` is an idempotent upsert (match by name → PATCH else POST), so re-running converges
rather than duplicating. With the token unset it logs and no-ops, so a clone/CI never needs
credentials; a real API error throws (non-zero exit) — a manual sync should fail loudly.

**Why a script, not Terraform:** it stays in the existing pnpm/tsx toolchain (no new
binary or state model), degrades gracefully when unconfigured, and is Windows-safe (see
[DECISIONS.md](DECISIONS.md)). Config is typed TS (not YAML), so there's **no parser
dependency**. Trivially deletable — `packages/observability/README.md` lists the four steps.

**Key env vars** (both **optional**, script/worker-only — never in the app's `env.ts`):
- `BETTER_STACK_API_TOKEN` — read by `sync` only (a BetterStack Uptime API token).
- `BETTER_STACK_HEARTBEAT_URL` — read by the **worker** only; copy it from the
  `jobs-worker` heartbeat BetterStack returns after the first `sync`. Unset → no ping.

**Remove it:** trivially deletable — `packages/observability/README.md` lists the four steps
(delete `packages/observability/`, remove the heartbeat block from `packages/jobs/src/worker.ts`,
drop the two env vars, remove the `pnpm --filter @repo/observability check` step from
`.github/workflows/ci.yml`). Nothing in the app imports it, so there's zero app/bundle/CSP cost to
carrying it and zero risk to removing it. (This removes only the dashboards-as-code; the app's
`@logtail/next` log shipping is the [BetterStack / Logtail](#betterstack--logtail-logging) section.)
