"use client";

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
import { useConsent } from "@/components/observability/use-consent";
import { exportMyData } from "@/server/actions/data-export";

// Whether product analytics is wired into this deployment. NEXT_PUBLIC_* is inlined at
// build time, so a client component can read it directly (same gate the provider uses).
const analyticsConfigured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

/**
 * Privacy & data card on /account (B3 · Band 3). Home for the GDPR self-service controls:
 * withdrawing/granting analytics consent (the CONSENT right) and downloading a copy of your
 * data (the ACCESS right — the counterpart to account deletion's erasure right, P2-2). The
 * analytics section only renders when PostHog is configured — an unconfigured app collects
 * nothing, so there's nothing to consent to — but the export is always available.
 */
export function PrivacyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy &amp; data</CardTitle>
        <CardDescription>Control how your usage is tracked and export your data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {analyticsConfigured ? <AnalyticsConsent /> : null}
        <DataExport />
      </CardContent>
    </Card>
  );
}

// Reflects the current posthog-js consent record and lets the user flip it (the GDPR
// withdrawal right the one-shot banner alone doesn't cover). `decision` is null until the
// SDK loads; render a stable placeholder rather than flashing a wrong state.
function AnalyticsConsent() {
  const { decision, grant, deny } = useConsent();
  const enabled = decision === "granted";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Product analytics</span>
      <p className="text-sm text-muted-foreground">
        {decision === null
          ? "Checking your current preference…"
          : enabled
            ? "Enabled — anonymous product-usage events help us improve the app."
            : "Disabled — no analytics events are collected."}
      </p>
      <div>
        {decision === null ? null : enabled ? (
          <Button variant="outline" size="sm" onClick={deny}>
            Disable analytics
          </Button>
        ) : (
          <Button size="sm" onClick={grant}>
            Enable analytics
          </Button>
        )}
      </div>
    </div>
  );
}

// GDPR data export: calls the exportMyData server action, then downloads the returned JSON
// blob. Transient outcomes toast (A1); there's no standing state to keep inline.
function DataExport() {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const result = await exportMyData();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([result.data.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.data.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data export has been downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Your data</span>
      <p className="text-sm text-muted-foreground">
        Download a copy of the data associated with your account — profile, sessions, posts,
        uploads, subscriptions, and more — as a JSON file.
      </p>
      <div>
        <Button size="sm" variant="outline" onClick={download} disabled={busy}>
          {busy ? "Preparing…" : "Download my data"}
        </Button>
      </div>
    </div>
  );
}
