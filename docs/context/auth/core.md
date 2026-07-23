# Auth — core

> When to load: auth setup/config, session access, protected routes, the auth UI, hardening + rate limits, env vars. Siblings: [account-page.md](account-page.md) (the `/account` surface) · [factors.md](factors.md) (2FA · passkeys · CAPTCHA · magic link) · [rbac-admin.md](rbac-admin.md) (RBAC · admin plugin · audit log) · [organizations.md](organizations.md) (multi-tenancy · per-org billing).

## Setup

- Library: Better Auth v1.6+
- Package: `@repo/auth` (`packages/auth/`)
- Storage: PostgreSQL via the Drizzle adapter (`better-auth/adapters/drizzle`)
- Strategy: session-based (cookie) with JWT option available via plugin
- Methods enabled: email/password (always on) + GitHub & Google OAuth (opt-in —
  each lights up only when its `*_CLIENT_ID`/`*_CLIENT_SECRET` pair is present)
- Hardening: email verification + password reset (wired to `@repo/email`),
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
The same ownership rule covers every auth-plugin table (2FA, passkeys, orgs,
admin columns, rate-limit storage) — see [DATABASE.md](../DATABASE.md).

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
    config.ts         — pure env-driven config helpers: socialProviders,
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
`en` locale, so the routes below are unchanged. See [I18N.md](../I18N.md).)

