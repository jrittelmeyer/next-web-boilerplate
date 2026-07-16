import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DEAD_LETTER_QUEUE } from "../../src/queues";

// Own schema (worker.test.ts uses pgboss_test; the runner is serial, but distinct
// schemas keep the two files' setup/teardown fully independent).
const SCHEMA = "pgboss_test_dlq";
const QUEUE = "doomed-queue";

let boss: PgBoss;

beforeAll(async () => {
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: SCHEMA,
    supervise: true,
    schedule: false,
  });
  await boss.start();
  // Same order + options as worker.ts: DLQ first, then the queue referencing it.
  // retryLimit: 0 = exhausted on the FIRST failure, keeping the test fast.
  await boss.createQueue(DEAD_LETTER_QUEUE);
  await boss.createQueue(QUEUE, { deadLetter: DEAD_LETTER_QUEUE, retryLimit: 0 });
});

afterAll(async () => {
  await boss?.stop({ graceful: false }).catch(() => undefined);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.end();
});

it("routes an exhausted job to the dead-letter queue with its original payload", async () => {
  const payload = { reason: "always-fails" };

  const arrivedAtDlq = new Promise<unknown>((resolve) => {
    void boss.work(DEAD_LETTER_QUEUE, async (jobs) => {
      resolve(jobs[0]?.data);
    });
  });

  // The doomed handler always throws; with retryLimit 0 the first failure
  // exhausts the job and pg-boss copies it to the DLQ.
  void boss.work(QUEUE, async () => {
    throw new Error("handler boom");
  });

  const jobId = await boss.send(QUEUE, payload);
  expect(jobId).toBeTruthy();

  // The DLQ delivery carries the ORIGINAL payload through the real Postgres.
  expect(await arrivedAtDlq).toEqual(payload);
});
