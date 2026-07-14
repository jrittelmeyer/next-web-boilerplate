"use client";

import posthog from "posthog-js";
import { useCallback, useSyncExternalStore } from "react";
import { type ConsentDecision, readConsent } from "@/lib/consent";

// Analytics-consent store shared by the ConsentBanner and the /account Privacy card. The
// DECISION itself is persisted by posthog-js (its opt-in/out record — the one thing it's
// allowed to store pre-consent), but the SDK emits no change event, so we keep a tiny
// subscription and notify it ourselves whenever the decision changes (grant/deny) OR
// posthog finishes init (the provider calls notifyConsentChanged after posthog.init).
// getSnapshot returns null until posthog is loaded, so nothing renders — and there's no
// hydration mismatch — before the browser SDK is ready.

const listeners = new Set<() => void>();

/** Re-read consent everywhere: after grant/deny, and after posthog.init (provider). */
export function notifyConsentChanged(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A stable primitive snapshot (string | null) — required by useSyncExternalStore to avoid
// an infinite render loop. null = posthog not loaded yet (unconfigured, or pre-init).
function getSnapshot(): ConsentDecision | null {
  return posthog.__loaded ? readConsent(posthog) : null;
}

// posthog never loads on the server; render nothing there and let the client take over.
function getServerSnapshot(): ConsentDecision | null {
  return null;
}

/**
 * Reactive analytics-consent state plus the two mutators. `decision` is null until the
 * posthog SDK has loaded; `grant`/`deny` write the choice through posthog-js (which
 * persists it) and wake every subscriber. Only call this inside PostHogProvider's
 * configured branch — with no key, posthog never loads and `decision` stays null.
 */
export function useConsent() {
  const decision = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const grant = useCallback(() => {
    posthog.opt_in_capturing();
    notifyConsentChanged();
  }, []);

  const deny = useCallback(() => {
    posthog.opt_out_capturing();
    notifyConsentChanged();
  }, []);

  return { decision, grant, deny };
}
