"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";

// Client half of /accept-invitation/[id]. The server page validates the invitation and
// only mounts this for a pending, valid one; here we branch on the caller's auth state:
//
//   • signed out              → prompt sign-in/up AS the invited email, returning here
//   • signed in, email match  → Accept → acceptInvitation → setActive → /organization
//   • signed in, wrong email  → explain the mismatch, offer to switch account
//
// acceptInvitation identifies the user by their session and requires the address to match
// the invite server-side, so this UI gating is UX only. On success we make the joined org
// the active workspace so the next request (and post.list) scopes to it.
export function AcceptInvitationClient({
  invitationId,
  organizationId,
  invitedEmail,
  orgName,
  signedInEmail,
}: {
  invitationId: string;
  organizationId: string;
  invitedEmail: string;
  orgName: string;
  signedInEmail: string | null;
}) {
  const t = useTranslations("Organization.accept");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = `/accept-invitation/${invitationId}`;
  const emailMatches =
    signedInEmail !== null && signedInEmail.toLowerCase() === invitedEmail.toLowerCase();

  async function accept() {
    setError(null);
    setPending(true);
    const { error: err } = await authClient.organization.acceptInvitation({ invitationId });
    if (err) {
      setPending(false);
      setError(err.message ?? t("error"));
      return;
    }
    // Make the newly joined org the active workspace, then land on its manage page.
    await authClient.organization.setActive({ organizationId });
    router.push("/organization");
    router.refresh();
  }

  async function switchAccount() {
    // Sign out, then send them to sign in as the invited address and return here.
    await authClient.signOut();
    router.push(`/login?redirectTo=${encodeURIComponent(returnTo)}`);
    router.refresh();
  }

  const strong = (chunks: React.ReactNode) => (
    <span className="font-medium text-foreground">{chunks}</span>
  );

  if (signedInEmail === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t.rich("signInPrompt", { email: invitedEmail, strong })}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href={`/login?redirectTo=${encodeURIComponent(returnTo)}`}>{t("signIn")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/signup?redirectTo=${encodeURIComponent(returnTo)}`}>
              {t("createAccount")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!emailMatches) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t.rich("mismatch", { invited: invitedEmail, signedIn: signedInEmail, strong })}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void switchAccount()}
          >
            {t("switchAccount")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t.rich("acceptPrompt", { email: signedInEmail, org: orgName, strong })}
      </p>
      <div>
        <Button type="button" disabled={pending} onClick={() => void accept()}>
          {pending ? t("joining") : t("accept")}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
