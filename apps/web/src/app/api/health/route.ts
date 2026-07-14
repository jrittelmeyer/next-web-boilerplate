import { db } from "@repo/db";
import { sql } from "drizzle-orm";
import { connection } from "next/server";

// Liveness + readiness probe for load balancers, container orchestrators, and the
// Docker HEALTHCHECK. cacheComponents bans the `runtime`/`dynamic` route-segment
// configs, so instead: we rely on Next 16's Node-default route runtime (node-postgres
// is not Edge-safe — never set a global edge default) and call connection() in GET to
// force per-request execution (the DB ping must run at request time, not at build).
// Importing @repo/db is cheap (the pg Pool connects lazily), so this module is safe to
// import with the database down and never throws at build time.

// Cap the readiness check so a partitioned/hung database returns 503 quickly rather
// than holding the probe open until the orchestrator's own (longer) timeout fires.
const DB_PING_TIMEOUT_MS = 2500;

// Trivial round-trip that proves the pool can reach Postgres and run a query,
// bounded by a timeout so a stalled connection can't hang the probe.
async function pingDatabase(): Promise<void> {
  const ping = db.execute(sql`select 1`);
  // If the timeout wins the race below, the query may still reject later; swallow
  // that here so it never surfaces as an unhandled rejection.
  ping.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("health: database ping timed out")),
      DB_PING_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([ping, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<Response> {
  // Opt out of prerendering: this probe must execute per request (cacheComponents
  // replaces the old `dynamic = "force-dynamic"` segment config with connection()).
  await connection();

  // Liveness signal: if this code runs at all, the process is up and serving.
  const base = { uptime: process.uptime(), timestamp: new Date().toISOString() };

  try {
    await pingDatabase();
    return Response.json({ status: "ok", ...base, checks: { database: "up" } }, { status: 200 });
  } catch {
    // Readiness failure: the process is alive but a hard dependency is unreachable,
    // so report 503 and let the probe pull this instance from rotation.
    return Response.json(
      { status: "error", ...base, checks: { database: "down" } },
      { status: 503 },
    );
  }
}
