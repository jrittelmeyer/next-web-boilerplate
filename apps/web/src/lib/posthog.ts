import "server-only";
import { PostHog } from "posthog-node";

// Server-side PostHog client for feature-flag evaluation and server-side capture
// (the client SDK lives in components/observability/posthog-provider.tsx). Like
// lib/stripe.ts / lib/search.ts this is a lazy guarded singleton: importing the
// module is cheap and key-free, and isPostHogConfigured() lets callers gate and
// degrade gracefully when analytics isn't configured.
//
// Feature flags are checked here (server-side) rather than in the browser so the
// UI never flickers between the default and the resolved flag value.
let client: PostHog | null = null;

export function getPostHogServer(): PostHog {
  if (!client) {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      throw new Error("NEXT_PUBLIC_POSTHOG_KEY is not set — PostHog is not configured.");
    }
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // Server runtimes are often short-lived (serverless): flush each event
      // immediately rather than batch, so an invocation doesn't exit before the
      // event/flag request is sent. For long-lived servers, call shutdown() on teardown.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export function isPostHogConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}
