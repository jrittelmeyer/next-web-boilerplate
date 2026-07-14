import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { welcomeEmailPayload } from "../../src/queues";

// Isolated schema so the test never touches the app's real `pgboss` jobs schema.
const SCHEMA = "pgboss_test";
const QUEUE = "welcome-email";

let boss: PgBoss;

beforeAll(async () => {
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: SCHEMA,
    supervise: true,
    schedule: false,
  });
  await boss.start();
  await boss.createQueue(QUEUE);
});

afterAll(async () => {
  await boss?.stop({ graceful: false }).catch(() => undefined);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.end();
});

it("round-trips a job through real Postgres: send → worker processes it", async () => {
  const payload = { to: "integration@example.com", name: "Integration" };

  const processed = new Promise<unknown>((resolve) => {
    void boss.work(QUEUE, async (jobs) => {
      resolve(jobs[0]?.data);
    });
  });

  const jobId = await boss.send(QUEUE, payload);
  expect(jobId).toBeTruthy();

  // The payload survives the DB round-trip and matches the shared contract.
  const received = await processed;
  expect(welcomeEmailPayload.parse(received)).toEqual(payload);
});
