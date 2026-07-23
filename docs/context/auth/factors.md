# Auth factors & challenges

> When to load: 2FA/TOTP, passkeys/WebAuthn, CAPTCHA (Turnstile), magic-link sign-in, the email-OTP recipe.

## Two-factor authentication (2FA / TOTP) (Tier 4 · Band 2)

The Better Auth `twoFactor()` plugin adds authenticator-app 2FA — a TOTP factor plus
single-use backup codes. It's **enabled** (`twoFactor({ issuer: twoFactorIssuer() })`
in `packages/auth/src/auth.ts`; `twoFactorClient()` in `client.ts`) and needs no new
runtime dependency beyond `qrcode.react` for the enrollment QR. The plugin manages a
`two_factor` table + a `user.twoFactorEnabled` flag (schema hand-maintained in
`@repo/db` — see [DATABASE.md → Two-factor](../DATABASE.md#two-factor-auth-two_factor--better-auth-plugin-migration-0009)).
`issuer` (the label shown in the authenticator app) is derived from `BETTER_AUTH_URL`'s
hostname by `twoFactorIssuer()` (`config.ts`; `localhost` fallback) — a fork wanting a
brand name changes it there.

### Enroll = two stages, and it only turns on at the SECOND

Enrollment is deliberately two-step so an abandoned setup leaves the user **un-enrolled**
(no way to lock yourself out):

1. `enable({ password })` — password-gated. Returns `{ totpURI, backupCodes }` and writes
   a `two_factor` row with **`verified: false`**; `user.twoFactorEnabled` stays `false`.
   Nothing is enforced yet.
2. `verifyTotp({ code })` — the **first valid code** flips `user.twoFactorEnabled = true`
   and marks the row `verified: true`. *This* is the activation.

So a user who fetches the QR but never enters a code is exactly as before. `disable({ password })`
and `generateBackupCodes({ password })` (regenerate) are likewise password-gated, so a
stolen session cookie alone can't change 2FA state. All of this lives on the `/account`
page — `components/account/two-factor-card.tsx`, shown only to users who **have a password**
(OAuth-only accounts get a "set a password first" pointer, mirroring the password card —
see [account-page.md](account-page.md)).

### Sign-in challenge is handled INLINE (no global redirect)

When an account has 2FA on, `signIn.email` does **not** establish a session — it returns
`{ data: { twoFactorRedirect: true } }` and Better Auth sets a short-lived challenge
cookie. `twoFactorClient()` *can* turn that into a full-page redirect (`twoFactorPage` /
`onTwoFactorRedirect`), but we set **neither**: the login form (`components/auth/login-form.tsx`)
inspects the `twoFactorRedirect` flag itself and reveals a code step in-place (a small
`credentials → totp → backup` state machine, like the signup form). It then calls
`verifyTotp({ code, trustDevice })` — or `verifyBackupCode({ code, trustDevice })` via a
"use a backup code" fallback — and only navigates once the challenge is answered. A
**"Trust this device"** checkbox (unchecked by default) passes `trustDevice: true`, which
sets a 30-day signed cookie so this browser skips the challenge next time.

### The UI is inline, not a modal — by choice

Both the enrollment card and the sign-in challenge are **inline reveals**, not dialogs —
consistent with the other `/account` cards, and better suited to a multi-field,
QR-bearing flow. (A 2026-07 Dialog mis-diagnosis around this choice was disproven —
record: [docs/archive/PHASE_HISTORY.md](../../archive/PHASE_HISTORY.md).) The QR is an
inline `qrcode.react` SVG (no network request, no new CSP origin), with the secret also
shown as a copyable manual key. Backup codes are shown **once**, at enroll (and again on
regenerate), with a copy affordance — they're the only way back in if the authenticator
is lost. See [DECISIONS.md](../DECISIONS.md) → Two-factor.

Rate limits on the four `/two-factor/*` endpoints are in the canonical block
([core.md → Rate limiting](core.md#rate-limiting-auth-endpoints); enable/disable 3/min,
verify-totp/verify-backup-code 5/min).

## Passkeys / WebAuthn (Tier 4 · Band 3)

Passwordless sign-in with a **passkey** — a platform authenticator (Touch ID / Windows
Hello) or a roaming security key. Wired via Better Auth's `passkey()` plugin (its own
`@better-auth/passkey` package, exact-pinned in lockstep with core). Passkeys are
**additive**: they supplement password + OAuth rather than replacing them, so a user can
enroll one from `/account` without ever being locked out (removing a passkey can't strand
an account). WebAuthn is a **same-origin browser API** — no new CSP origin, and **no new
env var**.

**Relying-party config** (`packages/auth/src/config.ts` → `passkeyRelyingParty()`, passed to
`passkey()` in `auth.ts`) is derived entirely from `BETTER_AUTH_URL`, so it inherits the
"runs with env unset" contract (localhost fallback):
- `rpID` — the registrable domain (hostname, **no** port/scheme): `localhost` in dev. Passkeys
  are scoped to it, so it must be **stable across deploys** of the same app.
- `rpName` — the human title in the platform passkey UI (hostname; a fork wanting a brand
  name changes it here).
- `origin` — pinned to `BETTER_AUTH_URL` (trailing slash trimmed — the plugin rejects one). It
  must MATCH the origin the app is actually served from, so run the app at `BETTER_AUTH_URL`
  (this is why a `:3100` prod-verify overrides `BETTER_AUTH_URL`, and why the E2E harness — on
  `:3000` — matches by default).

**Storage** — the plugin's `passkey` table is **hand-maintained in `@repo/db`** (migration
`0012`) and registered in the `drizzleAdapter` schema (aliased `passkeyTable` to avoid clashing
with the plugin's model name); it holds the public key, credential id, counter, and
device/backup flags. This is the same auth-schema-ownership posture as the 2FA/org tables — see
[DECISIONS.md](../DECISIONS.md).

**Surfaces:**
- **`/account` → Passkeys card** (`components/account/passkeys-card.tsx`) — register (name
  optional), rename, remove. NOT password-gated (unlike the 2FA card): the session already
  authorizes adding one, and passkeys are additive so removal can't lock anyone out. The list is
  SSR-seeded from a direct `passkey`-table read and then owned in local state (each mutation
  patches it; `router.refresh()` is background reconcile only — never gate the UI on it, per
  [core.md → the `router.refresh()` race](core.md#the-next-1629-routerrefresh-race)). The card
  feature-detects `window.PublicKeyCredential` and shows a "not supported" note on browsers
  without WebAuthn.
- **`/login` → "Sign in with a passkey"** button (`components/auth/login-form.tsx`) — calls
  `authClient.signIn.passkey()` with **no email**: passkeys are discoverable/resident credentials,
  so the browser `get()` prompt lets the user pick one and Better Auth's `verify-authentication`
  establishes the session; we then navigate + refresh like the email path. A cancelled/timed-out
  prompt surfaces as error code `AUTH_CANCELLED` and is swallowed (a normal user action). v1 is an
  **explicit button**; conditional-UI/autofill is a one-line upgrade (`signIn.passkey({ autoFill:
  true })` on mount + `autocomplete="webauthn"` on the email field).

All mutations go through the Better Auth client (the auth-client convention —
[core.md → Auth UI](core.md#auth-ui-c1)). Rate limits on the six sensitive `/passkey/*`
endpoints (register/authenticate options + verify, delete, update) are in the canonical
block ([core.md → Rate limiting](core.md#rate-limiting-auth-endpoints); 10/min each — a
passkey assertion is cryptographic, so the caps are abuse-limiting, not brute-force defense).

**Verification** — the full lifecycle (register → rename → sign out → sign in with the passkey →
delete) is exercised headless in `e2e/passkey.spec.ts` using **Chrome's CDP virtual
authenticator** (`WebAuthn.addVirtualAuthenticator`, resident + auto-presence), so it needs no
real device and runs in CI. The credential lives on the browser context, so it survives sign-out
and answers the discoverable sign-in.

## Bot protection — CAPTCHA (Cloudflare Turnstile) (Tier 4 · Band 2)

The Better Auth `captcha()` plugin adds a **Cloudflare Turnstile** challenge to the
brute-force / bot-abuse surfaces — IP rate limits alone don't stop a *distributed* signup
or credential-stuffing bot. It's **opt-in and env-gated** like every integration: with the
env unset the plugin is not registered and the widget never renders, so the auth forms
behave exactly as before.

**What it protects.** The plugin's default endpoints — **`/sign-up/email`**,
**`/sign-in/email`**, **`/request-password-reset`** — plus **`/sign-in/magic-link`** when
the magic-link plugin is registered (see below). (The `/two-factor/*`, `/passkey/*` and
resend-verification endpoints are *not* captcha-gated; those already have their own tight
rate-limit rules.)

**The two halves + env.** Both vars are optional and unset by default:

| Var | Side | Role |
| --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | server | verifies the token against Cloudflare's siteverify. Read in `@repo/auth` via `process.env` (`captchaOptions()` in `config.ts`), never reaches the browser. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | client | the public widget key. The `(auth)` pages read it and pass it to the forms as `captchaSiteKey`. |

**Conditional registration is required, not tidy.** The plugin is spread into `auth.ts`
`plugins` only when `isCaptchaConfigured()` (secret present): `...(turnstileCaptcha ?
[captcha(turnstileCaptcha)] : [])`. If it were registered with an **empty** secret its
`onRequest` throws `MISSING_SECRET_KEY` (→ 500) on the protected endpoints, breaking
sign-up/sign-in for the default env-unset app. Its position — after every
`$Infer`-contributing plugin, before `nextCookies()` — follows
[core.md → Plugin tuple order](core.md#plugin-tuple-order-the-conditional-spread-gotcha).

**The token contract.** The client widget (`components/auth/captcha-widget.tsx`, a small
hand-rolled wrapper over Cloudflare's `api.js` — no new dependency) produces a token and the
form sends it in the **`x-captcha-response`** request header via the Better Auth call's
`fetchOptions.headers`. The server plugin reads that header and verifies it; a missing token
→ 400 *"Missing CAPTCHA response"*, a bad/failed token → 400 *"Captcha verification failed"*
(both surface inline through the forms' existing error rendering — no new copy, so the `en`/`es`
messages are untouched). The submit button stays disabled until the widget yields a token, and
the form calls the widget's `reset()` after a failed submit (Turnstile tokens are single-use).

**CSP.** `https://challenges.cloudflare.com` is allowlisted in **`script-src`** (the `api.js`)
and **`frame-src`** (the widget iframe) in `next.config.ts` — a static directive, harmless when
the widget is unused. WebAuthn-style same-origin doesn't apply here; the widget is a real
cross-origin embed. See [SECURITY.md](../SECURITY.md#content-security-policy).

**Local verification (no Cloudflare account).** Cloudflare publishes **dummy test keys** that
make the full flow verifiable end-to-end: site key `1x00000000000000000000AA` (always passes)
with secret `1x0000000000000000000000000000000AA` (always passes) → sign-up succeeds; swap the
secret to `2x0000000000000000000000000000000AA` (always fails) → the form shows *"Captcha
verification failed"*. Because `NEXT_PUBLIC_*` is baked at build time, a keyed local build sets
the site key at `next build`; the secret is a runtime var. A fork tightens further with the
plugin's `allowedHostnames` / `expectedAction` options (see `captchaOptions()`).

## Magic link sign-in (env-gated, path-to-100 #6)

Passwordless sign-in via a one-time emailed link — **wired 2026-07-16** (its `emailOTP()`
sibling stays a recipe below). The email-based sibling of passkeys, an alternative or
supplement to email+password.

- **Registration is env-gated on `isEmailConfigured()`** — the same gate as
  [email verification](core.md#email-verification): a sign-in link that can never be
  delivered must never be offered, so with email unset the `/sign-in/magic-link` +
  `/magic-link/verify` endpoints don't exist and the login page hides the affordance (the
  page resolves the same gate server-side and passes `magicLinkEnabled` to the form).
- **Tuple position:** the conditional spread sits with the `captcha()` spread — after every
  `$Infer`-contributing plugin, before `nextCookies()`
  ([core.md → Plugin tuple order](core.md#plugin-tuple-order-the-conditional-spread-gotcha)).
- **Send path:** `sendMagicLink` → `@repo/email`'s `sendMagicLinkEmail`
  (`templates/magic-link.tsx`). The template carries **no recipient name** — the address
  may not have an account yet.
- **Defaults kept:** 5-minute single-use tokens (consumed atomically), stored in the
  existing `verification` model — **no new table, no migration**. **Sign-up-via-link is ON**
  (the plugin default): an unknown address gets an account and the click inherently
  verifies it, and the response is uniform either way (no account enumeration). Set
  `disableSignUp: true` to keep account creation on the signup form only — but note the
  unknown-address response then diverges.
- **Rate limits:** `/sign-in/magic-link` 3/min, `/magic-link/verify` 10/min — rationale in
  the canonical block ([core.md → Rate limiting](core.md#rate-limiting-auth-endpoints)).
- **CAPTCHA parity:** when Turnstile is configured, `captchaOptions()` (config.ts) lists
  `/sign-in/magic-link` among the protected endpoints and the magic-link request form
  renders the same widget as the login form.
- **Client:** `magicLinkClient()` in `client.ts` → typed
  `authClient.signIn.magicLink({ email, callbackURL })`. Registered unconditionally
  (client plugins only add typed method surface); the UI affordance is what's gated.
- **UI:** the login form's "Email me a sign-in link" button swaps the card to an
  email-only request form (the `TwoFactorChallenge` whole-card-swap pattern) with a
  neutral "Check your inbox" sent state — the `ForgotPasswordForm` posture.
- **E2E:** `e2e/magic-link.spec.ts` runs in the `chromium-email` Playwright project
  against a second webServer whose fake Resend creds + `EMAIL_TEST_CAPTURE_DIR` divert
  sends to JSON files ([TESTING.md → Email capture](../TESTING.md#email-capture-the-magic-link-e2e-path-to-100-6));
  covers request → captured link → session (a sign-up-via-link journey) plus replay
  rejection. The hidden-when-unconfigured half is asserted in `auth.spec.ts` against the
  keyless main server.

## Email OTP (recipe)

The emailed-**code** variant (`emailOTP()`) is **docs-only** (not wired); it's a small
addition reusing the same `@repo/email` send path:

```typescript
import { emailOTP } from "better-auth/plugins";

emailOTP({
  // `type` is "sign-in" | "email-verification" | "forget-password".
  sendVerificationOTP: async ({ email, otp, type }) => {
    await sendLoginOtpEmail({ to: email, otp });
  },
}),
```

**Client** — add `emailOTPClient()` from `better-auth/client/plugins` to the `authClient`
factory, then `authClient.emailOtp.sendVerificationOtp(...)` + `authClient.signIn.emailOtp(...)`.

**Degradation posture** — follow the wired magic link exactly: gate registration on
`isEmailConfigured()` (conditional spread in the same tuple position), rate-limit the send
endpoint 3/min, keep the constant, no-enumeration UI response. Full option set: the Better
Auth docs (`/docs/plugins/email-otp`).
