# Auth

> When to load: auth flows, session handling, protected routes, RBAC, middleware.

## Setup

- Library: Better Auth v1.6+
- Package: `@repo/auth` (`packages/auth/`)
- Storage: PostgreSQL via the Drizzle adapter (`better-auth/adapters/drizzle`)
- Strategy: session-based (cookie) with JWT option available via plugin
- Methods enabled: email/password (always on) + GitHub & Google OAuth (opt-in —
  each lights up only when its `*_CLIENT_ID`/`*_CLIENT_SECRET` pair is present)
- Hardening (Step 19): email verification + password reset (wired to `@repo/email`),
  `trustedOrigins`, a session cookie cache, and an explicit `rateLimit` — all detailed
  in [Auth hardening](#auth-hardening-step-19) below.

### Schema lives in `@repo/db`, not `@repo/auth`

The auth tables (`user`, `session`, `account`, `verification`) are defined in
`packages/db/src/schema/auth.ts` so that **all** schema + migrations stay
centralized in `@repo/db` (one migration history). `packages/auth` imports the
tables from `@repo/db` and passes them to `drizzleAdapter`.

The schema is **hand-maintained** to match Better Auth's core model (the
`@better-auth/cli` generator lags the core release, so we don't depend on it).
Correctness is guaranteed by the auth flow actually reading/writing these tables.

### Naming exception

Auth tables use Better Auth's defaults — **singular** table names (`user`, not
`users`) and **camelCase** Drizzle property keys (`emailVerified`, `userId`),
which Better Auth requires. This is a deliberate exception to the repo's
snake_case-plural table convention. SQL column names remain snake_case
(`email_verified`); Drizzle maps key → column, so Better Auth never sees them.

## Package Structure

```text
packages/auth/
  src/
    auth.ts           — Better Auth server instance + config
    config.ts         — pure env-driven config helpers (P3-3): socialProviders,
                        trustedOrigins, getEmailChangeFromToken, tokenFromRequest,
                        invitationAcceptUrl (orgs), twoFactorIssuer (2FA),
                        passkeyRelyingParty (passkeys), isCaptchaConfigured +
                        captchaOptions (CAPTCHA)
    config.test.ts    — hermetic unit tests for those helpers (see TESTING.md)
    client.ts         — Better Auth client (for use in Client Components)
    index.ts          — re-exports
  package.json
  tsconfig.json
  vitest.config.ts    — node env; coverage scoped to config.ts
```

## Auth Instance

Better Auth is initialized once in `packages/auth/src/auth.ts` and the handler is mounted in `apps/web/src/app/api/auth/[...all]/route.ts`.

## Session Access

**In Server Components / Server Actions / Route Handlers:**
```typescript
import { auth } from "@repo/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect("/login");
```

**In Client Components:**
```typescript
import { authClient } from "@repo/auth/client";

const { data: session } = authClient.useSession();
```

## Protected Routes (Proxy)

`apps/web/src/proxy.ts` does an **optimistic, cookie-only** gate. Next.js 16
renamed the `middleware` file convention to `proxy` (same Edge runtime, same
`config.matcher`; the exported function is `proxy`, not `middleware`).

- `/dashboard/*`, `/account/*`, `/admin/*`, `/organization/*` — redirect to `/login` if
  no session cookie is present (every page under the `(dashboard)` group, listed by its
  **real** path — the route group never appears in the URL, so each sibling must be in
  the matcher)
- `/login`, `/signup` — redirect to `/dashboard` if a session cookie is present

It only checks for the cookie's *presence* (no DB hit at the edge), so it is a
fast UX redirect — **not** authorization. Do the authoritative check in the
Server Component / Server Action / Route Handler via `auth.api.getSession`.
Route groups (`(dashboard)`, `(auth)`) don't appear in the URL, so the matcher
targets the real paths the pages render at.

## Auth UI (C1)

The `(auth)` route group ships the email/password screens a cloner needs; the
`(dashboard)` group is the protected shell behind them. Route groups are layout
boundaries only — they don't appear in the URL. (Since i18n, both groups live under
`app/[locale]/`; the `[locale]` segment is likewise invisible in the URL for the default
`en` locale, so the routes below are unchanged. See [I18N.md](I18N.md).)

