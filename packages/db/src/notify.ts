import { pool } from "./client";

/**
 * Postgres LISTEN/NOTIFY publish leg (Tier 4 · A22). Broadcasts a JSON payload on a
 * channel to every connection that has issued `LISTEN <channel>` — including
 * listeners in *other* app instances, since NOTIFY is delivered by the Postgres
 * server. This is the cross-instance-correct realtime transport (the same posture as
 * the DB-backed rate-limit storage): one shared source of truth, no per-instance
 * fan-out gap. The subscribe leg is the app-side bus in
 * `apps/web/src/server/realtime/notification-bus.ts`.
 *
 * Uses the `pg_notify(text, text)` *function* rather than the `NOTIFY channel,
 * 'payload'` statement on purpose: the channel is a bind parameter, so a caller can
 * never inject a SQL identifier (the statement form has no parameterized channel —
 * you would have to interpolate it). Runs on the pooled connection — a fire-and-
 * forget write, so it does not need (and must not hold) a dedicated client.
 *
 * NOTE the Postgres NOTIFY payload cap is 8000 bytes. Keep payloads small — an id
 * plus a few scalars. For anything larger, send only an id here and have the
 * subscriber re-fetch the row from the pooled `db`.
 */
export async function notify(channel: string, payload: unknown): Promise<void> {
  await pool.query("SELECT pg_notify($1, $2)", [channel, JSON.stringify(payload)]);
}

/** The single channel the notifications example broadcasts on. Subscribers filter to
 * their own user by the `userId` carried in the payload — one channel keeps the
 * dedicated LISTEN connection count at one per instance and avoids dynamic channel
 * identifiers. Per-user (hashed) channels are the documented scale-up. */
export const NOTIFICATIONS_CHANNEL = "notifications";
