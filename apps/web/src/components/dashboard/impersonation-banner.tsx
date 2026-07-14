"use client";

import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { stopImpersonating } from "@/server/actions/admin";

// App-wide banner shown while an admin is impersonating another user (Admin plugin, Tier 4 ·
// Band 4). Rendered by the (dashboard) layout when session.session.impersonatedBy is set; the
// `email` is the impersonated (target) user's — who the app now acts as. Stopping is the
// symmetric session-cookie swap-back (stopImpersonating Server Action) → full navigation back
// to /admin so the admin's restored session loads.
export function ImpersonationBanner({ email }: { email: string }) {
  const t = useTranslations("Dashboard.impersonation");
  const [isPending, startTransition] = useTransition();

  function stop() {
    startTransition(async () => {
      const result = await stopImpersonating();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      window.location.href = "/admin";
    });
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-center text-sm"
    >
      <span>
        {t.rich("impersonating", {
          email,
          bold: (chunks) => <span className="font-medium">{chunks}</span>,
        })}
      </span>
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={stop}>
        {t("stop")}
      </Button>
    </div>
  );
}
