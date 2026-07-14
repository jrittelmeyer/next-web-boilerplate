import { auth } from "@repo/auth";
import type { NotificationPayload } from "@repo/validators";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getNotificationBus } from "@/server/realtime/notification-bus";
import { formatSseComment, formatSseEvent } from "@/server/realtime/sse";

// Server-Sent Events stream of the signed-in user's live notifications (Tier 4 · A22).
// The `/api/*` matcher exclusion means the i18n proxy never touches this path, and
// same-origin EventSource is already allowed by `connect-src 'self'` — so this route
// needs no CSP change (see SECURITY.md). It streams NEW notifications only; the initial
// list comes from the `notification.list` tRPC query the page prefetches, so events
// aren't double-delivered.
//
// Runtime: Node (the default). `pg` (the LISTEN client behind the bus) is not
// Edge-safe, so this must never run on Edge; cacheComponents bans the `runtime`
// route-segment config, so we force per-request execution with connection() instead
// (the same pattern as app/api/health/route.ts).

// Keep-alive cadence — a comment frame every 25s so idle proxies/load-balancers don't
// close a quiet stream. Well under the common 30–60s idle timeout.
const HEARTBEAT_MS = 25_000;

const encoder = new TextEncoder();

export async function GET(request: Request): Promise<Response> {
  // Opt out of prerendering — this must execute per request (cacheComponents replaces
  // the old `dynamic = "force-dynamic"` segment config with connection()).
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const bus = getNotificationBus();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    unsubscribe?.();
    unsubscribe = null;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Guarded enqueue: once the peer disconnects the controller is closed, so a
      // late heartbeat/event must not throw an unhandled error.
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Flush headers + mark the stream open right away.
      send(formatSseComment("connected"));

      // Each of THIS user's notifications arrives as a named `notification` event.
      unsubscribe = bus.subscribe(userId, (payload: NotificationPayload) => {
        send(
          formatSseEvent({ event: "notification", data: JSON.stringify(payload), id: payload.id }),
        );
      });

      heartbeat = setInterval(() => send(formatSseComment("ping")), HEARTBEAT_MS);
      // Don't keep the process alive for the heartbeat of an abandoned stream.
      heartbeat.unref?.();
    },
    // Fires when the consumer cancels (browser closed the EventSource / navigated).
    cancel() {
      cleanup();
    },
  });

  // Belt-and-suspenders: also clean up on the request's abort signal (client
  // disconnect), which can fire independently of the stream's cancel().
  request.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops compression proxies from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx & friends) so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
