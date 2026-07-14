"use client";

import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { useTransition } from "react";
import { impersonateUser } from "@/server/actions/admin";

// Per-row "Impersonate" control for the admin user list (Admin plugin, Tier 4 · Band 4).
// Impersonation is a session-cookie swap (via the impersonateUser Server Action), so on
// success we do a FULL navigation — window.location, not the client router — to reload the
// app under the swapped session. Not rendered for the caller's own row (you can't impersonate
// yourself) nor for other admins (allowImpersonatingAdmins stays false → the endpoint would
// refuse; don't offer a button that always errors). The app-wide ImpersonationBanner then
// provides the "Stop impersonating" exit.
export function ImpersonateControl({
  userId,
  role,
  currentUserId,
}: {
  userId: string;
  role: string;
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();

  if (userId === currentUserId || role === "admin") return null;

  function run() {
    startTransition(async () => {
      const result = await impersonateUser({ userId });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      // The swapped session cookie is set; a full load re-reads it everywhere.
      window.location.href = "/dashboard";
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={run}>
      Impersonate
    </Button>
  );
}
