# Account page

> When to load: the `/account` settings surface — profile + email change, password, sessions, account deletion, data export.

## Account page (M3)

`app/[locale]/(dashboard)/account` → `/account` is the **real** settings surface inside the
protected shell (it superseded the throwaway `/profile` demo). It inherits the `(dashboard)`
layout's authoritative gate and re-reads the session itself (`redirect("/login")` if absent);
reached from the **Account** item in the header `UserMenu`. Card components live in
`components/account/`; client mutations follow the auth-client convention throughout
([core.md → Auth UI](core.md#auth-ui-c1)): the Better Auth client, re-validated
server-side, `{ data, error }` (no throw), no new CSP origin. Cards:

- **Profile** — the display name is editable via the `updateUserName` Server Action +
  `UpdateNameForm` (the action `revalidatePath`es `/account` too). The sign-in **email is
  editable** via `ChangeEmailForm` → `authClient.changeEmail({ newEmail, callbackURL: "/account" })`;
  shared `changeEmailSchema` in `@repo/validators`; `/change-email` rate-limited 3/min. The flow
  is enabled by `user.changeEmail` in `auth.ts` and has **two branches**, decided by whether the
  **current** email is verified — the page knows this and branches the success copy on the
  `emailVerified` prop, because Better Auth returns a neutral `{ status: true }` either way
  (also for an already-registered address), so it never leaks email existence:
  - **Current email unverified** (e.g. email env unset → users are never verified):
    `updateEmailWithoutVerification: true` applies the change **immediately**; the form calls
    `router.refresh()` so the page shows the new address. This is what keeps the surface working
    with **email unconfigured** — a user can't reach `/account` verified unless email is
    configured, so the two-hop flow below never engages when email is unset.
  - **Current email verified** — **two-hop, the secure default:** `sendChangeEmailConfirmation`
    first emails the **current/old** address a confirmation link (`ChangeEmail` template →
    `sendChangeEmailConfirmationEmail`) — hop 1. Approving it makes Better Auth mint a second
    token and email the **new** address its own verification link (hop 2); clicking *that*
    applies the change and marks the new address verified. So the change requires control of
    **both** addresses, and the success copy points at the **current** inbox, not the new one.
    Two-hop won over single-hop because single-hop notified only the *new* address — a hijacked
    session could move the account without ever alerting the old one; history:
    [docs/archive/PHASE_HISTORY.md](../../archive/PHASE_HISTORY.md).
  - **Defense-in-depth on completion.** `emailVerification.sendVerificationEmail` and
    `afterEmailVerification` each fire for **both** the sign-up verify and the hop-2
    change-verify, so `auth.ts` tells them apart by base64url-decoding the verification token's
    `requestType` (`getEmailChangeFromToken` — the JWT is already Better-Auth-verified, so no
    signature check / no new dep). On a **change** token: hop-2 uses the dedicated
    **`VerifyNewEmail`** template ("confirm your new address") instead of the sign-up
    `VerifyEmail`; once the change completes, the **old** address gets an out-of-band
    **`EmailChangedNotice`**; and the account's **other sessions are revoked**
    (`auth.api.revokeOtherSessions` keyed to the clicked request's session — the same posture
    `changePassword` takes). A change completion is **not** a first-time verify, so it
    deliberately **skips the Welcome email**. All three degrade gracefully: the sends no-op when
    email is unset, the revoke is best-effort, and `allSettled` keeps any of them from failing
    the verification.
- **Password** — rendered **only when the user has an email/password credential**: the page
  reads the `account` table for a `providerId === "credential"` row; a **social-only** user
  instead gets a pointer to `/forgot-password` (which sets one). `ChangePasswordForm` calls
  `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` —
  a successful rotation signs out the account's other sessions. Shared `changePasswordSchema`
  in `@repo/validators`.
- **Sessions** — an active-sessions list with per-session **Revoke**, a **"Sign out all
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
    for the password card). The **revokes stay on the Better Auth client**
    (`authClient.revokeSession({ token })` / `revokeOtherSessions()`): ownership-checked
    server-side and cookie-cache-proof (`sensitiveSessionMiddleware`). Tokens are the revocation
    credential, so the current row's token is nulled before crossing to the client; other rows'
    tokens must ship (the same shape `authClient.listSessions` itself returns).
  - **Optimistic removal:** on success the card filters the row(s) out of local state and fires
    `router.refresh()` only as background reconciliation — never gate the UI on the refresh
    committing ([core.md → the `router.refresh()` race](core.md#the-next-1629-routerrefresh-race)).
  - **Revocation takes effect within the cookie-cache window:** the revoked device's signed
    session-data cookie stays valid up to `cookieCache.maxAge` (5 min) for plain `getSession`
    reads, then its next DB-backed read finds no row, clears its cookies, and the protected
    shell re-gates (sensitive endpoints reject immediately — they bypass the cookie cache). The
    card copy says so honestly. Regression-guarded by `e2e/account-sessions.spec.ts`, which
    proves the revoked context's authoritative `get-session?disableCookieCache=true` is null and
    that it re-gates to `/login`.
- **Danger zone — account deletion** — `DeleteAccountCard` calls `authClient.deleteUser`
  (enabled by `user.deleteUser` in `auth.ts`, `/delete-user` rate-limited 3/min). Mirrors
  `changeEmail`'s graceful split, but the branch is **per-deployment**, decided at config time:
  - **Email configured** → `sendDeleteAccountVerification` is registered, and Better Auth then
    **always** takes the verification-gated path — even when a valid password is in the body
    (verified in the 1.6.20 source: the callback branch precedes the immediate-delete branch).
    `/delete-user` stores a one-time token (24h, `deleteTokenExpiresIn` default) and emails a
    confirmation link (`DeleteAccount` template); nothing is deleted until it's opened. The link
    completes via `/delete-user/callback`, which requires an **active session in the clicking
    browser** (token must match that session's user) and then redirects to the `callbackURL` the
    card supplied (`/goodbye`).
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
    user-FK table cascades and is FK-indexed: `session`, `account`, `posts`, `uploads`,
    `subscriptions`). The immediate flow then does a **full navigation** to `/goodbye`
    (`window.location.assign` — clears all client state; never gate on `router.refresh()`).
    `afterDelete` emits `console.info("[auth] account.deleted", { userId })` — the audit
    posture, IDs only.
  - **External-resource cleanup:** **Uploadthing files are cleaned up** — `beforeDelete`
    captures the account's storage keys while the `uploads` rows still exist, `afterDelete`
    enqueues the `delete-uploads` job only once the account is actually gone (a deletion that
    fails between the hooks must not purge a live account's files), and the `@repo/jobs` worker
    calls `UTApi.deleteFiles` out-of-band (graceful no-op when Uploadthing is unconfigured).
    **Stripe subscriptions are canceled the same way** — `beforeDelete` captures the user's
    non-terminal subscription ids before the `subscriptions` row cascades away, `afterDelete`
    enqueues the `cancel-stripe-subscriptions` job, and the worker cancels each via its own
    env-gated Stripe client (immediate cancel; Stripe customer kept). Both spelled out in
    [SERVICES.md](../SERVICES.md).
  - Regression-guarded by `e2e/account-deletion.spec.ts` (immediate flow: wrong password gates,
    right password deletes → `/goodbye`, authoritative `get-session` null, sign-in with the
    deleted credentials fails). The verification-gated flow needs a delivered email → live-verified
    instead.
- **Data export — GDPR access right** — the counterpart to deletion's *erasure* right: the
  `exportMyData()` Server Action (`server/actions/data-export.ts`) gathers every row the caller
  owns across the schema (profile · accounts · sessions · posts + revisions · uploads ·
  subscriptions · 2FA · passkeys · org memberships + sent invitations · audit events) and
  returns a redacted JSON bundle the client downloads (the **Download my data** button on the
  Privacy card). All shaping + **redaction** live in a pure, 100%-tested `buildDataExport()`
  (`lib/data-export.ts`) — the action is just the DB shell. Redaction is an **allowlist** (each
  section maps only explicit fields), so secrets can't leak by omission and a future sensitive
  column is excluded by default; the dropped fields are `account.password`/`accessToken`/
  `refreshToken`/`idToken`, `session.token`, `twoFactor.secret`/`backupCodes`, and
  `passkey.publicKey`/`credentialID`. Auth-gated + per-user rate-limited (5/60s via
  `lib/rate-limit`, since a full-account read is heavier and a mild scraping vector, though it
  only ever returns the caller's OWN data). Regression-guarded by `e2e/data-export.spec.ts`
  (a fresh sign-up → download → the real credential account's password hash + the live session
  token are absent).
