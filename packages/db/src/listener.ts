import { Client } from "pg";

/**
 * Postgres LISTEN/NOTIFY subscribe leg (Tier 4 · A22) — the counterpart to `notify()`
 * (notify.ts). A LISTEN connection must be a DEDICATED, long-lived client: it can't
 * come from the Drizzle `pool`, because the connection has to stay checked out to keep
 * receiving async `notification` events (a pooled connection is returned after each
 * query and would stop listening). This module owns that raw-`pg` concern so the app
 * side deals only with parsed payloads; the reconnect/registry/fan-out orchestration
 * lives in the app bus (apps/web/src/server/realtime/notification-bus.ts).
 *
 * Never connects at import time — `createPgListener` connects only when called, which
 * the bus does lazily on the first subscriber (request time), so importing @repo/db
 * for types stays cheap and build-safe.
 */

export interface PgListener {
  /** Stop listening and close the dedicated connection. Idempotent-safe to await. */
  close(): Promise<void>;
}

// A Postgres channel name is a SQL identifier and CANNOT be a bind parameter in a
// LISTEN statement, so it must be interpolated. Restrict it to a safe identifier
// shape (lowercase, unquoted) so a caller can never inject SQL through the channel —
// defense in depth even though the only caller passes a hardcoded constant.
const SAFE_CHANNEL = /^[a-z_][a-z0-9_]*$/;

/**
 * Open a dedicated connection, `LISTEN <channel>`, and invoke `onNotification` with
 * each payload string as it arrives (only for THIS channel). `onError` fires on a
 * connection-level error (dropped connection, etc.) so the caller can reconnect —
 * this module does not retry on its own; that policy belongs to the subscriber.
 * Uses `DATABASE_URL` directly (validated at the app boundary, apps/web/src/env.ts).
 */
export async function createPgListener(
  channel: string,
  handlers: {
    onNotification: (payload: string | undefined) => void;
    onError: (error: Error) => void;
  },
): Promise<PgListener> {
  if (!SAFE_CHANNEL.test(channel)) {
    throw new Error(`Unsafe LISTEN channel name: ${channel}`);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  // Wire handlers BEFORE connecting so no early event is missed.
  client.on("notification", (msg) => {
    if (msg.channel === channel) handlers.onNotification(msg.payload);
  });
  // pg emits 'error' on a connection-level failure (e.g. the server closed the socket).
  client.on("error", handlers.onError);

  await client.connect();
  await client.query(`LISTEN ${channel}`);

  return {
    async close() {
      // Drop the error handler first so the expected end() doesn't surface as an error.
      client.removeListener("error", handlers.onError);
      try {
        await client.end();
      } catch {
        // Already closed / connection lost — nothing to clean up.
      }
    },
  };
}