- `app/[locale]/(auth)/login` → `/login` — sign in; honors a sanitized `?redirectTo` (set by the
  proxy when it bounces an unauthenticated user) so sign-in returns them where they were.
  `safeRedirectPath` (`lib/auth-redirect.ts`, unit-tested + coverage-gated) accepts only a
  same-origin absolute path — absolute URLs, protocol-relative `//`, and the backslash
  variant `/\` (WHATWG parsing normalizes `\` → `/`) all fall back to `/dashboard`.
- `app/[locale]/(auth)/signup` → `/signup` — sign up. `force-dynamic` so it reads the email env at
  request time: with email configured (verification required) it shows a "check your inbox"
  state; with email unset (the default) Better Auth creates a session and it redirects in.
  The check-your-inbox state carries a **"Resend verification email"** button — see
  [Email verification](#email-verification) below.
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
inline. Auth is same-origin, so the UI adds **no new CSP origins**. This is the
**auth-client convention** the rest of the auth surfaces follow: mutations go through the
Better Auth client, re-validated server-side, `{ data, error }`, no throw, no new CSP origin.

**OAuth social buttons.** Beneath the email/password fields, the login + signup forms
render one social button per **configured** provider: `configuredOAuthProviders()`
(`lib/auth-providers.ts`, `server-only`) detects which providers have **both** their
`*_CLIENT_ID` / `*_CLIENT_SECRET` set — the same gate `socialProviders()` uses in `auth.ts`,
so UI and server stay in lockstep — and the login/signup **pages** (Server Components; the
client can't read `process.env`) pass the resolved list down to `SocialSignIn`
(`components/auth/social-sign-in.tsx`), one `authClient.signIn.social({ provider, callbackURL })`
button each. An unconfigured provider shows **no button** (graceful degradation — no dead
buttons). `signIn.social` is a top-level navigation to the provider (the Stripe
hosted-checkout class), so it adds **no new CSP origin**.

## Available Auth Plugins

Better Auth has a plugin system. Common ones already configured or easy to add:
- `haveIBeenPwned()` — **enabled** (rejects known-breached passwords; see
  [Compromised-password check](#compromised-password-check-hibp) under Auth hardening)
- `organization()` — **enabled** (multi-tenancy: teams + per-org roles; see
  [organizations.md](organizations.md))
- `twoFactor()` — **enabled** (TOTP authenticator + single-use backup codes; see
  [factors.md → Two-factor](factors.md#two-factor-authentication-2fa--totp-tier-4--band-2))
- `passkey()` — **enabled** (WebAuthn passkeys: platform biometrics / roaming security keys,
  additive to password + OAuth; see
  [factors.md → Passkeys](factors.md#passkeys--webauthn-tier-4--band-3))
- `admin()` — **enabled** (adopted to *augment* the hand-rolled RBAC:
  user **ban** + **impersonation**; the platform role model stays the authoritative gate —
  see [rbac-admin.md](rbac-admin.md#admin-plugin--ban--impersonation-tier-4--band-4))
- `captcha()` — **enabled when configured** (Cloudflare Turnstile bot-protection on
  sign-up / sign-in / password-reset / magic-link send; registered only when `TURNSTILE_SECRET_KEY`
  is set — see [factors.md → CAPTCHA](factors.md#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2))
- `magicLink()` — **enabled when configured** (passwordless emailed sign-in link; registered
  only when email is configured — see
  [factors.md → Magic link](factors.md#magic-link-sign-in-env-gated-path-to-100-6);
  the `emailOTP()` sibling stays a docs-only recipe there too)

### Plugin tuple order (the conditional-spread gotcha)

The `plugins` array in `packages/auth/src/auth.ts` is **order-sensitive**:
`haveIBeenPwned()` first, the `$Infer`-contributing plugins (`twoFactor`, `admin`,
`organization`, `passkey`) at **fixed tuple positions**, the conditionally-spread plugins
(`captcha`, `magicLink`) after them, and `nextCookies()` genuinely **last**.

**Why conditional spreads go last:** a conditional spread (`...(cond ? [plugin()] : [])`)
degrades every plugin *after* it from a fixed tuple position to a loose array element,
which erases the `twoFactor`/`admin`/`organization` `$Infer` augmentations on
`Session`/`User` — a real type-check failure. Neither conditional plugin contributes
`$Infer` augmentations itself, so only its position relative to the plugins *above* it
matters, and the empty-spread case still leaves `nextCookies()` genuinely last at runtime.
(See the plugins-array comment in `auth.ts`.)

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

**Resend affordance.** The signup form's check-your-inbox state has a resend
button calling `authClient.sendVerificationEmail({ email, callbackURL })`. The endpoint
(`POST /send-verification-email`) is **email-keyed, not session-bound** — essential, since
with verification required the user in this state *cannot* have a session; the sessionless
path only sends when the address exists and is unverified, behind a constant-time floor
(no account enumeration), and is rate-limited 3/min (over-limit surfaces as the form's
inline error). Both `signUp.email` and the resend pass `callbackURL: redirectTo` (the
page's sanitized `?redirectTo`, default `/dashboard`), so every emailed link lands the
newly-verified — and, via `autoSignInAfterVerification`, newly signed-in — user on the
post-login target instead of Better Auth's default `/`. The login form's "email not
verified" error deliberately gets **no** sibling resend affordance (documented non-goal);
a fork can add one with the same email-keyed call.

### Password reset

`emailAndPassword.sendResetPassword` renders `@repo/email`'s `ResetPasswordEmail`.
The flow (the `/forgot-password` + `/reset-password` pages drive this via the auth
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
in the `plugins` array — rejects known-breached passwords on the password-setting paths
(`/sign-up/email`, `/change-password`, `/reset-password` by default). It SHA-1-hashes
the candidate and sends only the **first five hex chars** to the
[Pwned Passwords](https://haveibeenpwned.com/Passwords) range API (k-anonymity), so the
password itself never leaves the server and **no API key/secret is required**. A hit
returns `400 PASSWORD_COMPROMISED` (_"The password you entered has been compromised.
Please choose a different password."_), surfaced inline by the sign-up / reset /
change-password forms.

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

`emailVerification.afterEmailVerification` enqueues `WelcomeEmail` (a background job)
after a user verifies — the "real flow" that wires the welcome template. It fires
only on the **sign-up** verify event: OAuth sign-ups (email already verified, no
verification step) don't trigger it, and an **email-change** completion is detected via
the token and **skips** the welcome (see [account-page.md](account-page.md));
apps that want welcome-on-signup or OAuth coverage can instead send from
`databaseHooks.user.create.after`.

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

This staleness model ripples repo-wide: sensitive Better Auth endpoints bypass the cache
(`sensitiveSessionMiddleware`), platform-role checks read the DB instead of the session
([rbac-admin.md](rbac-admin.md) — including the admin plugin's ≤5-min staleness crux),
session revocation on other devices bites within the window
([account-page.md](account-page.md)), and a just-switched active org isn't visible to
cached reads ([organizations.md](organizations.md)).

### Rate limiting (auth endpoints)

Rate limiting is **two layers, by design — don't conflate them**. This section is
layer 1: Better Auth's built-in limiter on the auth routes (`/api/auth/*`). Layer 2 is
the broader **app-level** limiter (`apps/web/src/lib/rate-limit.ts`) applied to the
Stripe webhook, Server Actions, and tRPC — see
[SECURITY.md → Rate limiting (app-level)](../SECURITY.md#rate-limiting-app-level).

Better Auth's limiter is made **explicit and on in every environment** (its default is
in-memory + production-only) and **backed by the app Postgres** so the counters survive
horizontal scaling (see [Multi-instance storage](#multi-instance-storage) below). This is
the canonical rule list (matches `auth.ts`):

```typescript
rateLimit: {
  enabled: true, storage: "database", window: 60, max: 100,
  customRules: {
    "/sign-in/email":                 { window: 60, max: 5 },
    "/sign-up/email":                 { window: 60, max: 5 },
    "/request-password-reset":        { window: 60, max: 3 },
    "/reset-password":                { window: 60, max: 5 },
    "/send-verification-email":       { window: 60, max: 3 },
    "/change-email":                  { window: 60, max: 3 },
    "/delete-user":                   { window: 60, max: 3 },
    "/sign-in/magic-link":            { window: 60, max: 3 },
    "/magic-link/verify":             { window: 60, max: 10 },
    "/two-factor/enable":             { window: 60, max: 3 },
    "/two-factor/disable":            { window: 60, max: 3 },
    "/two-factor/verify-totp":        { window: 60, max: 5 },
    "/two-factor/verify-backup-code": { window: 60, max: 5 },
    "/passkey/generate-register-options":     { window: 60, max: 10 },
    "/passkey/verify-registration":           { window: 60, max: 10 },
    "/passkey/generate-authenticate-options": { window: 60, max: 10 },
    "/passkey/verify-authentication":         { window: 60, max: 10 },
    "/passkey/delete-passkey":                { window: 60, max: 10 },
    "/passkey/update-passkey":                { window: 60, max: 10 },
    "/admin/set-role":                { window: 60, max: 20 },
    "/admin/ban-user":                { window: 60, max: 20 },
    "/admin/unban-user":              { window: 60, max: 20 },
    "/admin/impersonate-user":        { window: 60, max: 10 },
    "/admin/stop-impersonating":      { window: 60, max: 30 },
  },
}
```

Cap rationale, by group:

- **Anonymous surfaces** (sign-in/up, password reset, resend-verification, magic-link
  send) are the brute-force / enumeration defense — the tightest buckets. The magic-link
  send is an unauthenticated, email-keyed trigger, so it gets the
  `/request-password-reset` posture (this customRule overrides the plugin's own 5/min
  default); `/magic-link/verify` is abuse-limiting only (the token is single-use, not
  brute-forceable).
- **2FA:** enable/disable are password-gated state changes (3/min); verify-totp /
  verify-backup-code are the brute-forceable 6-digit sign-in challenge, so they get the
  tightest challenge bucket (5/min).
- **Passkeys:** a passkey assertion is **cryptographic — not brute-forceable** — so the
  10/min caps are abuse-limiting, not brute-force defense; looser than TOTP yet generous
  enough for a user fumbling an authenticator.
- **Admin endpoints** are already admin-gated (not an anonymous brute-force surface), so
  these caps limit a **compromised or misbehaving admin session**, not a login defense;
  `stop-impersonating` is loosest (30/min) — it's the safe exit.

Past the limit the endpoint returns **HTTP 429** with Better Auth's `X-Retry-After`
header (the IETF `RateLimit-*`/`Retry-After` headers belong to the *app-level* limiter,
not these auth routes).

### Multi-instance storage

Better Auth's limiter defaults to **in-memory**, which is per-instance: two app
instances (or a restarted process) each start with empty counters, so the caps don't
actually hold once you scale horizontally. We set **`rateLimit.storage: "database"`**, which
backs the limiter with the **app Postgres** — a `rate_limit` table (`key` / `count` /
`last_request`, hand-maintained in `@repo/db` and registered in the `drizzleAdapter` schema,
see [DATABASE.md → Rate-limit storage](../DATABASE.md#rate-limit-storage-rate_limit--better-auth-limiter-store-migration-0013)).
Now every instance reads and writes the **same** counters, and they **survive a restart**.
The DB path uses an **atomic check-and-increment** (a guarded `UPDATE`), so enforcement
stays strict under concurrency rather than degrading to best-effort. It needs **no new
service** and works with env unset (Postgres is already required infra); Better Auth prunes
expired rows in the background.

For higher throughput, wire Better Auth **`secondaryStorage`** (Redis / Upstash): when
present, Better Auth uses it as the limiter store **automatically** (drop the explicit
`storage: "database"`). The app-level limiter's Upstash swap is already verified, so the
same Redis instance can serve both.

## Two role layers (this is the key model)

There are **two orthogonal role systems** — don't conflate them:

| Layer | Column / source | Roles | Gates | Read authoritatively via |
| --- | --- | --- | --- | --- |
| **Platform** | `user.role` (RBAC — [rbac-admin.md](rbac-admin.md)) | `user` / `admin` | `/admin` operator console | `getUserRole` (`lib/rbac.ts`) |
| **Membership** | `member.role` (org plugin — [organizations.md](organizations.md)) | `owner` / `admin` / `member` | operations *within* one org | the plugin's server API (fresh DB read) |

A platform `admin` and an org `admin` are different authorities and never collide. The
`admin()` plugin augments the **platform** layer only — ban + impersonation of platform
users — and the hand-rolled platform RBAC stays the authoritative role gate
([rbac-admin.md](rbac-admin.md)). Org-role checks read the `member` row **fresh from the
DB** (same authoritative posture as `lib/rbac.ts`, never the cookie-cached session); the
default access-control roles are the plugin's own (`owner`/`admin`/`member`), and the
**creator** of an org is `owner`.

## The Next 16.2.9 `router.refresh()` race

A `router.refresh()` raced right after a client fetch can intermittently **never
commit** (Next 16.2.9: the RSC payload fully arrives, the commit doesn't; reproduced
against prod builds). Repo-wide convention: **never gate UI on a refresh committing** —
keep the authoritative result in optimistic local state (or do a full `window.location`
navigation) and fire `router.refresh()` only as background reconciliation. Followed by
the `/account` sessions + deletion surfaces ([account-page.md](account-page.md)), the
passkeys card ([factors.md](factors.md)), and the org switcher
([organizations.md](organizations.md)).

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
  set both to turn on the
  [Cloudflare Turnstile CAPTCHA](factors.md#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2)
  on sign-up / sign-in / password-reset. Unset → no plugin, no widget, forms unchanged.

`@repo/auth` reads these from `process.env` directly (packages can't import the
app's `env.ts`), mirroring how `@repo/db` reads `DATABASE_URL`.
