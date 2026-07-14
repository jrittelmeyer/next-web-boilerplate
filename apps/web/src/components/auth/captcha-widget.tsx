"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Cloudflare Turnstile CAPTCHA widget (A12) — a small hand-rolled wrapper over
// Cloudflare's api.js (no runtime dependency; the plugin already ships with better-auth).
// It renders ONLY when a site key is present, so the (auth) forms mount it conditionally
// and the default env-unset app never loads the script. On a solved challenge it hands the
// token up via onToken; the parent form sends it in the `x-captcha-response` request header,
// which the server captcha() plugin verifies against Cloudflare (see AUTH.md → Bot protection).
//
// Explicit rendering (?render=explicit) so the widget mounts into a specific element under
// React's control (rather than api.js auto-scanning the DOM), which behaves under client-side
// navigation and Strict Mode's double-mount. The imperative `reset()` mints a fresh token —
// Turnstile tokens are single-use, so the form calls it after a failed submit.

/** What the parent form can drive imperatively. */
export type CaptchaWidgetHandle = { reset: () => void };

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
}
interface TurnstileApi {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Load api.js at most once per page; concurrent widgets share the same promise.
let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Allow a later retry if the network hiccuped.
      scriptPromise = null;
      reject(new Error("Turnstile script failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const CaptchaWidget = forwardRef<
  CaptchaWidgetHandle,
  { siteKey: string; onToken: (token: string | null) => void }
>(function CaptchaWidget({ siteKey, onToken }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        onToken(null);
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          // `auto` follows the OS color scheme. A fork that wants the widget pinned to the
          // app's manual theme can pass next-themes' resolvedTheme here (remount on change).
          theme: "auto",
          callback: (token) => onToken(token),
          // A failed or expired challenge clears the token; the submit button re-disables
          // until Turnstile re-challenges (auto by default) and mints a fresh one.
          "error-callback": () => onToken(null),
          "expired-callback": () => onToken(null),
        });
      })
      .catch(() => {
        // Script blocked/offline: leave the token null. The form keeps its submit disabled,
        // which is the safe posture when captcha is required but unavailable.
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget already gone (e.g. Strict Mode remount) — nothing to clean up.
        }
        widgetIdRef.current = undefined;
      }
    };
    // Re-render only if the site key changes (it won't within a page); onToken is stable
    // enough (React Compiler memoizes the setState updater passed by the forms).
  }, [siteKey, onToken]);

  return <div ref={containerRef} className="min-h-[65px]" />;
});
