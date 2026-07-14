"use client";

import { useSession } from "@repo/auth/client";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type ReactNode, useEffect, useRef } from "react";
import { syncPostHogIdentity } from "@/lib/posthog-identity";
import { ConsentBanner } from "./consent-banner";
import { notifyConsentChanged } from "./use-consent";

// Client-side PostHog provider, mounted in the root layout. When
// NEXT_PUBLIC_POSTHOG_KEY is unset it is a transparent passthrough (no init, no
// network), so the app runs identically without analytics creds.
//
// It is the second client provider in the tree (alongside TRPCReactProvider) but
// renders `children` straight through, so Server Components passed into the layout
// stay server-rendered — the client boundary doesn't widen. See STATE.md.
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      // Same-origin reverse proxy (see next.config.ts rewrites) to dodge ad-blockers.
      api_host: "/ingest",
      // The real region host, used for links back to the PostHog app UI.
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // Opt into PostHog's current recommended defaults (SPA pageviews, etc.).
      defaults: "2025-05-24",
      // Consent gate (B3 · Band 3): capture NOTHING until the user opts in via the
      // ConsentBanner. posthog-js still persists the opt-in/out decision itself (the
      // consent record), but no events/identify fire until opt_in_capturing() — so a
      // visitor who ignores the banner is never tracked. See lib/consent.ts + SERVICES.md.
      opt_out_capturing_by_default: true,
    });
    // posthog.init doesn't re-render us, and posthog-js emits no "ready"/consent event, so
    // wake the ConsentBanner/Privacy card once the SDK is loaded and its consent record is
    // readable (getSnapshot returns null until posthog.__loaded).
    notifyConsentChanged();
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return <>{children}</>;
  return (
    <PHProvider client={posthog}>
      <PostHogAuthSync />
      <ConsentBanner />
      {children}
    </PHProvider>
  );
}

// P2-5: tie client events to users — a SESSION WATCHER, not per-form calls, because
// OAuth sign-in returns via a top-level redirect (no client success callback ever
// runs) and sessions also end outside the sign-out button (remote revoke, account
// deletion). Mounted only in the configured branch above, so an unconfigured app
// never pays the useSession subscription. The decision logic lives in
// lib/posthog-identity.ts (unit-tested + coverage-gated); this is the thin shell.
function PostHogAuthSync() {
  const { data: session, isPending } = useSession();
  // Whether a signed-in session has been observed this pageload — the signal that
  // makes reset fire on a real sign-out transition (and not, say, on first paint
  // of a signed-out page, where useSession briefly reports null-after-pending).
  const hadSessionRef = useRef(false);

  useEffect(() => {
    // Wait for the session fetch (isPending) and for init — the parent effect
    // that calls posthog.init runs after this child effect on first mount, but
    // the session fetch always resolves later and re-runs us.
    if (isPending || !posthog.__loaded) return;
    hadSessionRef.current = syncPostHogIdentity(
      posthog,
      session?.user ?? null,
      hadSessionRef.current,
    );
  }, [session, isPending]);

  return null;
}
