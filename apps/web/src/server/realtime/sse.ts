/**
 * Server-Sent Events (SSE) wire-format helpers (Tier 4 · A22). Pure string builders
 * — no I/O — so they unit-test in isolation and the stream route
 * (app/api/notifications/stream/route.ts) stays a thin orchestration layer over them.
 *
 * The SSE framing (WHATWG `text/event-stream`): each field is a `field: value` line;
 * a record is terminated by a BLANK line (`\n\n`). A `data` value that contains
 * newlines must be split into one `data:` line PER line, or the browser truncates it
 * at the first newline — JSON.stringify never emits a raw newline, but escaping here
 * keeps the helper correct for any payload. A line starting with `:` is a COMMENT the
 * browser ignores — used for the initial "connected" marker and the keep-alive ping.
 */

/**
 * Frame one named SSE event. `data` is sent verbatim (stringify JSON before calling).
 * An `id` sets the event id the browser echoes as `Last-Event-ID` on reconnect;
 * `event` names it so the client can `addEventListener(name)` instead of `onmessage`.
 */
export function formatSseEvent(input: { data: string; event?: string; id?: string }): string {
  const lines: string[] = [];
  if (input.id !== undefined) lines.push(`id: ${input.id}`);
  if (input.event !== undefined) lines.push(`event: ${input.event}`);
  // One `data:` line per line of the payload (see the newline note above).
  for (const line of input.data.split("\n")) {
    lines.push(`data: ${line}`);
  }
  // Trailing blank line terminates the event record.
  return `${lines.join("\n")}\n\n`;
}

/**
 * A comment frame (`: text`) — ignored by the EventSource parser. Two uses: an
 * immediate `: connected` so the browser flushes headers and marks the stream open,
 * and a periodic `: ping` heartbeat that keeps idle proxies/load-balancers from
 * closing a quiet connection.
 */
export function formatSseComment(text: string): string {
  return `: ${text}\n\n`;
}
