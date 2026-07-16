"use client";

import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createBillingPortalSession } from "@/server/actions/billing";

type Status = { kind: "idle" } | { kind: "error"; message: string } | { kind: "redirecting" };

// P2-4b: same action-call-then-redirect shape as SubscribeButton — the portal is
// Stripe-hosted, so there's no client SDK; the action returns a short-lived URL.
export function ManageBillingButton() {
  const t = useTranslations("Billing.manage");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onManage() {
    setStatus({ kind: "idle" });
    const result = await createBillingPortalSession();
    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      return;
    }

    setStatus({ kind: "redirecting" });
    window.location.href = result.data.url;
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onManage}
        disabled={status.kind === "redirecting"}
      >
        {status.kind === "redirecting" ? t("redirecting") : t("button")}
      </Button>
      {status.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
