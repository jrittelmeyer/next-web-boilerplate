import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// No baseURL: the client targets the current origin, which is correct for a
// same-origin Next.js app. Set one only when the auth server lives elsewhere.
// organizationClient() mirrors the server's organization() plugin so the client
// exposes the typed `authClient.organization.*` methods (create / setActive /
// inviteMember / acceptInvitation / …) with the default owner/admin/member roles.
// twoFactorClient() mirrors the server's twoFactor() plugin, exposing typed
// `authClient.twoFactor.*` methods (enable / disable / verifyTotp / verifyBackupCode /
// generateBackupCodes). No onTwoFactorRedirect handler is set: the login form inspects
// the sign-in response's `twoFactorRedirect` flag inline and renders the code-entry step
// itself (rather than a global redirect), so the challenge stays on one page.
// passkeyClient() mirrors the server's passkey() plugin, exposing typed
// `authClient.passkey.*` (addPasskey / listUserPasskeys / deletePasskey / updatePasskey)
// and `authClient.signIn.passkey(...)`. Each wraps the browser WebAuthn create/get calls
// around the /passkey/* option+verify endpoints, so callers never touch navigator.credentials.
// adminClient() mirrors the server's admin() plugin, exposing typed `authClient.admin.*`
// (listUsers / setRole / banUser / unbanUser / impersonateUser / stopImpersonating / …).
// The boilerplate's ban UI goes through fresh-gated + audited Server Actions rather than
// these client methods (see auth.ts admin() comment); impersonation, being a session-cookie
// swap the client plugin is built to manage (it flips $sessionSignal to refetch useSession),
// uses the client method. The client roles (admin/user) mirror the server's default AC.
export const authClient = createAuthClient({
  plugins: [organizationClient(), twoFactorClient(), passkeyClient(), adminClient()],
});

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } =
  authClient;
