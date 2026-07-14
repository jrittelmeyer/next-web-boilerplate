import type { CloudflareTurnstileOptions } from "better-auth/plugins";
import type { BetterAuthOptions } from "better-auth/types";

/**
 * Pure, env-driven pieces of the Better Auth configuration (P3-3). Everything here
 * is deterministic given process.env / its arguments — no DB, no email, no
 * `server-only` — so it can be unit-tested in a plain node environment (see
 * config.test.ts); auth.ts composes these into the real `betterAuth()` call.
 */

/**
 * OAuth providers are wired but opt-in: each is registered only when both its
 * client id and secret are present in the environment, so the boilerplate runs
 * with email/password alone and lights up a provider the moment you add creds.
 */
export function socialProviders(): BetterAuthOptions["socialProviders"] {
  const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    };
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  return providers;
}

/**
 * Origins Better Auth accepts for CSRF / redirect validation. The canonical app
 * URL (BETTER_AUTH_URL) is always trusted; extra origins (a separate frontend
 * domain, mobile deep links, preview deploys) can be added via a comma-separated
 * AUTH_TRUSTED_ORIGINS. Read from process.env directly — packages can't import the
 * app's env.ts (same pattern as socialProviders / @repo/db).
 */
export function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  origins.add(baseUrl);

  for (const origin of (process.env.AUTH_TRUSTED_ORIGINS ?? "").split(",")) {
    const trimmed = origin.trim();
    if (trimmed) origins.add(trimmed);
  }

  return [...origins];
}

/**
 * Decode a Better Auth email-verification token to recover the email change it
 * carries. The token is a signed JWT that Better Auth has ALREADY verified before any
 * of our callbacks run, so we only base64url-decode the payload (no signature check,
 * no secret, no dependency) to read its claims. Returns `{ oldEmail, newEmail }` ONLY
 * for a hop-2 `change-email-verification` token; `null` for a first-time sign-up
 * verification — or anything unparseable (graceful). This single signal drives all
 * three M7 behaviors: the hop-2 template choice (sendVerificationEmail) and the
 * old-address notice + session revocation (afterEmailVerification).
 */
export function getEmailChangeFromToken(
  token: string | undefined,
): { oldEmail: string; newEmail: string } | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      updateTo?: string;
      requestType?: string;
    };
    if (claims.requestType !== "change-email-verification" || !claims.email || !claims.updateTo) {
      return null;
    }
    return { oldEmail: claims.email, newEmail: claims.updateTo };
  } catch {
    return null;
  }
}

/**
 * Build the app URL a recipient clicks to accept an organization invitation. The
 * `organization()` plugin doesn't mint a token-URL for invitations (unlike email
 * verification), so `sendInvitationEmail` constructs the link from the invitation id.
 * Uses BETTER_AUTH_URL (the canonical app origin, always a trusted origin) with the
 * same localhost fallback as `trustedOrigins()`, read from process.env directly —
 * packages can't import the app's env.ts. The path matches the app's accept route
 * (`/accept-invitation/[id]`); a trailing slash on the base is trimmed so the URL
 * never doubles up.
 */
export function invitationAcceptUrl(invitationId: string): string {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/accept-invitation/${invitationId}`;
}

/**
 * The issuer label shown in an authenticator app (Google Authenticator, 1Password, …)
 * next to the 2FA code — the Better Auth `twoFactor()` plugin embeds it in the enrollment
 * `otpauth://` URI. Derived from BETTER_AUTH_URL's hostname (the canonical app origin) so
 * it's meaningful with zero extra config: `app.example.com` in production, `localhost` in
 * dev. Read from process.env directly (packages can't import the app's env.ts), same
 * localhost fallback as `trustedOrigins()`. A fork wanting a brand name (e.g. "Acme")
 * instead of the hostname changes it here.
 */
export function twoFactorIssuer(): string {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "localhost";
  }
}

/**
 * Relying-party configuration for the Better Auth `passkey()` (WebAuthn) plugin, derived
 * entirely from BETTER_AUTH_URL — no new env var, so passkeys never gate the "runs with env
 * unset" contract (same posture as `twoFactorIssuer`). WebAuthn is a same-origin browser API,
 * so there's nothing to allowlist in CSP either.
 *
 *  - `rpID`   — the relying-party id, the app's registrable domain (hostname WITHOUT port or
 *               scheme): `localhost` in dev, `app.example.com` in prod. Passkeys are scoped to
 *               this id, so it must be stable across deploys of the same app.
 *  - `rpName` — the human title shown by the platform's passkey UI. Derived from the hostname
 *               for zero-config meaning (consistent with `twoFactorIssuer`); a fork wanting a
 *               brand name (e.g. "Acme") changes it here.
 *  - `origin` — the exact origin the browser will report during register/authenticate; pinned
 *               to BETTER_AUTH_URL (trailing slash trimmed — the plugin rejects one). It must
 *               MATCH the origin the app is actually served from, so run the app at
 *               BETTER_AUTH_URL (this is why a :3100 prod-verify overrides BETTER_AUTH_URL).
 *
 * Read from process.env directly — packages can't import the app's env.ts (same pattern as
 * `trustedOrigins` / `twoFactorIssuer`). Falls back to the localhost defaults on a malformed URL.
 */
export function passkeyRelyingParty(): { rpID: string; rpName: string; origin: string } {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const origin = baseUrl.replace(/\/$/, "");
  try {
    const { hostname } = new URL(baseUrl);
    return { rpID: hostname, rpName: hostname, origin };
  } catch {
    return { rpID: "localhost", rpName: "localhost", origin: "http://localhost:3000" };
  }
}

/**
 * Whether the Cloudflare Turnstile CAPTCHA is configured — i.e. the server has a
 * secret to verify tokens against. Gates BOTH the plugin registration (auth.ts) and,
 * mirrored on the app side by NEXT_PUBLIC_TURNSTILE_SITE_KEY, the widget render: with
 * the secret unset the captcha() plugin is left OUT entirely, so the protected
 * endpoints (/sign-up/email, /sign-in/email, /request-password-reset) behave exactly
 * as before (the plugin's onRequest throws MISSING_SECRET_KEY → 500 on those paths if
 * registered with an empty secret, so conditional registration is REQUIRED for the
 * "runs with env unset" contract). Read from process.env directly — packages can't
 * import the app's env.ts (same pattern as socialProviders / passkeyRelyingParty).
 */
export function isCaptchaConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Build the Better Auth `captcha()` options for Cloudflare Turnstile, or `undefined`
 * when unconfigured (so auth.ts can conditionally spread it into the plugins array).
 * Provider is fixed to cloudflare-turnstile; `endpoints` is omitted so the plugin's
 * defaults apply (/sign-up/email, /sign-in/email, /request-password-reset). The token
 * arrives in the `x-captcha-response` request header (set by the client widget) and is
 * verified server-side against Cloudflare's siteverify — no secret ever reaches the
 * browser. A fork can tighten it further with `allowedHostnames` / `expectedAction`.
 */
export function captchaOptions(): CloudflareTurnstileOptions | undefined {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return undefined;
  return { provider: "cloudflare-turnstile", secretKey };
}

/**
 * Pull the verification token from a clicked `/verify-email` request URL.
 * `afterEmailVerification` receives the Request but not the token directly, so we read
 * it back off the query string. Graceful: `undefined` when there's no parseable token.
 */
export function tokenFromRequest(request: Request | undefined): string | undefined {
  if (!request) return undefined;
  try {
    return new URL(request.url).searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}
