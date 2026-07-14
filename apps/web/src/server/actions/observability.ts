"use server";

import { log } from "@logtail/next";
import { after } from "next/server";

type ActionResult = { error: string } | { data: { logged: true } };

/**
 * Example structured-logging action (scaffold). BetterStack's `log` ships
 * structured events when BETTER_STACK_SOURCE_TOKEN + BETTER_STACK_INGESTING_URL
 * are set, and falls back to console output otherwise — so this runs identically
 * with or without BetterStack creds (same env-gated posture as the other services).
 *
 * The flush is scheduled with `after()` (next/after) so it runs AFTER this action's
 * response is sent — guaranteeing delivery before a short-lived/serverless runtime
 * freezes, without blocking the return. Replace with real logging wired into your
 * app's seams (auth events, webhook failures, etc. — see SERVICES.md).
 */
export async function logExampleEvent(): Promise<ActionResult> {
  try {
    log.info("observability demo: structured info log", {
      source: "observability-demo",
      at: new Date().toISOString(),
    });
    log.error("observability demo: structured error log", {
      source: "observability-demo",
      reason: "demo",
    });
    after(() => log.flush());
    return { data: { logged: true } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to log event" };
  }
}
