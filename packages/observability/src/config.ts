import { z } from "zod";
import { type Heartbeat, HeartbeatSchema, type Monitor, MonitorSchema } from "./schema";

/**
 * The checked-in monitoring/alerting config — this IS the "dashboards-as-code".
 * Edit these declarations, run `pnpm --filter @repo/observability sync`, and your
 * BetterStack account converges to match. `check.ts` validates them in CI.
 *
 * Importing this module runs every declaration through its Zod schema, so an
 * invalid value fails fast here (and in CI) rather than at the API boundary.
 */

/** Canonical public origin, mirroring the app's `lib/site.ts` precedence
 *  (`SITE_URL ?? BETTER_AUTH_URL ?? localhost`). Unset (e.g. in CI) falls back to
 *  localhost — still a valid URL, so `check` passes without any credentials. */
const siteUrl = process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Uptime monitors. Shipped example: an HTTP check on the readiness probe
 * (`apps/web/src/app/api/health/route.ts`), which returns 200 when the DB is
 * reachable and 503 when it isn't — so alerting on "not 200" is exactly right.
 */
export const monitors: Monitor[] = z.array(MonitorSchema).parse([
  {
    name: "app-health",
    url: `${siteUrl.replace(/\/$/, "")}/api/health`,
    monitorType: "expected_status_code",
    expectedStatusCodes: [200],
    checkFrequencySeconds: 180,
    notify: { email: true },
  },
]);

/**
 * Heartbeats. Shipped example: the pg-boss background-jobs worker (D7). It pings
 * its heartbeat URL every `WORKER_HEARTBEAT_INTERVAL_MS` (see
 * `packages/jobs/src/worker.ts`); if it dies, jobs silently queue — this is what
 * surfaces that. `period`/`grace` give ~3 missed pings of slack before alerting.
 */
export const heartbeats: Heartbeat[] = z.array(HeartbeatSchema).parse([
  {
    name: "jobs-worker",
    periodSeconds: 60,
    graceSeconds: 180,
    notify: { email: true },
  },
]);
