import { PgBoss } from "pg-boss";

/**
 * The dedicated schema pg-boss creates, migrates, and owns. Drizzle does NOT
 * manage these tables — `drizzle-kit` only touches `public` — so there is no
 * migration conflict (see DATABASE.md + DECISIONS.md).
 */
export const JOBS_SCHEMA = "pgboss";

/**
 * Construct a PgBoss bound to DATABASE_URL (the same Postgres the app uses — no
 * separate service). `start()` lazily creates/migrates the `pgboss` schema on
 * first connect, guarded by advisory locks so the worker and the web app's
 * enqueue client can both call it safely.
 *
 * `supervise` decides the role:
 * - worker (`true`): runs the maintenance loop (archive/expire jobs) + the cron
 *   scheduler, and processes jobs via `work()`.
 * - enqueue client (`false`): no background polling/maintenance in the request
 *   process — it only ensures the schema/queues exist and inserts jobs.
 */
export function createBoss({ supervise }: { supervise: boolean }): PgBoss {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for pg-boss (background jobs).");
  }
  return new PgBoss({
    connectionString,
    schema: JOBS_SCHEMA,
    application_name: supervise ? "nwb-jobs-worker" : "nwb-jobs-enqueue",
    supervise,
    schedule: supervise,
  });
}
