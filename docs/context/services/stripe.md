# Stripe (Payments)

> When to load: working on payments/billing — Stripe Checkout, the webhook handler, the billing portal, per-org billing, entitlement gating, or subscription cancel-on-delete. Shared client/degradation conventions: [../SERVICES.md](../SERVICES.md).

- SDK: `stripe` (server). **No client SDK is installed** — the hosted Checkout
  flow redirects server-side to `session.url`, so `@stripe/stripe-js` /
  `@stripe/react-stripe-js` aren't needed. Add them only when you build a
  client-side Elements / embedded-checkout surface (the publishable key env var
  is already reserved for that).
- Pattern: Stripe Checkout (hosted page) — simplest, PCI-compliant by default.
- Server client: `apps/web/src/lib/stripe.ts` (`import "server-only"`). It's
  app-only (both consumers live in `apps/web`) and a thin config singleton, so it
  stays in the app rather than a `@repo/*` package — same posture
  [uploadthing.md](uploadthing.md) uses for `lib/uploadthing.ts`. Promote to a
  package only if a second app needs it.
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

**Flow (context-aware — personal or org):**
1. User clicks "Subscribe" → Server Action (`server/actions/billing.ts` →
   `createCheckoutSession`, auth-gated, returns `{ error } | { data: { url } }`)
   creates a Checkout Session → client redirects to `session.url`. Both billing
   actions first resolve the caller's **billing context**: the active org
   (authoritative reads via `lib/organization.ts` — cookie cache bypassed, fresh
   `member` role) or the personal workspace. **In an org context only owner/admin
   may proceed** — a plain member gets a typed error, checked BEFORE the Stripe
   config gate so the gate is exercisable keyless (same ordering posture as the
   rate limit). On a **repeat checkout** the action reuses the context's recorded
   Stripe customer: it reads the latest-created `subscriptions` row **for
   that owner** (org-keyed or user-keyed — each org gets its own Stripe customer)
   and passes `customer: stripeCustomerId`; only a first checkout passes
   `customer_email` (the two are mutually exclusive on the API — without reuse,
   every checkout mints a duplicate Stripe customer). The Stripe call is
   try/caught → typed error, since a recorded customer deleted in the Dashboard
   makes `create` throw.
2. Stripe redirects back to `/billing/success?session_id=...` (UX cue only).
3. Stripe sends `checkout.session.completed` webhook → handler verifies the
   signature, then **upserts** the `subscriptions` row. The
   Server Action stamps `metadata.userId` (+ `metadata.organizationId` in an org
   context) on the session so the webhook can map the subscription back to its
   owner (see the handler notes below).

**Billing portal:** `createBillingPortalSession` (same file, same shape —
session gate → 5/min per-user rate limit → org owner/admin gate → config gate)
resolves the context's latest `subscriptions` row (**no row → typed "No billing
history"**, worded per context; the button only renders with a row, but Server
Actions are public endpoints and must self-gate) and returns
`billingPortal.sessions.create({ customer, return_url: /billing }).url`
for a client redirect. `/billing` renders the subscription card (status +
renewal date, a direct-table server read like /uploads) with the "Manage billing"
button only when a row exists. NOTE: the portal requires a **saved customer-portal
configuration** in the Stripe Dashboard — test mode ships a default; live mode
errors until one is saved (Settings → Billing → Customer portal).

**Per-org billing.** With an active organization, `/billing` is
that org's surface — "Billing for {org}", the org's subscription card, and the
subscribe/manage controls rendered only for org owners/admins (members get
explanatory copy; the render-gate is UX, the actions re-check authority). A row is
owned by **exactly one** of user/org (XOR-checked; org rows carry NO `userId` —
the rationale and schema live in [../DATABASE.md](../DATABASE.md) → Stripe
subscriptions). Deleting an org triggers the same out-of-band Stripe cancellation
as account deletion (see Owner-deletion cleanup below). Keyless e2e:
`e2e/billing-org.spec.ts` (the context plumbing + gate ordering); the configured
flow is live-verified per [VERIFICATION.md](../../VERIFICATION.md) Phase 5.

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
- **DB persistence is implemented** — it writes the `subscriptions`
  table via `@repo/db` (schema + XOR-ownership rationale in
  [../DATABASE.md](../DATABASE.md) → Stripe subscriptions):
  - `checkout.session.completed` is the **row creator** — the only event carrying
    our owner mapping (the Checkout Session metadata): `metadata.organizationId`
    present → an org-owned row (`userId` null — the XOR ownership); absent →
    personal, owned by `metadata.userId`. It resolves the subscription/customer
    ids off the session, `subscriptions.retrieve(...)`s the subscription for
    status/price/period, and **upserts** (`onConflictDoUpdate` on the id PK, so a
    redelivered event is idempotent).
  - `customer.subscription.updated` / `deleted` **update by subscription id** only
    (no `userId` on these events) — a no-op when no checkout row exists.
  - `invoice.payment_failed` syncs dunning state: the pinned API version
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

