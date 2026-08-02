import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * The capability token behind the public `/rsvp` page.
 *
 * **Stateless, keyed off the attendee row id.** There is no stored token column, and that
 * keeps `attendees.md`'s claim true — *"Phase 4 is purely additive… nothing about the table
 * changes when emailed invitations arrive."* The row already **is** the capability: drop a
 * guest and `removeAttendees` hard-deletes it, so the token resolves to nothing; soft-delete
 * the event and the read filters it; `splitSeries` mints new attendee ids for its copy, so
 * the second half gets its own links. A stored token would buy per-invitation rotation that
 * no surface offers, and cost a column, an index, a backfill for the rows that already
 * exist, and a second fact that can disagree with the row.
 *
 * **No `.` in the alphabet, and that is load-bearing rather than cosmetic.** `proxy.ts`'s
 * matcher is `/((?!api|_next|_vercel|.*\..*).*)` — any path containing a dot skips the
 * proxy entirely — and `routing.ts` uses `localePrefix: "as-needed"`, so the default-locale
 * URL `/rsvp/<token>` exists ONLY via next-intl's rewrite into `[locale]`. A token with a
 * dot separator therefore **404s every invitation link in production** while a
 * hand-written fixture without one passes every test. base64url has no dot, and the id half
 * is a fixed width, so the two halves split by offset with no delimiter at all.
 *
 * See docs/context/calendar/invitations.md.
 */

/**
 * Domain separation. `BETTER_AUTH_SECRET` signs sessions; an RSVP token must never be
 * substitutable for one, or vice versa, so the signing key is a purpose-scoped derivation
 * rather than the secret itself. Bump the label to invalidate every outstanding link
 * without touching the secret.
 */
const KEY_LABEL = "calendar-rsvp-token-v1";

const ID_BYTES = 16;
const EXP_BYTES = 6;
/**
 * Thirty days past the last occurrence. A guest who answers the morning after a series ends
 * is answering something harmless; the grace exists so a token does not die between the
 * final meeting and the organizer reading the responses.
 */
const GRACE_SECONDS = 30 * 24 * 60 * 60;
const PAYLOAD_BYTES = ID_BYTES + EXP_BYTES;
/** base64url of 22 bytes — ceil(22 / 3) * 4, minus the two `=` that padding would add. */
const PAYLOAD_CHARS = 30;

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  cachedKey ??= createHmac("sha256", env.BETTER_AUTH_SECRET).update(KEY_LABEL).digest();
  return cachedKey;
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/** A uuid's 16 bytes, or `null` for anything that is not one. */
function uuidToBytes(id: string): Buffer | null {
  const hex = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Seconds-since-epoch in six big-endian bytes — good past the year 8 million, where four
 * would have run out in 2038. `0` means "never expires".
 */
function writeExpiry(target: Buffer, offset: number, expSeconds: number): void {
  target.writeUIntBE(expSeconds, offset, EXP_BYTES);
}

/**
 * Mint the RSVP token for one attendee row.
 *
 * `seriesEndMs` is the event's `series_end_at` — a stored, deliberately over-estimating
 * bound on the last occurrence ({@link file://packages/db/src/schema/calendar-events.ts}).
 * `null` means an unbounded series, which mints a **non-expiring** token; that residual is
 * documented rather than papered over, because any invented expiry for an open-ended series
 * would silently kill a legitimate invitation.
 */
export function mintRsvpToken(attendeeId: string, seriesEndMs: number | null): string {
  const idBytes = uuidToBytes(attendeeId);
  if (idBytes === null) throw new Error("mintRsvpToken: attendeeId is not a uuid");

  const payload = Buffer.alloc(PAYLOAD_BYTES);
  idBytes.copy(payload, 0);
  writeExpiry(
    payload,
    ID_BYTES,
    seriesEndMs === null ? 0 : Math.floor(seriesEndMs / 1000) + GRACE_SECONDS,
  );

  const mac = createHmac("sha256", signingKey()).update(payload).digest();
  return `${base64url(payload)}${base64url(mac)}`;
}

/**
 * Verify a token and return the attendee id it names, or `null`.
 *
 * `null` covers malformed, wrong-length, bad-signature and expired alike — the caller
 * renders one page for every one of them, because distinguishing them turns the route into
 * an oracle.
 */
export function verifyRsvpToken(token: string, nowMs: number): string | null {
  if (token.length <= PAYLOAD_CHARS) return null;

  const payload = Buffer.from(token.slice(0, PAYLOAD_CHARS), "base64url");
  const mac = Buffer.from(token.slice(PAYLOAD_CHARS), "base64url");
  // A short read means the input was not valid base64url of the expected width; comparing
  // it would otherwise throw inside timingSafeEqual rather than answering.
  if (payload.length !== PAYLOAD_BYTES) return null;

  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(mac, expected)) return null;

  const expSeconds = payload.readUIntBE(ID_BYTES, EXP_BYTES);
  if (expSeconds !== 0 && expSeconds * 1000 < nowMs) return null;

  return bytesToUuid(payload.subarray(0, ID_BYTES));
}

/**
 * A short, **non-secret** handle for the same row — the tokenless URL the page redirects to
 * once it has verified the token and moved it into a cookie.
 *
 * Why redirect at all: a capability token left in the address bar reaches PostHog's
 * `$current_url` autocapture (the provider is mounted in the `[locale]` layout, so it covers
 * this page), Sentry's `request.url`, the `Referer` of any outbound link, and browser
 * history. The handle is derived rather than random so two invitations open in two tabs get
 * distinct cookies instead of clobbering each other.
 */
export function rsvpHandle(attendeeId: string): string {
  return createHmac("sha256", signingKey())
    .update(`handle:${attendeeId}`)
    .digest("base64url")
    .slice(0, 12);
}

/** The cookie the verified token lives in, scoped per invitation by its handle. */
export function rsvpCookieName(handle: string): string {
  return `rsvp_${handle}`;
}
