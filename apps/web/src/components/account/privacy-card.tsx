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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("Account.privacy");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
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
  const t = useTranslations("Account.privacy");
  const { decision, grant, deny } = useConsent();
  const enabled = decision === "granted";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("analyticsTitle")}</span>
      <p className="text-sm text-muted-foreground">
        {decision === null ? t("checking") : enabled ? t("enabled") : t("disabled")}
      </p>
      <div>
        {decision === null ? null : enabled ? (
          <Button variant="outline" size="sm" onClick={deny}>
            {t("disable")}
          </Button>
        ) : (
          <Button size="sm" onClick={grant}>
            {t("enable")}
          </Button>
        )}
      </div>
    </div>
  );
}

// GDPR data export: calls the exportMyData server action, then downloads the returned JSON
// blob. Transient outcomes toast (A1); there's no standing state to keep inline.
function DataExport() {
  const t = useTranslations("Account.privacy");
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
      toast.success(t("downloaded"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("dataTitle")}</span>
      <p className="text-sm text-muted-foreground">{t("dataDescription")}</p>
      <div>
        <Button size="sm" variant="outline" onClick={download} disabled={busy}>
          {busy ? t("preparing") : t("download")}
        </Button>
      </div>
    </div>
  );
}
