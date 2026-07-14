"use client";

import { Button } from "@repo/ui/components/button";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { useState } from "react";
import { logExampleEvent } from "@/server/actions/observability";

interface ObservabilityDemoProps {
  // Resolved on the server (see the page) so the flag never flickers client-side.
  exampleFlag: boolean | "unconfigured";
}

export function ObservabilityDemo({ exampleFlag }: ObservabilityDemoProps) {
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
    setStatus("Captured a test exception → Sentry (no-op without a DSN).");
  }

  // BetterStack: structured server log via a Server Action.
  async function sendLog() {
    const result = await logExampleEvent();
    setStatus(
      "error" in result
        ? `Log failed: ${result.error}`
        : "Sent a structured log → BetterStack (console output without creds).",
    );
  }

  // PostHog: capture a custom analytics event. Queued/no-op without a key.
  function captureEvent() {
    posthog.capture("observability_demo_event", { source: "observability-demo" });
    setStatus("Captured an analytics event → PostHog (no-op without a key).");
  }

  const flagLabel = exampleFlag === "unconfigured" ? "unconfigured" : exampleFlag ? "on" : "off";

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" onClick={captureError}>
        Capture a test error (Sentry)
      </Button>
      <Button type="button" variant="outline" onClick={sendLog}>
        Send a structured log (BetterStack)
      </Button>
      <Button type="button" variant="outline" onClick={captureEvent}>
        Capture an event (PostHog)
      </Button>
      <Button type="button" variant="destructive" onClick={() => setThrowOnRender(true)}>
        Throw a render error (test boundary)
      </Button>
      <p className="text-muted-foreground text-sm">
        Server-evaluated feature flag <code>example-flag</code>: <strong>{flagLabel}</strong>
      </p>
      {status ? <p className="text-sm">{status}</p> : null}
    </div>
  );
}
