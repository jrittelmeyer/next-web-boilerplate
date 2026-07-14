import "server-only";

/**
 * App-level rate limiting (Step 20). A STANDALONE utility that mirrors Better
 * Auth's limiter posture (a window/max model, in-memory default, graceful
 * degradation) for the surfaces Better Auth does NOT cover: the Stripe webhook,
 * Server Actions, and tRPC procedures. Better Auth's built-in limiter still owns
 * the `/api/auth/*` routes (Step 19) — this does not touch them.
 *
 * Default store is in-memory: a per-instance fixed-window counter. It resets on
 * restart and is NOT shared across instances, so it's correct for single-instance
 * / local dev only. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to
 * switch to a distributed Upstash sliding-window limiter — required for any
 * multi-instance or serverless deployment, where per-instance memory isn't shared.
 *
 * The Upstash client is imported lazily and only when configured, so its deps are
 * never loaded (and never construct) when unconfigured — same graceful-degradation
 * posture as lib/stripe.ts / lib/search.ts. The Upstash REST calls are
 * server-to-server (this is `server-only`), so they need no CSP allowlist entry.
 */

export interface RateLimitResult {
  /** Whether the request is allowed (i.e. under the limit). */
  success: boolean;
  /** Max requests permitted per window. */
  limit: number;
  /** Requests remaining in the current window (0 once blocked). */
  remaining: number;
  /** Unix epoch milliseconds when the current window resets. */
  reset: number;
}

export interface RateLimitOptions {
  /** Max requests allowed per window. Default 10. */
  limit?: number;
  /** Window length in seconds. Default 60. */
  windowSec?: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_SEC = 60;

/** True when both Upstash REST vars are set (distributed limiter is active). */
export function isDistributedRateLimitConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// --- In-memory fixed-window store (default) -------------------------------------

interface Bucket {
  count: number;
  /** Epoch ms when this window ends and the counter resets. */
  reset: number;
}

const memoryStore = new Map<string, Bucket>();
let lastPrune = 0;

/**
 * Amortized cleanup so the Map can't grow unbounded across many distinct keys.
 * Sweeps expired buckets at most once a minute (cheap; the store is small).
 */
function pruneExpired(now: number): void {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, bucket] of memoryStore) {
    if (now >= bucket.reset) memoryStore.delete(key);
  }
}

function memoryRateLimit(identifier: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const existing = memoryStore.get(identifier);

  if (!existing || now >= existing.reset) {
    const reset = now + windowSec * 1000;
    memoryStore.set(identifier, { count: 1, reset });
    pruneExpired(now);
    return { success: true, limit, remaining: limit - 1, reset };
  }

  existing.count += 1;
  return {
    success: existing.count <= limit,
    limit,
    remaining: Math.max(0, limit - existing.count),
    reset: existing.reset,
  };
}

// --- Upstash sliding-window store (opt-in via env) ------------------------------

type UpstashRatelimit = import("@upstash/ratelimit").Ratelimit;

// Cache one Ratelimit instance per (limit, windowSec) combination — each Upstash
// limiter is bound to a fixed algorithm/limit at construction, so different call
// sites with different limits need different instances.
const upstashLimiters = new Map<string, Promise<UpstashRatelimit>>();

function getUpstashLimiter(limit: number, windowSec: number): Promise<UpstashRatelimit> {
  const key = `${limit}:${windowSec}`;
  let limiterPromise = upstashLimiters.get(key);
  if (!limiterPromise) {
    limiterPromise = (async () => {
      const { Ratelimit } = await import("@upstash/ratelimit");
      const { Redis } = await import("@upstash/redis");
      return new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
        prefix: "nwb:ratelimit",
        // Analytics writes extra keys per request; off by default to keep it lean.
        analytics: false,
      });
    })();
    upstashLimiters.set(key, limiterPromise);
  }
  return limiterPromise;
}

// --- Public API -----------------------------------------------------------------

/**
 * Check (and consume) one unit of the rate limit for `identifier`. Prefix the
 * identifier per surface (e.g. `webhook:${ip}`, `checkout:${userId}`) so different
 * call sites don't share a bucket. Always async so the in-memory and Upstash paths
 * share one signature.
 */
export async function rateLimit(
  identifier: string,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowSec = options.windowSec ?? DEFAULT_WINDOW_SEC;

  if (isDistributedRateLimitConfigured()) {
    try {
      const limiter = await getUpstashLimiter(limit, windowSec);
      const res = await limiter.limit(identifier);
      return { success: res.success, limit: res.limit, remaining: res.remaining, reset: res.reset };
    } catch (err) {
      // Fail OPEN if Upstash is unreachable: a transient Redis blip shouldn't lock
      // every user out. Logged so it's visible. Flip to a denying result here (and
      // log) if your app prefers fail-closed.
      console.error("[rate-limit] Upstash unavailable, allowing request:", err);
      return { success: true, limit, remaining: limit, reset: Date.now() + windowSec * 1000 };
    }
  }

  return memoryRateLimit(identifier, limit, windowSec);
}

/**
 * Resolve the client IP from the standard proxy headers — `x-forwarded-for` is a
 * comma-separated list whose first entry is the originating client; `x-real-ip` is
 * the single-value fallback. Returns `null` when neither yields a value, so callers
 * can decide their own policy for an unresolved source instead of silently sharing
 * one bucket. NOTE: these headers are only trustworthy behind a proxy that sets (and
 * sanitizes) them — a directly internet-facing app can have them spoofed, bypassing
 * IP limiting. See SECURITY.md ("Client IP resolution & trusted proxies").
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

/**
 * Best-effort client key for IP-based limiting: the resolved IP, or the constant
 * `"unknown"` when none is present so an unknown source still shares one bucket
 * rather than bypassing the limit entirely. This is the fail-SAFE choice for
 * low-stakes surfaces (e.g. public tRPC reads); a surface that wants to treat the
 * IP-less case differently should call `clientIpFromHeaders` and branch on `null`.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  return clientIpFromHeaders(headers) ?? "unknown";
}

/**
 * The standard rate-limit response headers for a blocked (429) request — the single
 * source of truth for the header contract, shared by every HTTP surface that returns
 * a 429 from this limiter (the tRPC handler's `responseMeta`, the Stripe webhook).
 * `RateLimit-*` follow the IETF draft (draft-ietf-httpapi-ratelimit-headers) and
 * `Retry-After` follows RFC 9110 — both `Reset`/`Retry-After` are delta-seconds until
 * the window resets, derived from the same `reset` epoch the limiter already returns
 * (floored at 0 so a just-elapsed window never yields a negative). Emit these on the
 * 429 only. NOTE: auth routes (`/api/auth/*`) are covered by Better Auth's own limiter,
 * which emits its own `X-Retry-After` header — this helper does not touch them.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const resetSec = String(Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)));
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": resetSec,
    "Retry-After": resetSec,
  };
}
