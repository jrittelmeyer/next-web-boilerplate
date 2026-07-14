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
import { toast } from "@repo/ui/components/sonner";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

export type SessionRow = {
  id: string;
  /** Revocation credential for OTHER sessions; null for the current one (never shipped). */
  token: string | null;
  /** Human label from describeUserAgent — "Chrome on Windows". */
  device: string;
  /** Full raw UA for the title tooltip; null when the sign-in recorded none. */
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  isCurrent: boolean;
};

// Active-sessions list + revoke (P2-1). The LIST is server-rendered (the page reads
// the session table directly — Better Auth's /list-sessions 403s for sessions older
// than freshAge; see AUTH.md); the REVOKES go through the Better Auth client (the C1
// convention), whose endpoints re-check ownership server-side and read the session
// cookie-cache-proof. On success the row is removed OPTIMISTICALLY (the D1 posts
// convention) and router.refresh() reconciles server truth in the background — the
// UI must not gate on the refresh committing, because a refresh raced right after
// the fetch intermittently never commits (Next 16.2.9; payload arrives, commit
// doesn't — reproduced across prod builds, so the local filter is the UI's truth).
// The revoke outcome surfaces as a toast (A1).
export function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  // Which revoke is in flight: a session id, "others", or none.
  const [pending, setPending] = useState<string | null>(null);
  // Rows already revoked in this mounted card, filtered out regardless of whether
  // the background refresh has re-rendered the server list yet.
  const [revokedIds, setRevokedIds] = useState<ReadonlySet<string>>(new Set());
  const busy = pending !== null;

  const visible = sessions.filter((s) => !revokedIds.has(s.id));
  const others = visible.filter((s) => !s.isCurrent);

  async function revoke(
    key: string,
    ids: string[],
    successMessage: string,
    call: () => Promise<{ error: { message?: string } | null }>,
  ) {
    setPending(key);
    const { error } = await call();
    if (error) {
      toast.error(error.message ?? "Could not revoke the session.");
      setPending(null);
      return;
    }
    setRevokedIds((prev) => new Set([...prev, ...ids]));
    setPending(null);
    toast.success(successMessage);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          Devices currently signed in to your account. Revoking one signs that device out; pages it
          already has open may take a few minutes to notice.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {visible.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium" title={s.userAgent ?? undefined}>
                  {s.device}
                  {s.isCurrent ? (
                    <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      Current session
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {s.ipAddress || "IP unknown"} · signed in {s.createdAt.toLocaleString()} · last
                  active {s.updatedAt.toLocaleString()}
                </span>
              </div>
              {s.isCurrent || s.token === null ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const token = s.token;
                    if (token) {
                      void revoke(s.id, [s.id], "Session revoked.", () =>
                        authClient.revokeSession({ token }),
                      );
                    }
                  }}
                >
                  {pending === s.id ? "Revoking…" : "Revoke"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 ? (
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void revoke(
                  "others",
                  others.map((o) => o.id),
                  "Signed out all other sessions.",
                  () => authClient.revokeOtherSessions(),
                )
              }
            >
              {pending === "others" ? "Signing out…" : "Sign out all other sessions"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
