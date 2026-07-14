"use client";

import { Button } from "@repo/ui/components/button";
import { useState } from "react";
import { createCheckoutSession } from "@/server/actions/billing";

type Status = { kind: "idle" } | { kind: "error"; message: string } | { kind: "redirecting" };

export function SubscribeButton() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubscribe() {
    setStatus({ kind: "idle" });
    const result = await createCheckoutSession();
    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      return;
    }

    // Hosted Checkout: redirect the browser to Stripe's page (no client SDK).
    setStatus({ kind: "redirecting" });
    window.location.href = result.data.url;
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={onSubscribe} disabled={status.kind === "redirecting"}>
        {status.kind === "redirecting" ? "Redirecting…" : "Subscribe"}
      </Button>
      {status.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
