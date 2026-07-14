// Analytics consent (B3 · Band 3 — Consent gate). The DECISION LOGIC, kept pure and
// out of the React components so it's unit-testable in the node Vitest project (the
// posthog-identity.ts / audit-format.ts precedent). No "server-only": this reads the
// posthog-js opt-in/out record in the browser.

/** The slice of posthog-js this module reads (also what tests mock). */
export type ConsentReader = {
  // posthog-js's EXPLICIT consent status — "pending" until the user actually chooses.
  // Deliberately NOT has_opted_out_capturing(): with `opt_out_capturing_by_default: true`
  // that returns true by default (opted out until opt-in), which would read as "denied" and
  // suppress the banner. get_explicit_consent_status ignores the default config, so it's the
  // right signal for "should we ask?" (posthog-js documents exactly this use).
  get_explicit_consent_status(): "granted" | "denied" | "pending";
};

/**
 * The user's analytics-consent state, normalized to this app's vocabulary:
 *  - "granted" — opted in; PostHog may capture.
 *  - "denied"  — opted out; PostHog captures nothing.
 *  - "unset"   — no explicit choice yet → the consent banner should ask.
 *
 * "unset" maps posthog-js's "pending". With `opt_out_capturing_by_default: true` (see
 * posthog-provider.tsx) "unset" still captures nothing — nothing is sent until an explicit
 * opt-in — so a visitor who ignores the banner is never tracked.
 */
export type ConsentDecision = "granted" | "denied" | "unset";

export function readConsent(posthog: ConsentReader): ConsentDecision {
  const status = posthog.get_explicit_consent_status();
  return status === "pending" ? "unset" : status;
}
