"use client";

import { Button } from "@repo/ui/components/button";
import { useConsent } from "./use-consent";

// Consent gate (B3 · Band 3). Rendered only inside PostHogProvider's CONFIGURED branch, so
// an app without NEXT_PUBLIC_POSTHOG_KEY never shows it (and never loads analytics at all).
// With `opt_out_capturing_by_default` the SDK captures nothing until "Accept", so a visitor
// who ignores this banner is never tracked; the choice persists (posthog-js stores it), so
// the banner asks once. Withdrawing or changing the choice later lives on /account (the
// Privacy card), which this links to.
export function ConsentBanner() {
  const { decision, grant, deny } = useConsent();

  // Ask only when no choice is recorded yet — and only after posthog has loaded (decision
  // is null until then, which also keeps the server render empty: no hydration mismatch).
  if (decision !== "unset") return null;

  return (
    <section
      // Non-modal landmark: it must not trap focus or block the page — analytics is off
      // until a choice is made, so the user can keep using the app and decide whenever.
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 backdrop-blur supports-backdrop-filter:bg-background/80"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use privacy-friendly product analytics to understand how the app is used.{" "}
          <span className="text-foreground">Nothing is collected until you agree.</span> You can
          change this any time on your{" "}
          <a href="/account" className="text-foreground underline underline-offset-4">
            account
          </a>{" "}
          page.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={deny}>
            Decline
          </Button>
          <Button size="sm" onClick={grant}>
            Accept
          </Button>
        </div>
      </div>
    </section>
  );
}
