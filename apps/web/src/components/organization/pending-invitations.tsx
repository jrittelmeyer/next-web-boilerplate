"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export type OrgInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
};

// Pending invitations for the active organization (Tier 4 · Band 4). The list is the
// reactive useActiveOrganization().invitations (refetched after invite / cancel). Every
// row exposes a COPYABLE accept link — the graceful-degradation path when email is off:
// the invitation row exists even though no mail was sent, so sharing the link is how the
// invitee reaches /accept-invitation/[id] (mirrors the sign-up verification-link posture).
// The link is built from the live origin in the browser. Canceling hides the row
// optimistically; Better Auth re-checks that the caller may cancel.
export function PendingInvitations({
  invitations,
  canManage,
}: {
  invitations: OrgInvitation[];
  canManage: boolean;
}) {
  const t = useTranslations("Organization.invitations");
  const format = useFormatter();
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = invitations.filter(
    (invitation) => invitation.status === "pending" && !removedIds.has(invitation.id),
  );

  async function copyLink(invitation: OrgInvitation) {
    setError(null);
    const url = `${window.location.origin}/accept-invitation/${invitation.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invitation.id);
      setTimeout(
        () => setCopiedId((current) => (current === invitation.id ? null : current)),
        2000,
      );
    } catch {
      // Clipboard blocked (permissions / insecure context) — surface the link so it can
      // still be copied by hand rather than failing silently.
      setError(url);
    }
  }

  async function cancel(invitation: OrgInvitation) {
    setError(null);
    setPendingId(invitation.id);
    const { error: err } = await authClient.organization.cancelInvitation({
      invitationId: invitation.id,
    });
    setPendingId(null);
    if (err) {
      setError(err.message ?? t("errorCancel"));
      return;
    }
    setRemovedIds((prev) => new Set([...prev, invitation.id]));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{invitation.email}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="capitalize">{invitation.role}</span> ·{" "}
                    {t("expires", { date: format.dateTime(invitation.expiresAt, "dateOnly") })}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyLink(invitation)}
                  >
                    {copiedId === invitation.id ? t("copied") : t("copyLink")}
                  </Button>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pendingId === invitation.id}
                      onClick={() => void cancel(invitation)}
                    >
                      {pendingId === invitation.id ? t("canceling") : t("cancel")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p className="text-sm break-all text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
