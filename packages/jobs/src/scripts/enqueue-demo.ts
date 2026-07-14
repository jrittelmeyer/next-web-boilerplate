import "../load-env";
import { enqueue } from "../enqueue";
import { JOBS } from "../queues";

/**
 * Dev convenience: enqueue a sample `welcome-email` job WITHOUT the full
 * sign-up + email-verification flow, so the worker can be exercised end-to-end
 * deterministically.
 *
 *   1. Start Postgres:  docker compose -f docker/docker-compose.yml up -d
 *   2. Start the worker: pnpm --filter @repo/jobs start
 *   3. In another shell: pnpm --filter @repo/jobs enqueue:demo [you@example.com]
 *
 * Watch the worker stdout: it picks up the job and logs the welcome-email
 * outcome (a real send if Resend is configured, otherwise the "skipped" line) —
 * proving the job crossed the process boundary.
 */
const to = process.argv[2] ?? "demo@example.com";

async function main(): Promise<void> {
  console.info(`[jobs] enqueuing a demo ${JOBS.welcomeEmail} job for ${to}…`);
  await enqueue(JOBS.welcomeEmail, { to, name: "Demo User" });
  console.info("[jobs] enqueued. Run the worker to process it: pnpm --filter @repo/jobs start");
  // enqueue opened a connection pool; exit explicitly so the script doesn't hang.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
