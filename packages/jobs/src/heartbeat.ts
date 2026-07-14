/**
 * Optional BetterStack heartbeat for the worker — the one runtime-touching piece
 * of dashboards-as-code, and worker-only (never the web app/bundle/CSP).
 *
 * The worker can die silently (jobs just accumulate in `pgboss.job`). A heartbeat
 * inverts that: BetterStack expects a periodic ping and alerts when one stops
 * arriving. The matching `jobs-worker` heartbeat is defined as code in
 * `@repo/observability`; paste its ping URL into `BETTER_STACK_HEARTBEAT_URL`.
 *
 * Graceful: with the env var unset this is a no-op. The ping is fire-and-forget —
 * a heartbeat/network outage must never disturb job processing.
 */

/** How often the worker pings. Keep ≤ the heartbeat's `period` in
 *  `@repo/observability` config (currently 60s) so a healthy worker never trips it. */
const WORKER_HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Starts pinging if `BETTER_STACK_HEARTBEAT_URL` is set. Returns a stop function
 * (no-op when unconfigured) for the worker's graceful-shutdown path.
 */
export function startHeartbeat(): () => void {
  const url = process.env.BETTER_STACK_HEARTBEAT_URL;
  if (!url) return () => {};

  const ping = (): void => {
    void fetch(url).catch((err: unknown) => console.warn("[jobs] heartbeat ping failed:", err));
  };

  ping(); // ping immediately so a freshly started worker reports healthy at once
  const timer: ReturnType<typeof setInterval> = setInterval(ping, WORKER_HEARTBEAT_INTERVAL_MS);
  console.info(`[jobs] heartbeat enabled — pinging every ${WORKER_HEARTBEAT_INTERVAL_MS / 1000}s`);
  return () => clearInterval(timer);
}
