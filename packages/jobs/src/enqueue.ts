import "server-only";
import type { PgBoss } from "pg-boss";
import { createBoss } from "./boss";
import { ALL_QUEUES } from "./queues";

// Lazy, memoized enqueue-only client. The first enqueue starts it: `start()`
// ensures the `pgboss` schema exists (idempotent, advisory-locked — safe even
// if the worker has never run) and `createQueue` ensures the queues exist; after
// that `send()` is a single INSERT. `supervise:false` (see createBoss) means the
// web process runs NO background polling/maintenance — it only inserts jobs.
let bossPromise: Promise<PgBoss> | null = null;

function getEnqueueBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = createBoss({ supervise: false });
      await boss.start();
      await Promise.all(ALL_QUEUES.map((queue) => boss.createQueue(queue)));
      return boss;
    })().catch((err) => {
      bossPromise = null; // let a later enqueue retry the connection
      throw err;
    });
  }
  return bossPromise;
}

/**
 * Enqueue a job from the web app. GRACEFUL BY DESIGN: any failure (DATABASE_URL
 * unset, DB unreachable, schema not yet creatable) is logged and swallowed —
 * enqueuing must never break the user-facing flow that triggered it. If the
 * worker is down the job simply waits in `pgboss.job` until a worker drains it.
 */
export async function enqueue<T extends object>(queue: string, data: T): Promise<void> {
  try {
    const boss = await getEnqueueBoss();
    await boss.send(queue, data);
  } catch (err) {
    console.error(`[jobs] enqueue(${queue}) failed — job not queued:`, err);
  }
}
