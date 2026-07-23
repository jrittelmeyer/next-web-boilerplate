# Resend (Email)

> When to load: working on transactional email — templates, send helpers, deliverability/DNS, or bounce/complaint suppression. Shared client/degradation conventions: [../SERVICES.md](../SERVICES.md).

- Package: `@repo/email` — **server-only**,
  raw `.tsx` (no build step), so it's listed in `apps/web/next.config.ts` `transpilePackages`.
- SDK: `resend` (the send client) + `@react-email/components` (template primitives) +
  `@react-email/render` (HTML render + the plain-text part; also `resend`'s peer).
- Exports: `.` → `getResend()` + `isEmailConfigured()` + the `send*` helpers
  (`import "server-only"`) + the re-exported `WebhookEventPayload` type (so the
  webhook route never imports `resend` directly); `./templates/*` → templates.
- Import rule: `@repo/email` may import from `@repo/validators` and `@repo/db` (the
  suppression consult — see [../ARCHITECTURE.md](../ARCHITECTURE.md)). It is consumed
  by `@repo/auth` (the Better Auth callbacks) and app Server Actions.

**Structure** (`packages/email/src/` — the [source tree](../../../packages/email/src)
carries the per-file annotations): `client.ts` (`import "server-only"` + lazy
`getResend()` guarded singleton) · `send.tsx` (`isEmailConfigured()` + the nine
`send*` helpers — welcome, verify-email, reset-password, the change-email
confirm/verify-new/changed-notice trio, delete-account, org-invitation, magic-link —
plus the suppression consult, gated on `RESEND_WEBHOOK_SECRET`, and the TEST-ONLY
`EMAIL_TEST_CAPTURE_DIR` seam; see [../TESTING.md](../TESTING.md) → Email capture) ·
`templates/*.tsx` (one file per email; each has a named export for app use + a
default export for the preview CLI — which flow sends which is in
[../AUTH.md](../AUTH.md)).

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
see [../AUTH.md](../AUTH.md).

**Multipart:** every send carries both parts — Resend renders the HTML from
`react`, and `send()` attaches a `text` part rendered from the same tree via
`@react-email/render`'s `{ plainText: true }` (deliverability/spam scoring +
text-only clients). Best-effort: if the plain-text render throws, the send proceeds
HTML-only with a logged warning. Preview the text output with the same export CLI:
add `--plainText` to the `email export` command below.

