import "server-only";

import { createPgListener, NOTIFICATIONS_CHANNEL, type PgListener } from "@repo/db";
import { type NotificationPayload, notificationPayloadSchema } from "@repo/validators";

/**
 * In-process notification bus (Tier 4 · A22) — the SUBSCRIBE side of the realtime
 * transport. It owns ONE dedicated Postgres LISTEN connection per app instance
 * (via `@repo/db`'s `createPgListener`) and fans each incoming notification out to
 * the open SSE streams for that user. This is what makes the design cross-instance
 * correct AND connection-cheap: a `notify()` from any instance / webhook / job reaches
 * every instance's single listener, which then dispatches in-process to that user's
 * subscribers — one DB connection per instance, not one per connected browser.
 *
 * WHY a single global channel + per-user filter (not a channel per user): it keeps the
 * listener count at exactly one and avoids dynamic SQL identifiers. The cost is that
 * every instance's listener wakes for every user's notification and filters by the
 * payload's `userId` — negligible at this scale. Per-user (hashed) channels are the
 * documented scale-up. See docs/context/API.md → Realtime + DECISIONS.md.
 *
 * DELIVERY SEMANTICS: at-least-once while connected, best-effort across a listener
 * reconnect (a NOTIFY in the reconnect gap is missed). That's acceptable because every
 * notification is PERSISTED (the `notifications` table) — the SSE push is an
 * enhancement, and the initial `notification.list` load / a reload reconciles. See
 * DEPLOYMENT.md → the serverless caveat.
 */

type Subscriber = (payload: NotificationPayload) => void;

/** Wait before reconnecting a dropped listener — long enough to avoid hammering a
 * restarting database, short enough that live updates resume quickly. */
const RECONNECT_DELAY_MS = 2_000;

// Exported for unit testing the per-user fan-out in isolation (a fresh instance with a
// mocked createPgListener); app code must use the process singleton via getNotificationBus.
export class NotificationBus {
  private listener: PgListener | null = null;
  private starting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // userId → the set of open-stream handlers for that user.
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  /**
   * Register a handler for one user's notifications and lazily boot the shared
   * listener. Returns an unsubscribe to call from the stream's cleanup (cancel /
   * abort). The listener is kept warm at zero subscribers — it's a single idle
   * connection the next subscriber reuses.
   */
  subscribe(userId: string, handler: Subscriber): () => void {
    let set = this.subscribers.get(userId);
    if (!set) {
      set = new Set();
      this.subscribers.set(userId, set);
    }
    set.add(handler);

    // Fire-and-forget: a boot failure surfaces via onError → scheduled reconnect.
    void this.ensureListening();

    return () => {
      const current = this.subscribers.get(userId);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.subscribers.delete(userId);
    };
  }

  /** Open the dedicated listener once; concurrent callers await the same connect. */
  private async ensureListening(): Promise<void> {
    if (this.listener) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      try {
        this.listener = await createPgListener(NOTIFICATIONS_CHANNEL, {
          onNotification: (payload) => this.dispatch(payload),
          onError: (error) => this.handleError(error),
        });
      } finally {
        this.starting = null;
      }
    })();

    try {
      await this.starting;
    } catch (error) {
      // Initial connect failed (e.g. DB down at first subscribe) — retry on a timer
      // so streams start delivering once the database is reachable.
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Parse + validate a raw NOTIFY payload and dispatch it to the target user's streams. */
  private dispatch(raw: string | undefined): void {
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // Malformed payload — ignore rather than crash the listener.
    }
    const result = notificationPayloadSchema.safeParse(parsed);
    if (!result.success) return;

    const set = this.subscribers.get(result.data.userId);
    if (!set) return;
    for (const handler of set) {
      // One misbehaving stream handler must not stop the others from receiving.
      try {
        handler(result.data);
      } catch {
        // Swallow: the stream route's enqueue is already guarded; nothing to do here.
      }
    }
  }

  /** Tear down the failed listener and schedule a reconnect if anyone's still listening. */
  private handleError(error: Error): void {
    console.error("[notification-bus] listener error, will reconnect:", error);
    const dead = this.listener;
    this.listener = null;
    if (dead) void dead.close();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const timer = setTimeout(() => {
      this.reconnectTimer = null;
      // Only reconnect if streams are still open; otherwise the next subscribe boots it.
      if (this.subscribers.size > 0) void this.ensureListening();
    }, RECONNECT_DELAY_MS);
    // Don't keep the Node process alive just for a pending reconnect.
    timer.unref?.();
    this.reconnectTimer = timer;
  }
}

// One bus per process, stashed on globalThis so a dev HMR reload reuses it instead of
// leaking a new LISTEN connection on every edit (the same singleton-across-HMR pattern
// the repo uses for other long-lived server resources).
const globalForBus = globalThis as unknown as { __notificationBus?: NotificationBus };

export function getNotificationBus(): NotificationBus {
  globalForBus.__notificationBus ??= new NotificationBus();
  return globalForBus.__notificationBus;
}
