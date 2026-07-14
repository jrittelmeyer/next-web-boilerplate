import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientIpFromHeaders,
  clientKeyFromHeaders,
  isDistributedRateLimitConfigured,
  rateLimit,
  rateLimitHeaders,
} from "./rate-limit";

// One shared mock for the Upstash limiter's `limit()`; the SUT caches limiter
// instances, but each instance's `limit` IS this fn, so reconfiguring it per test
// works regardless of caching. Hoisted so the vi.mock factories can reference it.
const { upstashLimit } = vi.hoisted(() => ({ upstashLimit: vi.fn() }));

vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({}) } }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    limit = upstashLimit;
    static slidingWindow() {
      return {};
    }
  },
}));

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientIpFromHeaders(h)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip when forwarded-for is absent", () => {
    const h = new Headers({ "x-real-ip": "3.3.3.3" });
    expect(clientIpFromHeaders(h)).toBe("3.3.3.3");
  });

  it("falls back to x-real-ip when the first forwarded entry is empty", () => {
    const h = new Headers({ "x-forwarded-for": " , 9.9.9.9", "x-real-ip": "8.8.8.8" });
    expect(clientIpFromHeaders(h)).toBe("8.8.8.8");
  });

  it("returns null when no proxy headers are present", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe("clientKeyFromHeaders", () => {
  it("returns the resolved IP when present", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientKeyFromHeaders(h)).toBe("1.1.1.1");
  });

  it("falls back to 'unknown' when no proxy headers are present", () => {
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("isDistributedRateLimitConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false when the Upstash env vars are unset", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(isDistributedRateLimitConfigured()).toBe(false);
  });

  it("is true when both Upstash env vars are set", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    expect(isDistributedRateLimitConfigured()).toBe(true);
  });
});

describe("rateLimit (in-memory store)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows the first request and decrements remaining", async () => {
    const r = await rateLimit("mem:first", { limit: 3, windowSec: 60 });
    expect(r).toMatchObject({ success: true, limit: 3, remaining: 2 });
  });

  it("uses the default limit/window when options are omitted", async () => {
    const r = await rateLimit("mem:defaults");
    expect(r.limit).toBe(10);
    expect(r.remaining).toBe(9);
  });

  it("blocks once the limit is exceeded within the window", async () => {
    const id = "mem:block";
    const opts = { limit: 2, windowSec: 60 };
    expect((await rateLimit(id, opts)).success).toBe(true);
    expect((await rateLimit(id, opts)).success).toBe(true);
    expect(await rateLimit(id, opts)).toMatchObject({ success: false, remaining: 0 });
  });

  it("resets the counter after the window elapses", async () => {
    const id = "mem:reset";
    const opts = { limit: 1, windowSec: 60 };
    expect((await rateLimit(id, opts)).success).toBe(true);
    expect((await rateLimit(id, opts)).success).toBe(false);
    vi.setSystemTime(61_000); // past the 60s window
    expect((await rateLimit(id, opts)).success).toBe(true);
  });

  it("sweeps expired buckets after the prune interval", async () => {
    // Seed a bucket that will expire, then open a new window far enough ahead that
    // the prune interval (60s since lastPrune) has elapsed — exercising the sweep.
    await rateLimit("mem:prune:victim", { limit: 1, windowSec: 1 });
    vi.setSystemTime(10_000_000);
    await rateLimit("mem:prune:trigger", { limit: 1, windowSec: 1 });
    expect((await rateLimit("mem:prune:victim", { limit: 1, windowSec: 1 })).success).toBe(true);
  });
});

describe("rateLimit (Upstash distributed store)", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    upstashLimit.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("passes through the Upstash limiter result", async () => {
    upstashLimit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 999 });
    const r = await rateLimit("up:ok", { limit: 5, windowSec: 10 });
    expect(r).toEqual({ success: true, limit: 5, remaining: 4, reset: 999 });
    expect(upstashLimit).toHaveBeenCalledWith("up:ok");
  });

  it("fails OPEN when Upstash is unreachable", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    upstashLimit.mockRejectedValue(new Error("redis down"));
    // Same (limit, windowSec) as the test above, so this reuses the cached limiter
    // instance — covering the cache-hit branch in getUpstashLimiter.
    const r = await rateLimit("up:err", { limit: 5, windowSec: 10 });
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(5);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("rateLimitHeaders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("maps a blocked result to the four standard headers (reset as delta-seconds)", () => {
    // reset 42s in the future → RateLimit-Reset and Retry-After both = 42.
    const h = rateLimitHeaders({ success: false, limit: 20, remaining: 0, reset: 42_000 });
    expect(h).toEqual({
      "RateLimit-Limit": "20",
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": "42",
      "Retry-After": "42",
    });
  });

  it("rounds the reset delta up to whole seconds", () => {
    // 1.2s out → ceil → 2, so a client never retries a hair too early.
    const h = rateLimitHeaders({ success: false, limit: 5, remaining: 0, reset: 1_200 });
    expect(h["RateLimit-Reset"]).toBe("2");
    expect(h["Retry-After"]).toBe("2");
  });

  it("floors a just-elapsed window to 0 instead of a negative delta", () => {
    const h = rateLimitHeaders({ success: false, limit: 5, remaining: 0, reset: -5_000 });
    expect(h["RateLimit-Reset"]).toBe("0");
    expect(h["Retry-After"]).toBe("0");
  });
});
