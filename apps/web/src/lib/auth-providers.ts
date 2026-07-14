import "server-only";
import { env } from "@/env";

/**
 * Which OAuth providers are fully configured (both client id AND secret present).
 * Detected server-side and handed to the (auth) forms so a social button renders ONLY
 * for a provider that can actually complete a sign-in — no dead buttons. This mirrors
 * the same gate `socialProviders()` uses in `@repo/auth` (auth.ts), keeping the UI and
 * the server in lockstep. The resolved provider NAMES are safe to send to the client;
 * the secrets never leave the server (this module is `server-only`, and the client
 * imports only the `OAuthProvider` type, which is erased at build).
 */
export const OAUTH_PROVIDERS = ["github", "google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function configuredOAuthProviders(): OAuthProvider[] {
  const configured: OAuthProvider[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) configured.push("github");
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) configured.push("google");
  return configured;
}