**Render tests:** `src/templates.test.tsx` renders all 9 templates to both HTML
and plain-text — the same `@react-email/render` calls used above — asserting non-empty
output with the dynamic content (name, links); `src/send.test.tsx` locks the
unconfigured → `{ error }` degradation contract across every helper plus the
`EMAIL_TEST_CAPTURE_DIR` seam's write-instead-of-send contract. Run with
`pnpm --filter @repo/email test` (coverage-gated in CI — see [../TESTING.md](../TESTING.md#coverage)).

**Dev preview** — interactive template preview in the browser (opt-in, not part of
`pnpm dev`; runs on :3001 to avoid the Next app on :3000):
```bash
pnpm --filter @repo/email preview   # → email dev --dir ./src/templates --port 3001
```
To render a template to static HTML (CI-friendly, no server):
`pnpm --filter @repo/email exec email export --dir ./src/templates --outDir <tmp> --pretty`.
The CLI's generated `.react-email/` working dir is gitignored.

**Key env vars** (all **optional** — the app builds/runs without them; a send fails
gracefully when absent):
- `RESEND_API_KEY` — read by the client in `@repo/email`; validated at the app boundary.
- `EMAIL_FROM` — verified sender address, bare or `Name <address>` (both shapes Resend
  accepts; format-validated in `env.ts`). E.g. `onboarding@resend.dev` for testing; a
  verified-domain address (e.g. `noreply@mail.yourdomain.com`) for real mail.
- `RESEND_WEBHOOK_SECRET` — the svix signing secret (`whsec_…`) for
  `/api/resend/webhook`; also arms the send helper's suppression consult (next
  section). Unset → the route answers 503 and sends never query the list.

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

## Bounce & complaint handling (path-to-100 #8)

Once real mail flows, some addresses hard-bounce (mailbox gone) or mark you as spam —
and continuing to send to them torches the domain reputation the section above built.
Resend already suppresses repeat offenders **account-side**; this is the **app-side**
mirror, so our own send path stops attempting them and background jobs stop retrying.

**The chain:** Resend webhook → `POST /api/resend/webhook`
(`apps/web/src/app/api/resend/webhook/route.ts`, the Stripe webhook's twin) →
`email_suppressions` table (`@repo/db`, [../DATABASE.md](../DATABASE.md#email-suppressions-email_suppressions--do-not-send-list-migration-0016))
→ every `send*` helper consults `isEmailSuppressed()` before sending and returns
`{ error, suppressed: true }` for a listed address (a typed skip, not a provider
failure — the welcome-email job completes instead of retrying into the DLQ).

- **Route posture** (mirrors Stripe): rate-limit first (separate `resend-webhook:`
  ip/noip buckets) → 503 when email or `RESEND_WEBHOOK_SECRET` is unconfigured → 400
  on missing svix headers or a bad signature. Verification is
  `getResend().webhooks.verify({ payload, headers, webhookSecret })` over the **raw**
  body — sync, pure crypto (the SDK bundles `standardwebhooks`; svix scheme:
  HMAC-SHA256 over `` `${id}.${timestamp}.${rawBody}` ``), **zero new deps**.
- **What records what:** `email.bounced` → reason `bounce`, but **only**
  `bounce.type === "Permanent"` (case-insensitive) — transient bounces (full mailbox,
  greylisting) are log-only; `email.complained` → `complaint`;
  `email.suppressed` → `provider` (mirrors Resend's account-side list locally). Every
  address in the event's `to[]` is recorded; a failed write throws → 500 → Resend
  redelivers (at-least-once).
- **Send-side gate:** the consult runs only when `RESEND_WEBHOOK_SECRET` is set (unset
  — the default — means no events can arrive, so sends do **zero** extra DB queries and
  behave byte-identically to the consult-free path). It **fails open** with a logged
  warning if the
  lookup errors: a flaky DB must never block legitimate mail; Resend's account-side
  suppression is the backstop.

**Dashboard setup:** Resend dashboard → Webhooks → Add endpoint →
`https://yourdomain.com/api/resend/webhook`, subscribe to `email.bounced`,
`email.complained`, `email.suppressed` (others are ignored by the route), then copy
the endpoint's **signing secret** (`whsec_…`) into `RESEND_WEBHOOK_SECRET`. Test
against a genuine bounce with Resend's `bounced@resend.dev` test address.

**Un-suppressing an address** (a user fixed their mailbox / mis-clicked spam): delete
the row — `DELETE FROM email_suppressions WHERE email = '<address, lowercase>';` —
and, if the event also landed on Resend's account-side list, remove it in their
dashboard (Suppressions) too, or sends will keep bouncing at the provider (which the
`email.suppressed` webhook then re-records locally; that's the sync working as
intended).

**Local/dev proof without a public URL:** the webhook is verified end-to-end in CI by
`e2e/email-suppression.spec.ts` (a **self-signed** svix payload through the real
verification path — see [../TESTING.md](../TESTING.md#email-capture--the-magic-link-e2e-path-to-100-6)).
For a genuine-origin proof against live Resend, the localhost app needs a public
tunnel (cloudflared/ngrok) — the same one-time runbook as the Uploadthing prod
callback ([uploadthing.md](uploadthing.md)): point the Resend webhook
endpoint at `https://<tunnel-host>/api/resend/webhook`, send to
`bounced@resend.dev`, and watch the `email_suppressions` row appear. Optional
hardening, not a prerequisite — the signature check doesn't care what host it's
behind.

**Removing email is load-bearing — degrade or swap, don't delete.** `@repo/email` underpins
core auth flows (sign-up verification, password reset, email-change confirm, org invites), so
unlike the other integrations it isn't a clean rip-out. It already degrades gracefully:
1. **Just stop sending:** leave `RESEND_API_KEY`/`EMAIL_FROM` unset (the default) — sends become
   no-ops that log the action link in dev. For prod, also relax Better Auth's
   `requireEmailVerification` ([../AUTH.md](../AUTH.md)) or sign-up can't complete.
2. **Swap providers:** replace the `resend` client in `packages/email/src/client.ts` + `send.tsx`
   with your ESP, keeping the `send*` / `isEmailConfigured()` surface — then `@repo/auth` and every
   Server Action call site need no change.
3. **Fully remove `@repo/email`:** only after neutralizing every caller — the Better Auth email
   callbacks (`packages/auth/src/auth.ts`), `server/actions/email.tsx`, the `welcome-email`
   job, and the `/api/resend/webhook` route (+ its `email_suppressions` table) — and
   accepting that verification/reset/change flows stop working. Swapping the provider (2)
   is almost always the better move.
