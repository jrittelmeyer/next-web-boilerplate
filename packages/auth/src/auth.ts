import "server-only";
import { passkey } from "@better-auth/passkey";
import { db, recordAuditEvent } from "@repo/db";
import {
  account,
  invitation,
  member,
  organization as organizationTable,
  passkey as passkeyTable,
  rateLimit as rateLimitTable,
  session,
  twoFactor as twoFactorTable,
  user,
  verification,
} from "@repo/db/schema";
import {
  isEmailConfigured,
  sendChangeEmailConfirmationEmail,
  sendDeleteAccountVerificationEmail,
  sendEmailChangedNoticeEmail,
  sendMagicLinkEmail,
  sendNewEmailVerificationEmail,
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@repo/email";
import { enqueue, JOBS } from "@repo/jobs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import {
  admin,
  captcha,
  haveIBeenPwned,
  magicLink,
  organization,
  twoFactor,
} from "better-auth/plugins";
// The pure, env-driven config pieces live in config.ts so they can be unit-tested
// without this module's server-only/DB/email imports (P3-3).
import {
  captchaOptions,
  getEmailChangeFromToken,
  invitationAcceptUrl,
  passkeyRelyingParty,
  socialProviders,
  tokenFromRequest,
  trustedOrigins,
  twoFactorIssuer,
} from "./config";

/**
 * (P2-3) Uploadthing storage keys captured by `deleteUser.beforeDelete`, consumed
 * by `afterDelete` — the read must happen while the `uploads` rows still exist,
 * but the delete-uploads job must only be enqueued once the account is actually
 * gone (a deletion that fails between the hooks must not purge a live account's
 * files). Keyed by user id, so concurrent deletions can't cross; an entry whose
 * afterDelete never runs is a few strings until process restart.
 */
const pendingUploadKeys = new Map<string, string[]>();

/**
 * (A13) Cancelable Stripe subscription ids captured by `deleteUser.beforeDelete`,
 * consumed by `afterDelete` — the same hand-off shape as `pendingUploadKeys` and for
 * the same reason: the `subscriptions` rows cascade away with the user row, so their
 * ids must be read while they still exist, but the cancellation must only be enqueued
 * once the account is actually gone. Keyed by user id. This keeps @repo/auth free of
 * any Stripe env/SDK — the ids ride a job to the worker, which owns the Stripe client.
 */
const pendingStripeCancellations = new Map<string, string[]>();

// Cloudflare Turnstile CAPTCHA options (A12), computed once at module load. undefined
// when TURNSTILE_SECRET_KEY is unset — see the conditional spread in `plugins` below.
const turnstileCaptcha = captchaOptions();

// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment by Better
// Auth automatically; they are validated at the app boundary (apps/web/src/env.ts).
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // The org tables are keyed by the model names Better Auth's organization() plugin
    // uses (`organization`/`member`/`invitation`); the Drizzle export is aliased to
    // organizationTable to avoid clashing with the plugin function of the same name.
    schema: {
      user,
      session,
      account,
      verification,
      organization: organizationTable,
      member,
      invitation,
      // The twoFactor() plugin's model name is `twoFactor`; the Drizzle export is
      // aliased to twoFactorTable to avoid clashing with the plugin function.
      twoFactor: twoFactorTable,
      // Likewise the passkey() plugin's model name is `passkey`; the Drizzle export is
      // aliased to passkeyTable to avoid clashing with the plugin function.
      passkey: passkeyTable,
      // Better Auth's built-in rate-limit storage model is `rateLimit`; the Drizzle export
      // is aliased to rateLimitTable. Only used because rateLimit.storage: "database" is set
      // below — it backs the limiter with the app Postgres so counters survive horizontal
      // scaling / a restart (see the rateLimit block + AUTH.md → Rate limiting).
      rateLimit: rateLimitTable,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Require a verified email before sign-in ONLY when email can actually be
    // sent. With Resend unconfigured (the default), verification is off so the
    // app still signs up / in — otherwise users would be locked out with no way
    // to receive the verification link. Set RESEND_API_KEY + EMAIL_FROM to turn
    // verification on.
    requireEmailVerification: isEmailConfigured(),
    // Password reset: Better Auth generates the token + URL; we render & send.
    // The send helper degrades gracefully when email is unconfigured.
    sendResetPassword: ({ user, url }) =>
      sendPasswordResetEmail({ to: user.email, name: user.name, url }).then(() => undefined),
  },
  emailVerification: {
    // This one callback serves BOTH the sign-up verification and the hop-2
    // verification of an email change (M6). M7 (b): pick the dedicated "confirm your
    // new address" template for a change-email token, keeping the generic VerifyEmail
    // for sign-up. `user.email` is the NEW address in both cases, so it's the right
    // recipient either way; only the copy differs.
    sendVerificationEmail: ({ user, url, token }) =>
      (getEmailChangeFromToken(token)
        ? sendNewEmailVerificationEmail({ to: user.email, name: user.name, url })
        : sendVerificationEmail({ to: user.email, name: user.name, url })
      ).then(() => undefined),
    // Fire the verification email on sign-up. Harmless when email is unconfigured
    // (the helper no-ops and, outside production, logs the link for local dev).
    sendOnSignUp: true,
    // Create the session as soon as the user verifies, so they land signed in.
    autoSignInAfterVerification: true,
    // afterEmailVerification ALSO fires for both events. The clicked /verify-email
    // request still carries the token, so we branch on it (M7 a + c):
    //  - EMAIL-CHANGE completion (hop 2): (a) email the OLD address a courtesy "your
    //    email was changed" notice + (c) revoke the account's OTHER sessions (the
    //    posture changePassword takes). It is NOT a first-time verify, so we
    //    deliberately do NOT send the Welcome email here.
    //  - FIRST-TIME sign-up verify: enqueue the Welcome email — the "real flow" that
    //    wires Step 9's WelcomeEmail. D7 made this a background job (the @repo/jobs
    //    worker renders + sends out-of-band) so the verification callback never blocks
    //    on it; enqueue() is graceful (logs + no-ops if the DB/worker is unavailable).
    // Everything here is graceful: sends no-op when email is unset, the revoke is
    // best-effort, and Promise.allSettled keeps either side from failing verification.
    // See AUTH.md → Account page and SERVICES.md → Background jobs.
    afterEmailVerification: async (user, request) => {
      const change = getEmailChangeFromToken(tokenFromRequest(request));
      if (change) {
        await Promise.allSettled([
          sendEmailChangedNoticeEmail({
            to: change.oldEmail,
            newEmail: user.email,
            name: user.name,
          }),
          revokeOtherSessionsAfterEmailChange(request),
          // Persisted trail (B2). This table is the app's OWN Postgres (already holds
          // user.email), so recording old→new here is safe — unlike the external log
          // sink, which stays IDs-only. Best-effort; allSettled keeps it non-blocking.
          recordAuditEvent({
            action: "user.email_changed",
            actorId: user.id,
            targetId: user.id,
            metadata: { oldEmail: change.oldEmail, newEmail: user.email },
          }),
        ]);
        return;
      }
      await enqueue(JOBS.welcomeEmail, { to: user.email, name: user.name });
    },
  },
  user: {
    // Signed-in email change (M5 → M6), driven by the /account ChangeEmailForm.
    // TWO-HOP for a VERIFIED user (M6, the secure default): sendChangeEmailConfirmation
    // first emails the CURRENT/old address a confirmation link — so the move must be
    // approved from the address that already controls the account before the new address
    // is ever touched (this defends a hijacked session from silently moving the account).
    // Approving it is hop 1; Better Auth then emails the NEW address its own verification
    // (hop 2, reusing emailVerification.sendVerificationEmail → VerifyEmail), and clicking
    // THAT applies the change. updateEmailWithoutVerification keeps the change immediate
    // when there is no verified address to confirm against (e.g. email env unset → users
    // are never verified), so the flow still works with email unconfigured — and the
    // two-hop path never engages there (sendChangeEmailConfirmation requires a verified
    // current email). See AUTH.md → Account page.
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
      sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
        sendChangeEmailConfirmationEmail({ to: user.email, newEmail, name: user.name, url }).then(
          () => undefined,
        ),
    },
    // Account deletion (P2-2), driven by the /account DeleteAccountCard. Mirrors
    // changeEmail's graceful split, but the branch is per-DEPLOYMENT (email configured
    // or not), decided here at config time:
    //  - Email CONFIGURED → sendDeleteAccountVerification is registered, and Better
    //    Auth then ALWAYS takes the verification-gated path: /delete-user stores a
    //    one-time token (24h default) and emails a confirmation link — even when a
    //    valid password is in the body (the password is still verified first, so it
    //    acts as an intent gate on the request; a hijacked session can't even trigger
    //    the email without it). The link completes deletion via
    //    /delete-user/callback, which requires an ACTIVE session in the clicking
    //    browser and redirects to the card's callbackURL.
    //  - Email UNSET → the callback MUST NOT be registered: deletion would otherwise
    //    require a link that can never be delivered. Without it /delete-user deletes
    //    immediately — password-verified when one is supplied (which also skips the
    //    session-freshness gate), else gated on a session younger than
    //    session.freshAge (24h default → SESSION_EXPIRED; the card maps that to
    //    "sign out and back in").
    // DB rows cascade (session/account/posts/uploads/subscriptions FKs). External
    // resources don't: Uploadthing files are cleaned up out-of-band below (P2-3);
    // the Stripe subscription is a documented caveat — see AUTH.md → Danger zone.
    deleteUser: {
      enabled: true,
      // (P2-3) Capture the account's Uploadthing storage keys while the rows still
      // exist — the user-row delete cascades `uploads` away. Enqueuing waits for
      // afterDelete so a deletion that fails between the hooks never triggers a
      // file purge for a still-live account; the Map hands the keys across.
      // Best-effort: a failed read must never block the deletion itself.
      beforeDelete: async (user) => {
        try {
          const rows = await db.query.uploads.findMany({
            columns: { key: true },
            where: (row, { eq }) => eq(row.userId, user.id),
          });
          if (rows.length > 0) {
            pendingUploadKeys.set(
              user.id,
              rows.map((row) => row.key),
            );
          }
        } catch {
          // Graceful — worst case the files stay in storage (the pre-P2-3 status quo).
        }

        // (A13) Capture the account's cancelable Stripe subscription ids while the
        // rows exist — the user-row delete cascades `subscriptions` away. Enqueuing
        // waits for afterDelete (same reason as uploads: never act on a deletion that
        // fails between the hooks). Statuses already terminal (canceled /
        // incomplete_expired) are skipped — nothing to cancel. The handler no-ops when
        // Stripe is unconfigured, so no Stripe env/dep is needed here in @repo/auth.
        try {
          const subs = await db.query.subscriptions.findMany({
            columns: { id: true },
            where: (row, { and, eq, notInArray }) =>
              and(
                eq(row.userId, user.id),
                notInArray(row.status, ["canceled", "incomplete_expired"]),
              ),
          });
          if (subs.length > 0) {
            pendingStripeCancellations.set(
              user.id,
              subs.map((row) => row.id),
            );
          }
        } catch {
          // Graceful — worst case Stripe keeps billing (the pre-A13 status quo).
        }
      },
      ...(isEmailConfigured()
        ? {
            // Inline param type: inside a conditional spread the literal loses
            // BetterAuthOptions' contextual typing, so inference alone would be
            // implicit-any. Narrower than Better Auth's full payload — fine under
            // contravariance (we only read email/name/url).
            sendDeleteAccountVerification: (data: {
              user: { email: string; name: string };
              url: string;
            }) =>
              sendDeleteAccountVerificationEmail({
                to: data.user.email,
                name: data.user.name,
                url: data.url,
              }).then(() => undefined),
          }
        : {}),
      // Deletion is audit-worthy (P1-7 posture). IDs only — no email PII in the
      // sink; console = stdout, the packages-layer path into the same log pipeline.
      // Then hand the captured storage keys to the delete-uploads job (D7 pattern —
      // the same reason the welcome email is a job: never block an auth flow on an
      // external service). enqueue() is graceful; if the worker is down the job
      // waits in pgboss.job, and the handler no-ops when Uploadthing is unset.
      afterDelete: async (user) => {
        console.info("[auth] account.deleted", { userId: user.id });
        // Persisted trail (B2). Written here, in afterDelete, precisely because the
        // `user` row is already gone — which is why audit_log.actor/target are FK-less
        // text (an FK insert would fail its own constraint). Best-effort by contract.
        await recordAuditEvent({ action: "user.deleted", actorId: user.id, targetId: user.id });
        const keys = pendingUploadKeys.get(user.id);
        pendingUploadKeys.delete(user.id);
        if (keys && keys.length > 0) {
          await enqueue(JOBS.deleteUploads, { userId: user.id, keys });
        }
        // (A13) Hand the captured subscription ids to the cancel-stripe-subscriptions
        // job — same D7 posture as the uploads cleanup: the worker (which owns the
        // Stripe client) cancels out-of-band so the deletion never blocks on Stripe.
        const subscriptionIds = pendingStripeCancellations.get(user.id);
        pendingStripeCancellations.delete(user.id);
        if (subscriptionIds && subscriptionIds.length > 0) {
          await enqueue(JOBS.cancelStripeSubscriptions, { userId: user.id, subscriptionIds });
        }
      },
    },
  },
  session: {
    // Cache the session in a short-lived signed cookie so getSession() can skip a
    // DB round-trip on most requests. Reads may be up to maxAge stale; pass
    // { query: { disableCookieCache: true } } when you need an authoritative read
    // (e.g. right after a role/permission change).
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Persist a sign-in to the audit trail (B2). A session ROW is created on every
  // genuine sign-in (email/OAuth, and after a 2FA challenge); a cookie-cache refresh
  // reuses the existing row rather than inserting, so this fires on real sign-ins, not
  // idle refreshes. It's the one audit event with no pre-existing log line — the others
  // (role change / deletion / email change) upgrade an emit site that already existed.
  // Best-effort by contract: recordAuditEvent swallows its own failures, so a slow or
  // down audit write can never block a login. IP/UA come off the session row (dropped
  // from the jsonb when absent). See AUTH.md → Audit log.
  databaseHooks: {
    session: {
      create: {
        after: (session) =>
          recordAuditEvent({
            action: "user.signed_in",
            actorId: session.userId,
            targetId: session.userId,
            metadata: {
              ip: session.ipAddress ?? undefined,
              userAgent: session.userAgent ?? undefined,
            },
          }),
      },
    },
  },
  // Explicit, documented rate limiting for auth endpoints (Better Auth's built-in
  // limiter; defaults to in-memory + production-only). enabled:true turns it on in
  // every environment; the customRules tighten the sensitive endpoints.
  // storage: "database" backs the limiter with the app Postgres (the `rate_limit`
  // table, registered in the drizzleAdapter schema above) instead of per-instance
  // memory — so the counters are SHARED across instances and SURVIVE a restart, the
  // one thing in-memory can't do before horizontal scaling. The DB path uses an
  // atomic check-and-increment, so enforcement stays strict across instances; no new
  // service and it works with env unset (Postgres is already required). For higher
  // throughput, wire Better Auth `secondaryStorage` (Redis/Upstash) and it takes over
  // as the limiter store automatically — see AUTH.md → Rate limiting.
  // App-level rate limiting (webhook / Server Actions / tRPC) is Step 20.
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
      "/change-email": { window: 60, max: 3 },
      "/delete-user": { window: 60, max: 3 },
      // Magic link (path-to-100 #6). The send endpoint is an unauthenticated,
      // email-keyed trigger — the same abuse/enumeration surface as
      // /request-password-reset, so it gets the same tightest bucket (this customRule
      // overrides the plugin's own 5/min default). Verify consumes a single-use token
      // (atomic, not brute-forceable), so its cap is abuse-limiting only.
      "/sign-in/magic-link": { window: 60, max: 3 },
      "/magic-link/verify": { window: 60, max: 10 },
      // Two-factor (Tier 4 · Band 2): tighten the sensitive endpoints. enable/disable
      // are password-gated state changes; verify-totp / verify-backup-code are the
      // brute-forceable sign-in challenge, so they get the tightest bucket.
      "/two-factor/enable": { window: 60, max: 3 },
      "/two-factor/disable": { window: 60, max: 3 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 },
      // Passkeys / WebAuthn (Tier 4 · Band 3). Unlike the 6-digit TOTP challenge, a passkey
      // assertion is CRYPTOGRAPHIC — not brute-forceable — so these caps are abuse-limiting,
      // not brute-force defense; kept generous enough that a user fumbling an authenticator
      // prompt (cancel/retry) isn't blocked. generate-authenticate-options is the one
      // unauthenticated entry point (starts a sign-in), so it's bounded too.
      "/passkey/generate-register-options": { window: 60, max: 10 },
      "/passkey/verify-registration": { window: 60, max: 10 },
      "/passkey/generate-authenticate-options": { window: 60, max: 10 },
      "/passkey/verify-authentication": { window: 60, max: 10 },
      "/passkey/delete-passkey": { window: 60, max: 10 },
      "/passkey/update-passkey": { window: 60, max: 10 },
      // Admin plugin (Tier 4 · Band 4). These endpoints are already admin-gated (not an
      // anonymous brute-force surface), so the caps are abuse-limiting for a compromised or
      // misbehaving admin session, not a login defense — kept generous enough for genuine
      // bulk operator work. set-role/ban/unban are privileged state changes; impersonate
      // starts a session swap; stop-impersonating is the safe exit (loosest).
      "/admin/set-role": { window: 60, max: 20 },
      "/admin/ban-user": { window: 60, max: 20 },
      "/admin/unban-user": { window: 60, max: 20 },
      "/admin/impersonate-user": { window: 60, max: 10 },
      "/admin/stop-impersonating": { window: 60, max: 30 },
    },
  },
  trustedOrigins: trustedOrigins(),
  socialProviders: socialProviders(),
  // haveIBeenPwned rejects known-breached passwords on the password-setting paths
  // (/sign-up/email, /change-password, /reset-password by default) via the HIBP
  // range API — a k-anonymity SHA-1-prefix lookup, so no secret and no full password
  // ever leaves the server. Always on: it needs no env, and unlike the env-gated
  // integrations there's nothing to configure. Note it fails CLOSED — if HIBP is
  // unreachable the password op errors rather than silently accepting an unchecked
  // password (the secure posture); see AUTH.md → Compromised-password check.
  // nextCookies() must be the LAST plugin so it can flush Set-Cookie headers written
  // during Server Actions. Keep new plugins above it.
  plugins: [
    haveIBeenPwned(),
    // Organizations / multi-tenancy (Tier 4 · Band 4). Default access-control roles
    // owner/admin/member (the creator is `owner`); teams + dynamic runtime roles left
    // off (documented one-flag upgrades). The tables are hand-maintained in @repo/db
    // and passed to the drizzleAdapter above. sendInvitationEmail renders the invite
    // via @repo/email and degrades gracefully: with email unset it no-ops, but the
    // invitation row still exists so the members UI can surface a copyable accept link
    // (invitationAcceptUrl points at the app's /accept-invitation/[id] route).
    organization({
      sendInvitationEmail: (data) =>
        sendOrganizationInvitationEmail({
          to: data.email,
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name,
          role: data.role,
          url: invitationAcceptUrl(data.id),
        }).then(() => undefined),
    }),
    // Two-factor auth (Tier 4 · Band 2) — opt-in per user, always available (no env
    // needed, so it never gates the "runs with env unset" contract and doesn't change
    // sign-in for users who haven't enrolled). Adds the two_factor table + user
    // .twoFactorEnabled (hand-maintained in @repo/db, registered in the drizzleAdapter
    // schema above) and the /two-factor/* endpoints (enable/disable require the
    // password; verify-totp/verify-backup-code complete the sign-in challenge). `issuer`
    // is the label authenticator apps show — derived from the app hostname. The matching
    // twoFactorClient() lives in client.ts. See AUTH.md → Two-factor authentication.
    twoFactor({ issuer: twoFactorIssuer() }),
    // Passkeys / WebAuthn (Tier 4 · Band 3) — opt-in per user, always available (no env
    // needed, so it never gates the "runs with env unset" contract and doesn't change sign-in
    // for users who haven't registered one). Lives in its OWN package (@better-auth/passkey)
    // because it pulls the @simplewebauthn libs; pinned in lockstep with better-auth core.
    // Adds the passkey table (hand-maintained in @repo/db, registered in the drizzleAdapter
    // schema above) and the /passkey/* endpoints (register/authenticate/list/delete/update).
    // rpID/rpName/origin are derived from BETTER_AUTH_URL (passkeyRelyingParty) — WebAuthn is
    // same-origin, so no new CSP origin. The matching passkeyClient() lives in client.ts.
    // Passkeys are ADDITIVE here (they supplement password/OAuth), so deleting one can't lock
    // a user out. See AUTH.md → Passkeys / WebAuthn.
    passkey(passkeyRelyingParty()),
    // Admin plugin (Tier 4 · Band 4) — the heavier RBAC upgrade path, adopted to AUGMENT
    // (not replace) the hand-rolled role model: the app keeps `lib/rbac.ts`'s fresh-DB
    // `requireAdmin`/`adminProcedure` + the audited `setUserRole` action as the
    // authoritative authorization boundary and role-setter, and takes the plugin for the
    // capabilities it uniquely adds — user BAN (revokes sessions + blocks sign-in) and
    // IMPERSONATION. It manages the existing `user.role` column and adds
    // `user.banned/banReason/banExpires` + `session.impersonatedBy` (schema hand-maintained
    // in @repo/db, migration 0014). `adminRoles: ["admin"]` matches our ROLES set exactly,
    // so the plugin's default access-control roles (admin/user) fit with no custom `ac`.
    // KNOWN TRADE-OFF: every /admin/* endpoint authorizes off the SESSION role
    // (getSessionFromCtx), which the Step-19 cookieCache can leave up to 5 min stale. So the
    // boilerplate's BAN UI does NOT call the plugin's ban endpoint — banUser/unbanUser
    // (server/actions/admin.ts) gate with the fresh-DB requireAdmin() and write the ban
    // columns directly; the plugin's own session.create hook (which reads `banned` fresh)
    // still enforces the ban at sign-in. IMPERSONATION stays on the plugin (a session-cookie
    // swap only it can do), so that one carries the ≤5-min session-role window as a
    // documented residual (see DECISIONS.md → Admin plugin / SECURITY.md). Defaults suit us:
    // defaultRole "user", impersonation 1h, and allowImpersonatingAdmins stays false (an
    // admin can't impersonate another admin). Client mirror: adminClient() in client.ts.
    admin({ adminRoles: ["admin"] }),
    // Bot protection — Cloudflare Turnstile CAPTCHA (A12). CONDITIONALLY registered:
    // only when TURNSTILE_SECRET_KEY is set (captchaOptions() → undefined otherwise), so
    // the default env-unset app never registers it. This is required, not just tidy — the
    // plugin's onRequest throws MISSING_SECRET_KEY (→ 500) on its protected endpoints if
    // registered with an empty secret, which would break sign-up/sign-in. It gates
    // /sign-up/email, /sign-in/email and /request-password-reset (the plugin defaults),
    // reading the client widget's token from the `x-captcha-response` header and verifying
    // it against Cloudflare's siteverify server-side (no secret reaches the browser). The
    // matching site key is NEXT_PUBLIC_TURNSTILE_SITE_KEY, mirrored in the (auth) forms.
    //
    // Placed here — LAST before nextCookies() — on purpose: a conditional spread degrades
    // every plugin AFTER it from a fixed tuple position to a loose array element, which
    // would erase the twoFactor/admin/organization $Infer augmentations on Session/User.
    // Keeping it after all inference-contributing plugins preserves their tuple positions,
    // and it still leaves nextCookies() genuinely last at runtime (the spread is empty when
    // unconfigured). See config.ts captchaOptions() + AUTH.md → Bot protection / CAPTCHA.
    ...(turnstileCaptcha ? [captcha(turnstileCaptcha)] : []),
    // Magic-link sign-in (path-to-100 #6, promoting the A18 recipe). CONDITIONALLY
    // registered on the same gate as requireEmailVerification: a sign-in link that can
    // never be delivered must never be offered, so with email unset the endpoints
    // don't exist and the login page hides the affordance (it reads the same gate).
    // Defaults kept: 5-minute single-use tokens (stored in the existing `verification`
    // model — no new table) and sign-up-via-link ON (an unknown address gets an
    // account; the link click inherently verifies it, and a constant "check your
    // email" response avoids account enumeration — set `disableSignUp: true` to keep
    // account creation on the signup form only). Sits BELOW the captcha spread by the
    // same tuple-position reasoning as above (neither conditional plugin contributes
    // $Infer augmentations, so only their position relative to the plugins ABOVE
    // matters); when both are configured, captchaOptions() lists /sign-in/magic-link
    // so the send endpoint is also bot-protected. See AUTH.md → Magic link.
    ...(isEmailConfigured()
      ? [
          magicLink({
            sendMagicLink: async ({ email, url }) => {
              await sendMagicLinkEmail({ to: email, url });
            },
          }),
        ]
      : []),
    nextCookies(),
  ],
});

/**
 * (M7 c) Revoke the account's OTHER sessions after a completed email change —
 * defense-in-depth mirroring `changePassword({ revokeOtherSessions: true })`. The
 * clicked `/verify-email` request carries the user's session cookie, which Better
 * Auth's `revokeOtherSessions` uses to identify (and KEEP) the current session while
 * dropping the rest. Best-effort: if the request has no current session (e.g. the link
 * was opened in a browser where the user isn't signed in) it throws UNAUTHORIZED, which
 * we swallow — there's simply nothing to keep/revoke. Never breaks the verification.
 */
async function revokeOtherSessionsAfterEmailChange(request: Request | undefined): Promise<void> {
  if (!request) return;
  try {
    await auth.api.revokeOtherSessions({ headers: request.headers });
  } catch {
    // No current session on the clicked request, or revoke unavailable — graceful no-op.
  }
}

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
