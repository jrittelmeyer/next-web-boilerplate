"use client";

import { Button } from "@repo/ui/components/button";
import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { useState } from "react";
import { logExampleEvent } from "@/server/actions/observability";

interface ObservabilityDemoProps {
  // Resolved on the server (see the page) so the flag never flickers client-side.
  exampleFlag: boolean | "unconfigured";
}

export function ObservabilityDemo({ exampleFlag }: ObservabilityDemoProps) {
  const t = useTranslations("Observability.demo");
  const [status, setStatus] = useState<string | null>(null);
  const [throwOnRender, setThrowOnRender] = useState(false);

  // Throwing during render (not in the click handler) is what propagates to the
  // nearest app/error.tsx boundary — handler throws are swallowed by React.
  if (throwOnRender) {
    throw new Error("Observability demo: test render error (error boundary check)");
  }

  // Sentry: capture a handled exception. No-op (just clears status) when
  // NEXT_PUBLIC_SENTRY_DSN is unset — the SDK initialized disabled.
  function captureError() {
    Sentry.captureException(new Error("Observability demo: test client exception"));
    setStatus(t("statusSentry"));
  }

  // BetterStack: structured server log via a Server Action.
  async function sendLog() {
    const result = await logExampleEvent();
    setStatus("error" in result ? t("statusLogFailed", { error: result.error }) : t("statusLog"));
  }

  // PostHog: capture a custom analytics event. Queued/no-op without a key.
  function captureEvent() {
    posthog.capture("observability_demo_event", { source: "observability-demo" });
    setStatus(t("statusPosthog"));
  }

  const flagLabel =
    exampleFlag === "unconfigured"
      ? t("flagUnconfigured")
      : exampleFlag
        ? t("flagOn")
        : t("flagOff");

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" onClick={captureError}>
        {t("captureError")}
      </Button>
      <Button type="button" variant="outline" onClick={sendLog}>
        {t("sendLog")}
      </Button>
      <Button type="button" variant="outline" onClick={captureEvent}>
        {t("captureEvent")}
      </Button>
      <Button type="button" variant="destructive" onClick={() => setThrowOnRender(true)}>
        {t("throwError")}
      </Button>
      <p className="text-muted-foreground text-sm">
        {t.rich("flagLine", {
          label: flagLabel,
          code: (chunks) => <code>{chunks}</code>,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
      {status ? <p className="text-sm">{status}</p> : null}
    </div>
  );
}