- `app/[locale]/(auth)/login` → `/login` — sign in; honors a sanitized `?redirectTo` (set by the
  proxy when it bounces an unauthenticated user) so sign-in returns them where they were.
  `safeRedirectPath` (`lib/auth-redirect.ts`, unit-tested + coverage-gated) accepts only a
  same-origin absolute path — absolute URLs, protocol-relative `//`, and the backslash
  variant `/\` (WHATWG parsing normalizes `\` → `/`) all fall back to `/dashboard`.
- `app/[locale]/(auth)/signup` → `/signup` — sign up. `force-dynamic` so it reads the email env at
  request time: with email configured (verification required) it shows a "check your inbox"
  state; with email unset (the default) Better Auth creates a session and it redirects in.
  The check-your-inbox state carries a **"Resend verification email"** button (P2-6) — see
  Email verification below.
- `app/[locale]/(auth)/forgot-password` → `/forgot-password` — requests a reset link; always shows a
  neutral confirmation regardless of whether the address exists (no account enumeration).
- `app/[locale]/(auth)/reset-password` → `/reset-password` — consumes the `?token` from the emailed
  link; a missing/expired token renders a dead-end with a "request a new link" path.
- `app/[locale]/(dashboard)/layout.tsx` — the **authoritative** gate: resolves the real session and
  `redirect("/login")` if absent (the proxy is only an optimistic edge redirect). Renders the
  nav + `UserMenu` (sign-out). `/dashboard` is the thin landing shell.

Forms use React Hook Form + the shared `@repo/validators` schemas (`signInSchema`,
`signUpSchema`, `forgotPasswordSchema`, `resetPasswordSchema`) and call the Better Auth
**client** (`signIn.email` / `signUp.email` / `requestPasswordReset` / `resetPassword`),
which returns `{ data, error }` (it does not throw) — the forms surface `error.message`
inline. Auth is same-origin, so the UI adds **no new CSP origins**.

**OAuth social buttons (M1).** Beneath the email/password fields, the login + signup forms
render one social button per **configured** provider. `configuredOAuthProviders()`
(`lib/auth-providers.ts`, `server-only`) detects which providers have **both** their
`*_CLIENT_ID` / `*_CLIENT_SECRET` set — the same gate `socialProviders()` uses in `auth.ts`,
so UI and server stay in lockstep — and the login/signup **pages** (Server Components, which
can read `process.env`; the client can't) pass the resolved list down. `SocialSignIn`
(`components/auth/social-sign-in.tsx`) renders one
`authClient.signIn.social({ provider, callbackURL })` button each, so an unconfigured provider
shows **no button** (graceful degradation — no dead buttons), and the default email/password-only
clone is visually unchanged. `signIn.social` is a top-level navigation to the provider (same
class as the Stripe hosted-checkout redirect), so it adds **no new CSP origin**.

## Account page (M3)

`app/[locale]/(dashboard)/account` → `/account` is the **real** settings surface inside the protected
shell (it superseded the throwaway `/profile` demo). It inherits the `(dashboard)` layout's
authoritative gate and re-reads the session itself (`redirect("/login")` if absent). Reached
from the **Account** item in the header `UserMenu` dropdown. Three cards:

- **Profile** — the display name is editable via the existing `updateUserName` Server Action +
  `UpdateNameForm` (moved to `components/account/`; the action now `revalidatePath`es `/account`
  too). The sign-in **email is editable (M5 → M6)** via `ChangeEmailForm` (`components/account/`),
  which calls Better Auth's `authClient.changeEmail({ newEmail, callbackURL: "/account" })` — the
  same client convention as `ChangePasswordForm` (re-validated server-side; `{ data, error }`, no
  throw; no new CSP origin). The shared `changeEmailSchema` lives in `@repo/validators`. The flow
  is enabled by `user.changeEmail` in `auth.ts` and has **two branches**, decided by whether the
  **current** email is verified (the page knows this, so it branches the success copy on the
  `emailVerified` prop — Better Auth returns a neutral `{ status: true }` either way, and also for
  an already-registered address, so it never leaks email existence):
  - **Current email unverified** (e.g. email env unset → users are never verified):
    `updateEmailWithoutVerification: true` applies the change **immediately**; the form calls
    `router.refresh()` so the page shows the new address. This is what keeps the surface working
    with **email unconfigured**.
  - **Current email verified**: **two-hop (M6, the secure default).** `sendChangeEmailConfirmation`
    first emails the **current/old** address a confirmation link (a dedicated `ChangeEmail`
    template → `sendChangeEmailConfirmationEmail`) — **hop 1**. Approving it makes Better Auth mint
    a second token and email the **new** address its own verification link (**hop 2**); clicking
    *that* applies the change and marks the new address verified. So the change requires control of
    **both** addresses, and the success copy points the user at their **current** inbox, not the
    new one.
  - **Why two-hop (resolved M5 tradeoff).** Single-hop (M5) notified only the *new* address, so a
    hijacked session could move the account without ever alerting the *old* address. Requiring a
    confirmation click at the old address first closes that. It's **graceful for free**:
    `sendChangeEmailConfirmation` only fires for a *verified* current email, and a user can't reach
    `/account` verified unless email is configured — so with email unset the flow still takes the
    immediate `updateEmailWithoutVerification` path and two-hop never engages. The `/change-email`
    endpoint is rate-limited (`window: 60, max: 3`).
  - **Defense-in-depth on completion (M7).** `emailVerification.sendVerificationEmail` and
    `afterEmailVerification` each fire for **both** the sign-up verify and the hop-2 change-verify,
    so `auth.ts` tells them apart by base64url-decoding the verification token's `requestType`
    (`getEmailChangeFromToken` — the JWT is already Better-Auth-verified, so no signature check / no
    new dep). On a **change** token: (b) hop-2 uses the dedicated **`VerifyNewEmail`** template
    ("confirm your new address") instead of the generic sign-up `VerifyEmail`; (a) once the change
    completes, the **old** address gets an out-of-band **`EmailChangedNotice`** ("your email was
    changed", informational); and (c) the account's **other sessions are revoked**
    (`auth.api.revokeOtherSessions` keyed to the clicked request's session — the same posture
    `changePassword` takes). A change completion is **not** a first-time verify, so it deliberately
    **skips the Welcome email** (the welcome only fires on sign-up verify). All three degrade
    gracefully: the sends no-op when email is unset, the revoke is best-effort, and `allSettled`
    keeps any of them from failing the verification.
- **Password** — rendered **only when the user has an email/password credential**. The page
  reads the `account` table for a `providerId === "credential"` row; a **social-only** user (no
  password) instead gets a pointer to `/forgot-password` (which sets one). `ChangePasswordForm`
  (`components/account/`) follows the C1 client convention — it calls Better Auth's
  `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`
  (re-validated server-side; `{ data, error }`, no throw) rather than a Server Action, so it
  adds **no new CSP origin**. `revokeOtherSessions: true` signs out the account's other sessions
  on a successful rotation. The shared `changePasswordSchema` lives in `@repo/validators`.
- **Sessions (P2-1)** — an active-sessions list with per-session **Revoke**, a **"Sign out all
  other sessions"** button (only when others exist), and a "Current session" badge on the
  caller's own row (no revoke button there — signing yourself out is the `UserMenu`'s job).
  Rows show a device label (`describeUserAgent` in `lib/user-agent.ts` — a tiny in-repo
  substring mapper, **not** a UA-parser dep; full UA in the `title` tooltip), IP, signed-in
  and last-active times. Three deliberate mechanics:
  - **The list is a direct `session`-table read in the page** (`userId` + unexpired, newest
    activity first, current pinned) — deliberately **not** `auth.api.listSessions`, because that
    endpoint requires a *fresh* session (created within `session.freshAge`, default 24h) and
    403s for anyone signed in longer; the direct read keeps the card working without loosening
    `freshAge` globally (we own the auth schema, and the page already reads `account` directly
    for the password card). The **revokes stay on the Better Auth client** (`authClient.
    revokeSession({ token })` / `revokeOtherSessions()` — C1 convention): ownership-checked
    server-side and cookie-cache-proof (`sensitiveSessionMiddleware`). Tokens are the revocation
    credential, so the current row's token is nulled before crossing to the client; other rows'
    tokens must ship (the same shape `authClient.listSessions` itself returns).
  - **Optimistic removal (D1 convention):** on success the card filters the row(s) out of local
    state and fires `router.refresh()` only as background reconciliation. The UI must **not**
    gate on the refresh committing — a `router.refresh()` raced right after the fetch
    intermittently never commits (Next 16.2.9: RSC payload fully arrives, commit doesn't;
    reproduced against prod builds).
  - **Revocation takes effect within the cookie-cache window:** the revoked device's signed
    session-data cookie stays valid up to `cookieCache.maxAge` (5 min) for plain `getSession`
    reads, then its next DB-backed read finds no row, clears its cookies, and the protected
    shell re-gates (sensitive endpoints reject immediately — they bypass the cookie cache). The
    card copy says so honestly. Regression-guarded by `e2e/account-sessions.spec.ts`, which
    proves the revoked context's authoritative `get-session?disableCookieCache=true` is null and
    that it re-gates to `/login`.
- **Danger zone — account deletion (P2-2)** — `DeleteAccountCard` (`components/account/`) calls
  Better Auth's `authClient.deleteUser` (C1 convention; enabled by `user.deleteUser` in
  `auth.ts`, `/delete-user` rate-limited 3/min). Mirrors `changeEmail`'s graceful split, but the
  branch is **per-deployment**, decided at config time:
  - **Email configured** → `sendDeleteAccountVerification` is registered, and Better Auth then
    **always** takes the verification-gated path — even when a valid password is in the body
    (verified in the 1.6.20 source: the callback branch precedes the immediate-delete branch).
    `/delete-user` stores a one-time token (24h, `deleteTokenExpiresIn` default) and emails a
    confirmation link (`DeleteAccount` template → `sendDeleteAccountVerificationEmail`); nothing
    is deleted until it's opened. The link completes via `/delete-user/callback`, which requires
    an **active session in the clicking browser** (token must match that session's user) and then
    redirects to the `callbackURL` the card supplied (`/goodbye`).
  - **Email unset** → the callback is deliberately **not registered** (deletion must never
    require a link that can't be delivered), so `/delete-user` deletes **immediately**.
  - **Intent gates:** a user with a credential account must type their **password** — Better
    Auth verifies it *before anything else* (so in the email flow a hijacked session can't even
    trigger the confirmation email), and a supplied password also **skips the session-freshness
    gate**. An OAuth-only user types a confirm phrase instead (client-side only); server-side
    they ride the freshness gate — a session older than `session.freshAge` (24h default) gets
    `SESSION_EXPIRED`, which the card maps to "sign out and back in, then retry". The card
    branches its post-submit copy on the **response message** (`"User deleted"` vs
    `"Verification email sent"` — a typed enum in the endpoint contract), not on a prop, so the
    UI can't drift from what the server did.
  - **Post-delete:** the endpoint clears the session cookie and `internalAdapter.deleteUser`
    removes sessions + accounts + the user row (belt-and-braces over the DB cascades — every
    user-FK table cascades: `session`, `account`, `posts`, `uploads`, `subscriptions`, all
    FK-indexed since P1-1). The immediate flow then does a **full navigation** to `/goodbye`
    (`window.location.assign` — clears all client state; never gate on `router.refresh()`, see
    the Sessions bullet). `afterDelete` emits `console.info("[auth] account.deleted", { userId })`
    — the P1-7 audit posture, IDs only.
  - **External-resource cleanup:** **Uploadthing files are cleaned up (P2-3)** — `beforeDelete`
    captures the account's storage keys while the `uploads` rows still exist, `afterDelete`
    enqueues the `delete-uploads` job only once the account is actually gone (a deletion that
    fails between the hooks must not purge a live account's files), and the `@repo/jobs` worker
    calls `UTApi.deleteFiles` out-of-band (graceful no-op when Uploadthing is unconfigured).
    **Stripe subscriptions are canceled the same way (A13)** — `beforeDelete` captures the user's
    non-terminal subscription ids before the `subscriptions` row cascades away, `afterDelete`
    enqueues the `cancel-stripe-subscriptions` job, and the worker cancels each via its own
    env-gated Stripe client (immediate cancel; Stripe customer kept). Both spelled out in
    SERVICES.md.
  - Regression-guarded by `e2e/account-deletion.spec.ts` (immediate flow: wrong password gates,
    right password deletes → `/goodbye`, authoritative `get-session` null, sign-in with the
    deleted credentials fails). The verification-gated flow needs a delivered email → live-verified
    instead.
- **Data export — GDPR access right (B3 · Band 3)** — the counterpart to deletion's *erasure*
  right: the `exportMyData()` Server Action (`server/actions/data-export.ts`) gathers every row
  the caller owns across the schema (profile · accounts · sessions · posts + revisions · uploads ·
  subscriptions · 2FA · passkeys · org memberships + sent invitations · audit events) and returns a
  redacted JSON bundle the client downloads (the **Download my data** button on the `/account`
  Privacy card). All shaping + **redaction** live in a pure, 100%-tested `buildDataExport()`
  (`lib/data-export.ts`) — the action is just the DB shell. Redaction is an **allowlist** (each
  section maps only explicit fields), so secrets can't leak by omission and a future sensitive
  column is excluded by default; the dropped fields are `account.password`/`accessToken`/
  `refreshToken`/`idToken`, `session.token`, `twoFactor.secret`/`backupCodes`, and
  `passkey.publicKey`/`credentialID`. Auth-gated + per-user rate-limited (5/60s via `lib/rate-limit`,
  since a full-account read is heavier and a mild scraping vector, though it only ever returns the
  caller's OWN data). Regression-guarded by `e2e/data-export.spec.ts` (a fresh sign-up → download →
  the real credential account's password hash + the live session token are absent).

## Available Auth Plugins

Better Auth has a plugin system. Common ones already configured or easy to add:
- `haveIBeenPwned()` — **enabled** (rejects known-breached passwords; see
  [Compromised-password check](#compromised-password-check-hibp) under Auth hardening)
- `organization()` — **enabled** (multi-tenancy: teams + per-org roles; see
  [Organizations / multi-tenancy](#organizations--multi-tenancy) below)
- `twoFactor()` — **enabled** (TOTP authenticator + single-use backup codes; see
  [Two-factor authentication](#two-factor-authentication-2fa--totp-tier-4--band-2) below)
- `passkey()` — **enabled** (WebAuthn passkeys: platform biometrics / roaming security keys,
  additive to password + OAuth; see [Passkeys / WebAuthn](#passkeys--webauthn-tier-4--band-3) below)
- `admin()` — **enabled** (adopted to *augment* the hand-rolled [RBAC](#rbac-step-21):
  user **ban** + **impersonation**; the platform role model stays the authoritative gate —
  see [Admin plugin — ban & impersonation](#admin-plugin--ban--impersonation-tier-4--band-4) below)
- `captcha()` — **enabled when configured** (Cloudflare Turnstile bot-protection on
  sign-up / sign-in / password-reset / magic-link send; registered only when `TURNSTILE_SECRET_KEY`
  is set — see [Bot protection — CAPTCHA](#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2) below)
- `magicLink()` — **enabled when configured** (passwordless emailed sign-in link; registered
  only when email is configured — see [Magic link](#magic-link-sign-in-env-gated-path-to-100-6) below)

### Magic link sign-in (env-gated, path-to-100 #6)

Passwordless sign-in via a one-time emailed link — **wired 2026-07-16** (promoting the A18
recipe; its `emailOTP()` sibling stays a recipe below). The email-based sibling of passkeys,
an alternative or supplement to email+password.

- **Registration is env-gated on `isEmailConfigured()`** — the same gate as
  [`requireEmailVerification`](#email-verification): a sign-in link that can never be
  delivered must never be offered, so with email unset the `/sign-in/magic-link` +
  `/magic-link/verify` endpoints don't exist and the login page hides the affordance (the
  page resolves the same gate server-side and passes `magicLinkEnabled` to the form).
- **Tuple position:** the conditional spread sits with the `captcha()` spread — after every
  `$Infer`-contributing plugin, before `nextCookies()`. Neither conditional plugin
  contributes `$Infer` augmentations, so only their position relative to the plugins
  *above* them matters (see the plugins-array comment in `auth.ts`).
- **Send path:** `sendMagicLink` → `@repo/email`'s `sendMagicLinkEmail`
  (`templates/magic-link.tsx`). The template carries **no recipient name** — the address
  may not have an account yet.
- **Defaults kept:** 5-minute single-use tokens (consumed atomically), stored in the
  existing `verification` model — **no new table, no migration**. **Sign-up-via-link is ON**
  (the plugin default): an unknown address gets an account and the click inherently
  verifies it, and the response is uniform either way (no account enumeration). Set
  `disableSignUp: true` to keep account creation on the signup form only — but note the
  unknown-address response then diverges.
- **Rate limits** (`rateLimit.customRules`): `/sign-in/magic-link` 3/min — an
  unauthenticated, email-keyed trigger, the `/request-password-reset` posture (this
  customRule overrides the plugin's own 5/min default); `/magic-link/verify` 10/min
  (abuse-limiting only — the token is single-use, not brute-forceable).
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
  sends to JSON files ([TESTING.md → Email capture](TESTING.md#email-capture-the-magic-link-e2e-path-to-100-6));
  covers request → captured link → session (a sign-up-via-link journey) plus replay
  rejection. The hidden-when-unconfigured half is asserted in `auth.spec.ts` against the
  keyless main server.

### Email OTP (recipe)

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

## Auth hardening (Step 19)

All of the following are configured in `packages/auth/src/auth.ts`. The guiding
constraint is the repo-wide one: **the app builds and runs with email env unset**
(graceful degradation), so every email-dependent feature degrades to a no-op rather
than throwing or locking users out.

### Email verification

`emailVerification.sendVerificationEmail` renders `@repo/email`'s `VerifyEmail`
template and sends it via Resend. `sendOnSignUp: true` fires it on sign-up;
`autoSignInAfterVerification: true` creates the session the moment the user verifies.

The gate that keeps this graceful is on `emailAndPassword`:

```typescript
// Require a verified email before sign-in ONLY when email can actually be sent.
requireEmailVerification: isEmailConfigured(),  // from @repo/email
```

- **Email unconfigured (no `RESEND_API_KEY`/`EMAIL_FROM`):** verification is **not
  required**, so sign-up/sign-in work normally. The `sendVerificationEmail` callback
  still fires but the helper no-ops (outside production it logs the link for local
  dev; in production it logs a skip notice **without** the token).
- **Email configured:** verification **is** required — unverified users can't sign in
  until they click the link.

**Resend affordance (P2-6).** The signup form's check-your-inbox state has a resend
button calling `authClient.sendVerificationEmail({ email, callbackURL })`. The endpoint
(`POST /send-verification-email`) is **email-keyed, not session-bound** — essential here,
since with verification required the user in this state *cannot* have a session. The
sessionless path only sends when the address exists and is unverified, behind a
constant-time floor (no account enumeration), and the endpoint is rate-limited 3/min
(`auth.ts` customRules) — over-limit surfaces as the form's inline error. Both
`signUp.email` and the resend pass `callbackURL: redirectTo` (the page's sanitized
`?redirectTo`, default `/dashboard`), so every emailed link lands the newly-verified —
and, via `autoSignInAfterVerification`, newly signed-in — user on the post-login target
instead of Better Auth's default `/`. The login form's "email not verified" sign-in error
deliberately gets **no** sibling resend affordance (documented non-goal); a fork can add
one with the same email-keyed call.

### Password reset

`emailAndPassword.sendResetPassword` renders `@repo/email`'s `ResetPasswordEmail`.
The flow (the C1 `/forgot-password` + `/reset-password` pages drive this via the auth
client; the underlying HTTP API is):

1. `POST /api/auth/request-password-reset` `{ email, redirectTo }` → Better Auth
   generates a token (stored in the `verification` table) and calls the callback.
   `redirectTo` must be a **trusted origin** (a relative path like `/reset`, or an
   absolute URL whose origin is in `trustedOrigins`) — otherwise `403
   INVALID_REDIRECT_URL`.
2. `POST /api/auth/reset-password` `{ token, newPassword }` → sets the new password.
3. The old password no longer authenticates; the new one does.

In Client Components use `authClient.requestPasswordReset` / `authClient.resetPassword`.

### Compromised-password check (HIBP)

`haveIBeenPwned()` — a built-in Better Auth plugin (no new dependency), the first entry
in the `packages/auth/src/auth.ts` `plugins` array (order matters there — see the CAPTCHA
section's conditional-spread note; `nextCookies()` stays last) — rejects
known-breached passwords on the password-setting paths: `/sign-up/email`,
`/change-password`, and `/reset-password` by default. It SHA-1-hashes the candidate and
sends only the **first five hex chars** to the [Pwned Passwords](https://haveibeenpwned.com/Passwords)
range API (k-anonymity), so the password itself never leaves the server and **no API
key/secret is required**. A hit returns `400` with code `PASSWORD_COMPROMISED` and the
message _"The password you entered has been compromised. Please choose a different
password."_, which the sign-up / reset / change-password forms surface inline.

Unlike the env-gated integrations it is **always on** — there's nothing to configure, and
silently skipping the check would defeat it. Two consequences to know:

- **Fails closed.** If `api.pwnedpasswords.com` is unreachable the password op errors
  (_"Failed to check password. Please try again later."_) rather than accepting an
  unchecked password — the secure posture, but it means **offline/air-gapped runtime
  can't set passwords**. `build`/`lint`/`type-check` never call HIBP, so the repo-wide
  "runs with env unset" gate is unaffected; only live password ops need outbound network.
- **Test fixtures must be non-breached.** Every signup/change-password fixture now passes
  through HIBP; the E2E fixtures (`e2e-password-12345`, `e2e-new-password-67890`) were
  confirmed absent from the corpus (`api.pwnedpasswords.com/range/<prefix>`). Use unique
  strings for new fixtures.

### Welcome email (closes the Step-9 thread)

`emailVerification.afterEmailVerification` enqueues `WelcomeEmail` (D7 background job)
after a user verifies — the "real flow" that finally wires Step 9's template. It fires
only on the **sign-up** verify event: OAuth sign-ups (email already verified, no
verification step) don't trigger it, and an **email-change** completion is detected via
the token and **skips** the welcome (M7 — see the Account page above); apps that want
welcome-on-signup or OAuth coverage can instead send from `databaseHooks.user.create.after`.

### `trustedOrigins`

Origins Better Auth accepts for CSRF / redirect validation. `trustedOrigins()` always
trusts `BETTER_AUTH_URL` and adds any comma-separated `AUTH_TRUSTED_ORIGINS` (a
separate frontend domain, preview deploys, mobile deep links). Read from `process.env`
directly (packages can't import the app's `env.ts`). This is **not** a CSP concern —
it gates request origins, not browser content sources, so `SECURITY.md`/CSP is
unaffected (auth is same-origin).

### Session cookie cache

```typescript
session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }
```

Caches the session in a short-lived signed cookie so `auth.api.getSession` skips a DB
round-trip on most requests. **Trade-off:** a read can be up to `maxAge` (5 min) stale.
When you need an authoritative read right after a change (e.g. a role/permission
update), bypass the cache: `getSession({ query: { disableCookieCache: true } })`.

### Rate limiting (auth endpoints)

Better Auth's built-in limiter, made **explicit and on in every environment** (its
default is in-memory + production-only) and **backed by the app Postgres** so the
counters survive horizontal scaling (see [Multi-instance storage](#multi-instance-storage) below):

```typescript
rateLimit: {
  enabled: true, storage: "database", window: 60, max: 100,
  customRules: {
    "/sign-in/email":                 { window: 60, max: 5 },
    "/sign-up/email":                 { window: 60, max: 5 },
    "/request-password-reset":        { window: 60, max: 3 },
    "/reset-password":                { window: 60, max: 5 },
    "/send-verification-email":       { window: 60, max: 3 },
    "/change-email":                  { window: 60, max: 3 },  // M5
    "/delete-user":                   { window: 60, max: 3 },  // P2-2
    "/two-factor/enable":             { window: 60, max: 3 },  // 2FA — password-gated
    "/two-factor/disable":            { window: 60, max: 3 },  // 2FA — password-gated
    "/two-factor/verify-totp":        { window: 60, max: 5 },  // 2FA — brute-force cap
    "/two-factor/verify-backup-code": { window: 60, max: 5 },  // 2FA — brute-force cap
    "/passkey/generate-register-options":     { window: 60, max: 10 },  // Passkeys (B3)
    "/passkey/verify-registration":           { window: 60, max: 10 },  // Passkeys (B3)
    "/passkey/generate-authenticate-options": { window: 60, max: 10 },  // Passkeys (B3)
    "/passkey/verify-authentication":         { window: 60, max: 10 },  // Passkeys (B3)
    "/passkey/delete-passkey":                { window: 60, max: 10 },  // Passkeys (B3)
    "/passkey/update-passkey":                { window: 60, max: 10 },  // Passkeys (B3)
  },
}
```

Past the limit the endpoint returns **HTTP 429** with Better Auth's `X-Retry-After`
header (the app's IETF `RateLimit-*`/`Retry-After` headers are on the *app-level*
limiter — tRPC / Server Actions / webhook, [SECURITY.md](SECURITY.md) → Rate limiting —
not these auth routes). This covers only the auth routes; **app-level** rate limiting for
the Stripe webhook / Server Actions / tRPC is Step 20.

### Multi-instance storage

Better Auth's limiter defaults to **in-memory**, which is per-instance: two app
instances (or a restarted process) each start with empty counters, so the caps don't
actually hold once you scale horizontally. We set **`rateLimit.storage: "database"`**, which
backs the limiter with the **app Postgres** — a `rate_limit` table (`key` / `count` /
`last_request`, hand-maintained in `@repo/db` and registered in the `drizzleAdapter` schema,
see [DATABASE.md](DATABASE.md) → Rate-limit storage). Now every instance reads and writes the
**same** counters, and they **survive a restart**. The DB path uses an **atomic
check-and-increment** (a guarded `UPDATE`), so enforcement stays strict under concurrency
rather than degrading to best-effort. It needs **no new service** and works with env unset
(Postgres is already required infra); Better Auth prunes expired rows in the background.

For higher throughput, wire Better Auth **`secondaryStorage`** (Redis / Upstash) on the
`betterAuth({ … })` config: when `secondaryStorage` is present Better Auth uses it as the
limiter store **automatically** (so drop the explicit `storage: "database"` to hand the
counters to Redis). The app-level limiter's Upstash swap is already verified (Phase 4), so the
same Redis instance can serve both.

## Bot protection — CAPTCHA (Cloudflare Turnstile) (Tier 4 · Band 2)

The Better Auth `captcha()` plugin adds a **Cloudflare Turnstile** challenge to the
brute-force / bot-abuse surfaces — IP rate limits alone don't stop a *distributed* signup
or credential-stuffing bot. It's **opt-in and env-gated** like every integration: with the
env unset the plugin is not registered and the widget never renders, so the auth forms
behave exactly as before.

**What it protects.** The plugin's default endpoints — **`/sign-up/email`**,
**`/sign-in/email`**, **`/request-password-reset`**. (The `/two-factor/*`, `/passkey/*` and
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
sign-up/sign-in for the default env-unset app. It sits **last before `nextCookies()`** on
purpose — a conditional spread degrades every plugin *after* it from a fixed tuple position
to a loose array element, which would erase the `twoFactor`/`admin`/`organization` `$Infer`
augmentations on `Session`/`User` (a real type-check failure); keeping it after the
inference-contributing plugins preserves their tuple positions, and the empty-spread case
still leaves `nextCookies()` genuinely last at runtime.

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
cross-origin embed. See [SECURITY.md](SECURITY.md#content-security-policy).

**Local verification (no Cloudflare account).** Cloudflare publishes **dummy test keys** that
make the full flow verifiable end-to-end: site key `1x00000000000000000000AA` (always passes)
with secret `1x0000000000000000000000000000000AA` (always passes) → sign-up succeeds; swap the
secret to `2x0000000000000000000000000000000AA` (always fails) → the form shows *"Captcha
verification failed"*. Because `NEXT_PUBLIC_*` is baked at build time, a keyed local build sets
the site key at `next build`; the secret is a runtime var. A fork tightens further with the
plugin's `allowedHostnames` / `expectedAction` options (see `captchaOptions()`).

## Two-factor authentication (2FA / TOTP) (Tier 4 · Band 2)

The Better Auth `twoFactor()` plugin adds authenticator-app 2FA — a TOTP factor plus
single-use backup codes. It's **enabled** (`twoFactor({ issuer: twoFactorIssuer() })`
in `packages/auth/src/auth.ts`; `twoFactorClient()` in `client.ts`) and needs no new
runtime dependency beyond `qrcode.react` for the enrollment QR. The plugin manages a
`two_factor` table + a `user.twoFactorEnabled` flag (schema hand-maintained in
`@repo/db` — see [DATABASE.md](DATABASE.md) → Two-factor). `issuer` (the label shown in
the authenticator app) is derived from `BETTER_AUTH_URL`'s hostname by `twoFactorIssuer()`
(`config.ts`; `localhost` fallback) — a fork wanting a brand name changes it there.

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
(OAuth-only accounts get a "set a password first" pointer, mirroring the password card).

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

Both the enrollment card and the sign-in challenge are **inline reveals**, not dialogs.
(Originally forced by a `Dialog` tall-content bug — since **fixed 2026-07-09**:
`DialogContent` was missing a height cap, now `max-h-[calc(100dvh-2rem)] overflow-y-auto`;
the old "enter animation overrides the transform" diagnosis was disproven — see
[UI.md](UI.md) → Dialog + [DECISIONS.md](DECISIONS.md).) The surfaces stay inline by
**choice**: consistent with the other `/account` cards, and better suited to a
multi-field, QR-bearing flow. The QR is an inline `qrcode.react` SVG (no network request, no new CSP
origin), with the secret also shown as a copyable manual key. Backup codes are shown
**once**, at enroll (and again on regenerate), with a copy affordance — they're the only
way back in if the authenticator is lost. See [DECISIONS.md](DECISIONS.md) → Two-factor.

Rate limits on the four `/two-factor/*` endpoints are in the
[Rate limiting](#rate-limiting-auth-endpoints) block above (enable/disable 3/min;
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
[DECISIONS.md](DECISIONS.md).

**Surfaces:**
- **`/account` → Passkeys card** (`components/account/passkeys-card.tsx`) — register (name
  optional), rename, remove. NOT password-gated (unlike the 2FA card): the session already
  authorizes adding one, and passkeys are additive so removal can't lock anyone out. The list is
  SSR-seeded from a direct `passkey`-table read and then owned in local state (each mutation
  patches it; `router.refresh()` is background reconcile only — never gate the UI on it, per the
  Next 16.2.9 race noted under Sessions). The card feature-detects `window.PublicKeyCredential`
  and shows a "not supported" note on browsers without WebAuthn.
- **`/login` → "Sign in with a passkey"** button (`components/auth/login-form.tsx`) — calls
  `authClient.signIn.passkey()` with **no email**: passkeys are discoverable/resident credentials,
  so the browser `get()` prompt lets the user pick one and Better Auth's `verify-authentication`
  establishes the session; we then navigate + refresh like the email path. A cancelled/timed-out
  prompt surfaces as error code `AUTH_CANCELLED` and is swallowed (a normal user action). v1 is an
  **explicit button**; conditional-UI/autofill is a one-line upgrade (`signIn.passkey({ autoFill:
  true })` on mount + `autocomplete="webauthn"` on the email field).

All mutations go through the Better Auth client (the C1 convention — re-validated server-side,
`{ data, error }`, no throw). Rate limits on the six sensitive `/passkey/*` endpoints
(register/authenticate options + verify, delete, update) are in the
[Rate limiting](#rate-limiting-auth-endpoints) block above (10/min each — a passkey is a strong
credential, so the cap is looser than the 6-digit TOTP challenge yet still throttles abuse).

**Verification** — the full lifecycle (register → rename → sign out → sign in with the passkey →
delete) is exercised headless in `e2e/passkey.spec.ts` using **Chrome's CDP virtual
authenticator** (`WebAuthn.addVirtualAuthenticator`, resident + auto-presence), so it needs no
real device and runs in CI. The credential lives on the browser context, so it survives sign-out
and answers the discoverable sign-in.

## RBAC (Step 21)

A minimal, hand-rolled role model — and, deliberately, **the authoritative authorization
boundary** even now that the Better Auth `admin()` plugin is wired in. The plugin is
**adopted to _augment_ this model, not replace it** (Tier 4 · Band 4): `lib/rbac.ts`'s
fresh-DB `requireAdmin`/`adminProcedure` and the audited `setUserRole` action stay the
role-setter and gate, and the plugin is taken only for the two capabilities it uniquely
adds — user **ban** and **impersonation** (see [Admin plugin — ban &
impersonation](#admin-plugin--ban--impersonation-tier-4--band-4) below). Why augment rather
than hand the whole gate to the plugin: every `admin()` endpoint authorizes off the
**cookie-cached session role** (≤5 min stale via the Step-19 cache), whereas this model reads
the role **fresh from the DB** on every check — so the fresh path stays the boundary and the
plugin rides on top for the session-cookie mechanics only it can do.

### The `role` column

`user.role` is a plain `text` column (typed to `Role` in Drizzle) — **not** a
Postgres enum — `NOT NULL DEFAULT 'user'`. The role set is defined once in
`packages/db/src/schema/auth.ts`:

```typescript
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];
```

`text` (over `pgEnum`) so adding a role later is a one-line edit with no `ALTER TYPE`
migration. `@repo/validators` keeps a matching `z.enum(["user","admin"])`
(`setUserRoleSchema`) — it can't import `@repo/db` (that package stays import-pure),
so the literal list is duplicated there with a sync comment.

### Authoritative role read (not the session)

The role check reads **fresh from the DB**, never from `session.user.role`. The
Step-19 session `cookieCache` (5 min) means a role on the session can be stale that
long, so we treat the cookie-cached session as proof of *identity* and read the role
from Postgres for *authority*. A demotion takes effect on the next request.

Consequently `role` is **not** in Better Auth's `additionalFields`: no auth API can
read or write it, so the only role writers are direct DB access and the admin-gated
`setUserRole` action. `packages/auth` is untouched by this step.

`apps/web/src/lib/rbac.ts` (`server-only`) holds the helpers:

- `getUserRole(userId): Promise<Role | null>` — the authoritative DB read.
- `requireAdmin(): Promise<{ session, role } | null>` — resolves the session, then
  reads the role; `null` unless the caller is an admin. For Server Components /
  Server Actions.

### Where the check lives (three layers)

| Surface | Guard | On failure |
| --- | --- | --- |
| tRPC | `adminProcedure` (builds on `protectedProcedure`) | `UNAUTHORIZED` / `FORBIDDEN` |
| Server Action | `requireAdmin()` (e.g. `setUserRole`) | typed `{ error: "Forbidden" }` |
| Page (`/admin`) | `requireAdmin()` in the Server Component | `notFound()` (404) |
| Proxy (`proxy.ts`) | cookie presence only (optimistic) | redirect to `/login` |

The proxy can't know a role at the edge (no DB), so it only does the cookie-present
redirect for `/admin` (fast UX); a signed-in non-admin passes it and is then 404'd by
the page. **Authorization is always the DB-backed check**, never the proxy.

The `/admin` page (D2) lives under the `(dashboard)` route group, so it inherits the
app shell (header / nav / user menu); the URL stays `/admin`. The shell renders an
**Admin nav link only for admins** — `getUserRole(session.user.id)` in the layout, the
same fresh DB read `requireAdmin()` trusts, so a demotion hides the link on the next
request. The page lists users and changes each one's role through the `setUserRole`
Server Action via the client `RoleControl` — optimistic (React 19 `useOptimistic`: the
button flips immediately, then `revalidatePath("/admin")` reconciles the row, reverting
on a typed error). It's the Server-Action flavour of optimistic UI, distinct from
`/posts`, which patches the TanStack infinite-query cache around tRPC mutations.

### Promoting an admin (never self-service)

Every new user is `role = 'user'`. The **first** admin is promoted out-of-band —
direct SQL against the DB (a `db:seed` helper arrives in Step 28):

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Once a first admin exists, they can promote others via the `setUserRole` Server
Action. There is no API or sign-up path that lets a user set their own role.

**Anti-lockout (D2):** `setUserRole` refuses to change the *caller's own* role
(typed `{ error }`), and the UI renders "(you)" instead of a button on that row. A
demotion is therefore always performed by a *different* admin, so the last admin
can't accidentally strip the app of every admin and lock everyone out of `/admin`.

**Audit log (P1-7):** every applied role change emits a structured
`log.info("admin.setUserRole", { actorId, targetId, oldRole, newRole })` through the
existing `@logtail/next` pipeline (BetterStack when configured, console otherwise —
see SERVICES.md), so privileged mutations are traceable. IDs only — no email PII in
the log sink. The pre-update role read also surfaces a nonexistent target as a typed
`{ error: "User not found" }` instead of silently "succeeding" on a zero-row update.
Denied attempts aren't logged (they return typed errors); a fork wanting a fuller
audit posture adds a `log.warn` on the deny paths.

### Persisted audit trail — `audit_log` (B2)

The `log.info` line above is fire-and-forget to an external sink — good for real-time
alerting, but **not queryable** ("show me every role change for user X" / "every sign-in
for this account"). B2 adds the queryable counterpart: a persisted **`audit_log`** table
(`@repo/db`, migration 0011) written by a single shared helper,
**`recordAuditEvent({ action, actorId?, targetId?, metadata? })`**, exported from `@repo/db`
so both the app and the `@repo/auth` callbacks can call it (auth can't import from
`apps/web`). The security-relevant events recorded:

| `action` | Where it's written | `metadata` |
| --- | --- | --- |
| `user.role_changed` | `setUserRole` action (alongside the `log.info`) | `{ oldRole, newRole }` |
| `user.deleted` | `deleteUser.afterDelete` (auth.ts) | — |
| `user.email_changed` | `afterEmailVerification` hop-2 branch (auth.ts) | `{ oldEmail, newEmail }` |
| `user.signed_in` | `databaseHooks.session.create.after` (auth.ts) | `{ ip, userAgent }` |
| `user.banned` | `banUser` action (Admin plugin) | `{ reason? }` |
| `user.unbanned` | `unbanUser` action (Admin plugin) | — |
| `user.impersonated` | `impersonateUser` action (Admin plugin) | — |
| `user.impersonation_stopped` | `stopImpersonating` action (Admin plugin) | — |

`user.role_changed` upgrades a pre-existing `log.info` emit site; **sign-in** is a genuinely
new signal (a session row is inserted on every real sign-in — email/OAuth/post-2FA — while a
cookie-cache refresh reuses the row, so it doesn't fire on idle refreshes); the four Admin-plugin
rows are written by the `server/actions/admin.ts` mutations (see
[Admin plugin — ban & impersonation](#admin-plugin--ban--impersonation-tier-4--band-4)).

Two design choices worth knowing:

- **`recordAuditEvent` is best-effort by contract** — it swallows its own failures to
  stderr and returns, so a slow or down audit write can never fail a role change or block a
  login. Callers don't wrap it.
- **`actor_id` / `target_id` are FK-less `text`, on purpose.** An audit record must outlive
  the users it references: a cascading FK would erase the trail on account deletion (the
  opposite of the point), and the `user.deleted` row is written *after* the `user` row is
  gone, so an FK insert would fail its own constraint. See
  [DATABASE.md](DATABASE.md#audit-log-audit_log--security-event-trail) for the table shape.

Unlike the external log sink (IDs only), `audit_log` lives in the app's **own** Postgres —
which already stores `user.email` — so recording old→new email on a change is safe and is
the point of that record. `action` is open `text` (typed to an `AuditAction` union in the
helper, but not a `pgEnum`) so a fork adds an event with a one-line edit and no `ALTER TYPE`.
An admin-only read surface lives at **`/admin/audit`** (`app/[locale]/(dashboard)/admin/audit/page.tsx`)
— the trail newest-first, keyset-paginated exactly like `/admin` (reuses `lib/keyset-cursor`;
served by `audit_log_created_at_idx`). It resolves `actor_id`/`target_id` to an email via two
aliased `LEFT JOIN`s on `user`, falling back to the raw id when the user is gone (the whole
point of the FK-less columns). `lib/audit-format.ts`'s pure `describeAuditEvent()` maps each
event to a label + one-line detail (`Role changed · user → admin`, `Signed in · from <ip>`, …).
Same `requireAdmin()` guard as `/admin` (non-admins 404). The raw table is still there for
SQL / export; filters (by action/actor) are the obvious next extension.

### Graceful degradation

With no admin promoted (the default for a fresh clone), `adminProcedure` returns
`FORBIDDEN` for everyone and `/admin` 404s — the app still builds, signs up, and runs
normally on the default `user` role.

## Admin plugin — ban & impersonation (Tier 4 · Band 4)

The Better Auth **`admin()`** plugin is wired in `packages/auth/src/auth.ts`
(`admin({ adminRoles: ["admin"] })`, kept **above** the must-be-last `nextCookies()`), with
the matching `adminClient()` in `client.ts`. It's adopted to **augment** the [RBAC](#rbac-step-21)
model, **not replace it** — `requireAdmin()` + the audited `setUserRole` action stay the
authoritative gate and role-setter — and is taken only for the two capabilities it uniquely
adds: user **ban** and **impersonation**. It manages the existing `user.role` column and adds
four columns (migration 0014): `user.banned` / `banReason` / `banExpires` +
`session.impersonatedBy` (see
[DATABASE.md](DATABASE.md#admin-plugin-columns-ban--impersonation)). `adminRoles: ["admin"]`
matches `ROLES` exactly, so the plugin's default access-control roles (`admin`/`user`) fit with
**no custom `ac`**. Defaults kept: `defaultRole "user"`, impersonation session 1 h, and
`allowImpersonatingAdmins` **false** (an admin can't impersonate another admin).
create-user / set-password / set-email / remove-user / admin-session management + custom AC are
documented, unused extensions.

**The staleness trade-off (the crux).** Every `/admin/*` endpoint authorizes off the
**cookie-cached session role** (`getSessionFromCtx`, ≤5 min stale via the Step-19 cache), not a
fresh DB read. That single fact shapes both features differently:

### Ban / unban — fresh-gated *direct DB writes* (not the plugin endpoint)

`banUser` / `unbanUser` (`server/actions/admin.ts`) gate with the fresh-DB `requireAdmin()` and
write the ban columns **directly**, rather than calling `auth.api.banUser`. Why not the endpoint:
it re-authorizes off the stale session role, which would wrongly **forbid a just-promoted admin**
whose session still says `role:"user"` (verified — a promote-then-ban E2E failed exactly that
way). `requireAdmin()` already read the role fresh, so the action owns the write and keeps the
strict, fresh gate:

- `banUser` sets `banned/banReason/banExpires` **and revokes the target's live sessions**
  (`db.delete(session)` — a ban must sign them out now, not only block future sign-ins).
  Anti-lockout: an admin can't ban themselves. Takes an optional `banReason` (surfaced in the
  audit trail) and an optional `banExpiresIn` in seconds (omitted = a permanent ban).
- The plugin's own `session.create.before` hook still enforces the ban **at sign-in** — it reads
  `banned` **fresh**, blocks with `bannedUserMessage`, and **auto-lifts** an elapsed `banExpires`.
  So a direct write is equivalent to the endpoint minus the stale re-check.
- `unbanUser` clears the columns; no self-check needed (a banned admin can't sign in to reach it).
- The `BanControl` on each `/admin` row is optimistic (React 19 `useOptimistic`), the same
  posture as `RoleControl`.

### Impersonation — the plugin's session-cookie swap (carries the ≤5-min window)

Impersonation is a **session-cookie swap** only the plugin can perform, so unlike ban it **must**
go through `auth.api.impersonateUser` — and therefore inherently carries the ≤5-min
stale-session-role window. It's wrapped in a fresh-gated, audited Server Action to keep the
repo's posture:

- `impersonateUser` (`server/actions/admin.ts`) is `requireAdmin()`-gated + audited, then calls
  the endpoint. On success the endpoint deletes the admin's session cookie, stashes it in a signed
  `admin_session` cookie, and sets the target's — `nextCookies()` flushes that swap from the
  Server Action; the `ImpersonateControl` then does a **full navigation** (`window.location`) so
  the app reloads under the new session.
- **The residual (documented).** Because the endpoint reads the session role, a **just-promoted
  admin must sign out and back in first** (their session still says `user`) — the action surfaces
  the endpoint's `FORBIDDEN` as a typed error, never a 500. The fresh `requireAdmin()` gate still
  earns its place: it blocks a **just-demoted** admin whom the plugin alone would keep trusting for
  ≤5 min. `allowImpersonatingAdmins` stays false (admins can't impersonate each other), and
  `ImpersonateControl` also hides on the caller's own row and on admin-role rows.
- While impersonating, `session.session.impersonatedBy` is set (the acting admin's id); the
  `(dashboard)` layout renders an **app-wide banner** ("Impersonating `<email>` — Stop
  impersonating"). `stopImpersonating` is the symmetric swap-back — deliberately **not**
  `requireAdmin()`-gated (during impersonation the caller session *is* the target, not an admin);
  it keys off `impersonatedBy`, restores the admin's session from the `admin_session` cookie, and
  full-navs back to `/admin`.

### Rate limits & audit

The `/admin/*` endpoints are already admin-gated (not an anonymous brute-force surface), so their
custom rate-limit rules are abuse-limiting for a compromised or misbehaving admin session, not a
login defense: `set-role`/`ban-user`/`unban-user` 20/min, `impersonate-user` 10/min,
`stop-impersonating` 30/min (loosest — it's the safe exit). All four mutations record to the
[`audit_log`](#persisted-audit-trail--audit_log-b2)
(`user.banned`/`unbanned`/`impersonated`/`impersonation_stopped`). See
[DECISIONS.md](DECISIONS.md) for the augment-vs-replace + staleness decisions and
[SECURITY.md](SECURITY.md) for the residual as a security posture.

## Organizations / multi-tenancy

Multi-tenancy (teams + per-org membership + per-org roles) is Better Auth's built-in
**`organization()`** plugin — **no new dependency** (it ships inside `better-auth`). The
server plugin is wired in `packages/auth/src/auth.ts` (kept **before** `nextCookies()`, the
must-be-last plugin) and the matching `organizationClient()` in
`packages/auth/src/client.ts`, so Client Components get typed `authClient.organization.*`
methods. The plugin's tables are hand-maintained in `@repo/db` — see
[DATABASE.md](DATABASE.md#organizations--multi-tenancy-organization--member--invitation--better-auth-plugin)
for shapes and [DECISIONS.md](DECISIONS.md) for the four locked decisions.

### Two role layers (this is the key model)

There are now **two orthogonal role systems** — don't conflate them:

| Layer | Column / source | Roles | Gates | Read authoritatively via |
| --- | --- | --- | --- | --- |
| **Platform** | `user.role` (RBAC, above) | `user` / `admin` | `/admin` operator console | `getUserRole` (`lib/rbac.ts`) |
| **Membership** | `member.role` (org plugin) | `owner` / `admin` / `member` | operations *within* one org | the plugin's server API (fresh DB read) |

A platform `admin` and an org `admin` are different authorities and never collide. The
`admin()` plugin (Tier 4 · Band 4) augments the **platform** layer only — ban + impersonation
of platform users — and the hand-rolled platform RBAC stays the authoritative role gate (see
[Admin plugin — ban & impersonation](#admin-plugin--ban--impersonation-tier-4--band-4)). Org-role
checks read the `member` row **fresh from the DB** (same authoritative posture as `lib/rbac.ts`,
not the cookie-cached session). The default access-control roles are the plugin's own
(`owner`/`admin`/`member`); the **creator** of an org is `owner`.

### Active organization

The plugin adds `session.activeOrganizationId` (NULL = **personal workspace**, so a fresh
clone with zero orgs behaves exactly as before). `createOrganization` sets the new org
active; `authClient.organization.setActive({ organizationId })` switches it and **re-issues
the session cookie**. One nuance (Step-19 cookie cache, 5 min): a *just-changed* active org
isn't visible to a read that hits the cached session — so any server code that scopes data
by active org must resolve it **authoritatively** (bypass the cache, or take the id from a
fresh `setActive`). This is why the server-layer org context (next step) reads active-org
authoritatively rather than trusting `getSession`'s cached value.

### Invitations degrade gracefully (email optional)

`sendInvitationEmail` renders the new `@repo/email` `OrganizationInvitation` template and
sends it via Resend. Like every other email here it **degrades gracefully**: with email
unset the send no-ops (logs a skip), but **the invitation row is still created** — so the
members UI can surface a **copyable accept link** (`invitationAcceptUrl` → the app's
`/accept-invitation/[id]` route) and the invite flow works without an email provider. The
accept URL is built in `config.ts` (pure, unit-tested — P3-3) from `BETTER_AUTH_URL`.

### Organizations UI (step 4)

The whole org UI is **client-driven by Better Auth's reactive hooks** — no bespoke tRPC
query. `authClient.useActiveOrganization()` returns the active org **bundled with its
`members[]` (each joined to `user.{name,email,image}`) and `invitations[]`**, and refetches
automatically after every `/organization*` mutation (create / setActive / invite / remove /
role change / accept); `useListOrganizations()` feeds the switcher; `useSession()` identifies
the caller. Components live in `apps/web/src/components/organization/`; shared shadcn
primitives (`dialog`, `select`) were added to `@repo/ui`.

- **Header workspace switcher** (`org-switcher.tsx`, mounted in the `(dashboard)` layout):
  lists orgs + "Personal", switches via `setActive({ organizationId })` (or `null` → Personal),
  and offers "Create organization…" + "Manage organization". The selected id is held in
  **optimistic local state** so the checkmark/label move instantly (never gated on
  `router.refresh()` committing — the next-router-refresh race); `refresh()` only reconciles
  server-rendered surfaces (e.g. `post.list` scoping) in the background.
- **Create org** (`create-org-dialog.tsx`): a modal form (RHF + `createOrganizationSchema`,
  slug auto-derived from the name) → `organization.create` → `setActive` the new org → route
  to `/organization`.
- **`/organization`** (gated, in `(dashboard)`): members list with role `Select` + remove
  (`updateMemberRole` / `removeMember`), invite form (`inviteMember`), pending invitations with
  a **Copy-link** button (the email-off accept link) + cancel, and a settings/danger zone —
  owner can rename (`update`) / delete (`delete`, type-to-confirm), any non-owner member can
  leave (`leave`). Management controls are gated on the caller's org role **for UX only**;
  Better Auth re-checks authority on every endpoint (see [orgProcedure](API.md) / `lib/organization.ts`).
- **`/accept-invitation/[id]`** (public, in the `(auth)` group so it renders on the centered
  shell and works signed-out): a Server Component reads the invitation + org straight from the
  DB for display, then a client island handles four states — **signed out** (prompt sign-in/up
  as the invited email, returning here via `?redirectTo`), **email match** (Accept →
  `acceptInvitation` → `setActive` → `/organization`), **wrong account** (explain the mismatch,
  offer sign-out), and **invalid / expired / already-used**.

> **a11y gotcha (fixed):** a `DropdownMenu` item that opens a dialog must **not**
> `preventDefault()` its `onSelect` — keeping the modal menu open leaves its `aria-hidden` on
> the rest of the layout after you navigate away (the menu never closes to restore it),
> hiding the destination page from assistive tech until a reload. Let the menu close, then
> open the dialog on the next tick (`org-switcher.tsx`); likewise defer the post-create
> navigation a tick so the dialog's own close commits first (`create-org-dialog.tsx`).

### Caveats & scope

- **Deleting a user does not delete the orgs they belong to.** `organization` has no user
  FK (an org can have many members), so a user delete cascades their `member` +
  `invitation` + `session` rows but **leaves the `organization` row** — an org can outlive
  any single member. A real app that wants sole-owner orgs cleaned up adds that to the
  `deleteUser.beforeDelete` hook — the same pattern the Uploadthing-file and A13
  Stripe-subscription cleanups use; the boilerplate leaves the org case as a documented caveat.
- **v1 scope: teams OFF, dynamic runtime roles OFF.** The plugin's `teams` (sub-orgs:
  `team`/`team_member` + `session.activeTeamId`) and `dynamicAccessControl` (runtime custom
  roles: `organization_role`) features are one-flag upgrades (`organization({ teams: {
  enabled: true } })` / `{ dynamicAccessControl: { enabled: true } }` + their tables); left
  off to keep the org-scoped-`posts` example and the members UI clean.
- **Per-org billing** (scoping `subscriptions` to an org) is the Phase-5 org-aware Stripe
  upgrade — documented, not built (subscriptions stay per-user for now).

## Environment Variables

Validated in `apps/web/src/env.ts`; loaded from the monorepo-root `.env`.

- `BETTER_AUTH_SECRET` — random 32+ char secret for signing sessions (**required**;
  also signs the session cookie cache)
- `BETTER_AUTH_URL` — canonical app URL (defaults to `http://localhost:3000`); always a
  trusted origin
- `AUTH_TRUSTED_ORIGINS` — optional, comma-separated extra trusted origins (beyond
  `BETTER_AUTH_URL`) for CSRF / redirect validation; each entry must be a URL or
  `*`-wildcard pattern (validated at boot in `env.ts` → `lib/env-schema.ts`)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — optional; enables GitHub OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional; enables Google OAuth
- `RESEND_API_KEY` / `EMAIL_FROM` — optional (validated in `env.ts`, see SERVICES.md).
  When **both** are set, `isEmailConfigured()` is true → email verification becomes
  **required** before sign-in. Unset → verification is off and the app runs normally.
- `TURNSTILE_SECRET_KEY` (server) / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client) — optional;
  set both to turn on the [Cloudflare Turnstile CAPTCHA](#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2)
  on sign-up / sign-in / password-reset. Unset → no plugin, no widget, forms unchanged.

`@repo/auth` reads these from `process.env` directly (packages can't import the
app's `env.ts`), mirroring how `@repo/db` reads `DATABASE_URL`.
