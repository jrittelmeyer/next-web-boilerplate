import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once per server runtime. Load the matching Sentry
// init so server/edge errors and traces are captured; the browser init lives in
// instrumentation-client.ts. Imports are dynamic so each runtime only pulls its
// own config (the Node SDK must not load on the edge and vice versa).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in nested React Server Components, route handlers, and
// Server Actions (Next.js 15+ onRequestError hook).
export const onRequestError = Sentry.captureRequestError;
