import { ZodError } from "zod";

/**
 * Validates the checked-in config (`config.ts`) without any credentials — the
 * CI-friendly half of dashboards-as-code. Importing `config.ts` runs every
 * declaration through its Zod schema, so a bad value (malformed URL, sub-floor
 * `period`, unknown monitor type) fails here with a non-zero exit. Wired into
 * the `verify` lane (`pnpm --filter @repo/observability check`).
 */
async function main(): Promise<void> {
  try {
    const { monitors, heartbeats } = await import("./config");

    console.info("[observability] config OK");
    console.info(`  monitors (${monitors.length}):`);
    for (const m of monitors) {
      console.info(`    - ${m.name} → ${m.url} (expect ${m.expectedStatusCodes.join(", ")})`);
    }
    console.info(`  heartbeats (${heartbeats.length}):`);
    for (const h of heartbeats) {
      console.info(`    - ${h.name} (period ${h.periodSeconds}s, grace ${h.graceSeconds}s)`);
    }
  } catch (err) {
    if (err instanceof ZodError) {
      console.error("[observability] config INVALID:");
      for (const issue of err.issues) {
        console.error(`  - ${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw err;
  }
}

void main();