**Owner-deletion cleanup:** deleting a user (the `/account`
danger zone) — or deleting an **organization** — cascades the local
`subscriptions` **rows** away, but **Stripe keeps billing** unless the subscription
is canceled on Stripe's side — so the boilerplate cancels it via a background job
([jobs.md](jobs.md) — never blocks the deletion; keeps `@repo/auth` free of any Stripe
env/dep): `user.deleteUser.beforeDelete` (`packages/auth/src/auth.ts`) captures the
user's non-terminal **personal** `subscriptions` ids **while the rows still exist**
(org rows carry no `userId`, so they're naturally out of reach), `afterDelete`
enqueues the `cancel-stripe-subscriptions` job **only once the account is gone**, and
the `@repo/jobs` worker (`handlers/cancel-stripe-subscriptions.ts`) cancels each via
its own env-gated Stripe client (graceful no-op + log when Stripe is unconfigured).
The org analogue rides the organization plugin's `organizationHooks`
(`beforeDeleteOrganization` captures the org's rows / `afterDeleteOrganization`
enqueues the same job with `organizationId` for the log line).
**Policy:** cancel **immediately** (the account is gone, so period-end access is
meaningless and a userless-but-active subscription is a reconciliation hazard) and
**keep the Stripe customer** (invoice/tax history survives). Both are one-line swaps —
`subscriptions.update(id, { cancel_at_period_end: true })` for period-end,
`customers.del(customerId)` to also delete the customer. See AUTH.md → Danger zone.

**Entitlement gating — reading the table back.** The webhook
*writes* the `subscriptions` table; `apps/web/src/lib/subscription.ts` *reads* it
for access control — the #1 thing a real SaaS fork does.
`hasActiveSubscription(userId)` / `hasOrgSubscription(organizationId)` look up the
owner's newest row and apply the pure `isSubscriptionActive` predicate (the exact
rule + read-path details live in [../DATABASE.md](../DATABASE.md) → Stripe
subscriptions → How it's read). Both are **local DB reads, no Stripe call**, so
gating works with Stripe
unconfigured (an unentitled owner simply never has an entitling row). The
**`/premium`** demo route is the worked consumer — a public, self-gating server
page with three states (signed-out → sign-in · signed-in-unentitled → `/billing` ·
entitled → the premium content) that follows the caller's **context**: active org
→ the org's subscription entitles **every member**; personal workspace → the
user's own. Copy the one-line gate into any Server Component,
Server Action, or tRPC procedure. To exercise it without Stripe creds, insert a
fake `active` row for a test user (see [../DATABASE.md](../DATABASE.md) → Stripe
subscriptions → How it's read). Not to be confused with the owner-deletion cleanup
(cancel-on-delete, above) — separate concern.

**Key env vars** (all **optional** — the app builds/runs without Stripe):
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
3. `pnpm --filter web remove stripe` **and** `pnpm --filter @repo/jobs remove stripe`.
4. Remove from `.env.example` + `env.ts`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (drop both its `client` entry **and** its
   `experimental__runtimeEnv` line).
5. Trim the CSP in `next.config.ts`: drop `https://js.stripe.com` (`script-src`),
   `https://js.stripe.com https://hooks.stripe.com` (`frame-src`), `https://api.stripe.com`
   (`connect-src`).
6. Grep for links to `/billing` + `/premium` and remove them. Then unwire the
   **cancel-on-delete cleanup** (both owners): drop the subscription-capture block in
   `packages/auth/src/auth.ts`
   `deleteUser.beforeDelete`, the enqueue in `afterDelete`, the `organizationHooks` block on the
   `organization()` plugin, and the `pendingStripeCancellations` +
   `pendingOrgStripeCancellations` Maps; delete
   `packages/jobs/src/handlers/cancel-stripe-subscriptions.ts(.test.ts)`; remove its
   `JOBS.cancelStripeSubscriptions` entry + payload from `queues.ts` and its `boss.work`
   registration in `worker.ts` (step 3's `@repo/jobs` remove covers the dep). Also delete
   `e2e/billing-org.spec.ts` and the org block in
   `packages/db/__tests__/integration/subscriptions.test.ts`.
