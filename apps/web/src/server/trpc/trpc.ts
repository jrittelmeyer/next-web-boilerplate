import "server-only";
import { log } from "@logtail/next";
import { auth } from "@repo/auth";
import { db } from "@repo/db";
import * as Sentry from "@sentry/nextjs";
import { initTRPC, TRPCError } from "@trpc/server";
import { after } from "next/server";
import superjson from "superjson";
import { getActiveOrganizationId, getOrgRole } from "@/lib/organization";
import { clientKeyFromHeaders, type RateLimitResult, rateLimit } from "@/lib/rate-limit";
import { getUserRole } from "@/lib/rbac";

/**
 * Per-request context. Both call sites — the HTTP handler (fetch adapter) and
 * the RSC server proxy — pass a `Headers` object so Better Auth can resolve the
 * session the same way in either path.
 *
 * `rateLimit.blocked` is a mutable slot the rate-limit middleware writes to when it
 * rejects a call, so the fetch handler's `responseMeta` can emit the standard
 * `RateLimit-*` / `Retry-After` headers on the 429 (the throw itself carries no way
 * to pass them out). A nested holder rather than a flat field so the reference — and
 * thus the write — survives even if the adapter hands `responseMeta` a shallow copy
 * of the context.
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({ headers: opts.headers });
  return {
    db,
    session,
    headers: opts.headers,
    rateLimit: { blocked: null as RateLimitResult | null },
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

// superjson must match the client link's transformer (lib/trpc/client.tsx) so
// Date/Map/etc. survive the wire in both directions.
const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });

export const createTRPCRouter = t.router;
/** @public — build a server-side caller (tests/scripts invoke procedures without HTTP). */
export const createCallerFactory = t.createCallerFactory;

/**
 * Request telemetry (Step 22). Applied to the base procedure below, so EVERY
 * procedure — public, protected, rate-limited, admin — inherits it. Times the call
 * and emits one structured BetterStack log line per resolution: `info` on success,
 * `warn` on an expected client error (UNAUTHORIZED / FORBIDDEN / TOO_MANY_REQUESTS /
 * BAD_REQUEST / …), `error` on a genuine server fault. Because it's outermost, it
 * also captures the rejections thrown by the auth / rate-limit middlewares below.
 *
 * Sentry only sees INTERNAL_SERVER_ERROR — expected client errors are normal traffic,
 * not exceptions, so reporting them would just be alert noise. This is also the ONLY
 * path tRPC faults reach Sentry: tRPC catches errors internally and formats them into
 * the response, so instrumentation.ts's `onRequestError` never observes them.
 *
 * Degrades gracefully: `@logtail/next`'s `log` falls back to console when BetterStack
 * env is unset, and `Sentry.captureException` is a no-op without a DSN.
 */
const timingMiddleware = t.middleware(async ({ next, path, type }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;

  if (result.ok) {
    log.info("trpc.request", { path, type, durationMs, ok: true });
  } else {
    const { code } = result.error;
    const fields = { path, type, durationMs, ok: false, code };
    if (code === "INTERNAL_SERVER_ERROR") {
      log.error("trpc.request", fields);
      Sentry.captureException(result.error.cause ?? result.error);
    } else {
      log.warn("trpc.request", fields);
    }
  }

  // Flush AFTER the response is sent (next/after) rather than inline: in a short-lived
  // (serverless) runtime the process can freeze/tear down before BetterStack's batched
  // logs ship, losing them. Scheduling the flush in after() guarantees delivery for
  // every request — success or error — without adding flush latency to the response.
  // `log` falls back to console when BetterStack env is unset, so it's a no-op cost there.
  after(() => log.flush());

  return result;
});

/**
 * Base procedure: `t.procedure` + request telemetry. Build every procedure from
 * this (never raw `t.procedure`) so all calls carry timing / error signal.
 */
const baseProcedure = t.procedure.use(timingMiddleware);

export const publicProcedure = baseProcedure;

/**
 * Requires a valid session. Narrows `ctx.session` to non-null for downstream
 * procedures so they can read `ctx.session.user` without re-checking.
 */
export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * App-level rate limiting for tRPC (Step 20). Keys by client IP (from the request
 * headers on ctx) plus the procedure path, so each procedure gets its own bucket.
 * Throws `TOO_MANY_REQUESTS` (HTTP 429) when the caller exceeds the limit. Compose
 * this for any public or expensive query (the abusable public reads `post.list` /
 * `search.search`). For an AUTHENTICATED abusable read, prefer `userRateLimitedProcedure`
 * below — it keys by the caller's user id instead of IP. Uses the shared limiter
 * (lib/rate-limit.ts) — in-memory by default, distributed when Upstash env is set. This
 * is the broader app-level limiter; Better Auth's own limiter still covers `/api/auth/*`
 * (Step 19).
 */
export const rateLimitedProcedure = baseProcedure.use(async ({ ctx, next, path }) => {
  const result = await rateLimit(`trpc:${path}:${clientKeyFromHeaders(ctx.headers)}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!result.success) {
    // Stash the blocked bucket so the fetch handler's `responseMeta` can emit the
    // standard RateLimit-*/Retry-After headers on the 429 (see route.ts). Only the
    // blocking result is recorded, so the headers always describe an exceeded bucket
    // even if a batched request mixes allowed and blocked calls.
    ctx.rateLimit.blocked = result;
    throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
  }
  return next();
});

/**
 * Protected + rate-limited, keyed by USER (Tier 4 · A16). The authenticated variant the
 * `rateLimitedProcedure` comment used to describe: it builds on `protectedProcedure`, so
 * a signed-out caller gets `UNAUTHORIZED` FIRST (before any bucket is touched) and the
 * body sees a non-null `ctx.session`, then keys the limiter by `ctx.session.user.id` +
 * path instead of client IP. Reach for this on an authenticated but ABUSABLE read — a
 * per-account expensive query where the fair unit is the user, not the source IP (one
 * IP NATs many users; one account can rotate IPs). The `user:` infix namespaces the key
 * off `rateLimitedProcedure`'s IP-keyed bucket so the two never collide for the same path.
 * Emits the SAME 429 + `RateLimit-*` / `Retry-After` headers via the shared
 * `ctx.rateLimit.blocked` slot (route.ts `responseMeta`), so no handler change is needed.
 * Example: `post.listMine`.
 */
export const userRateLimitedProcedure = protectedProcedure.use(async ({ ctx, next, path }) => {
  const result = await rateLimit(`trpc:${path}:user:${ctx.session.user.id}`, {
    limit: 20,
    windowSec: 60,
  });
  if (!result.success) {
    ctx.rateLimit.blocked = result;
    throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
  }
  return next();
});

/**
 * RBAC (Step 21). Builds on `protectedProcedure` (so it inherits the UNAUTHORIZED
 * check + non-null session), then authoritatively reads the caller's role from
 * the DB — not from the session, which can be up to 5 min stale via the Step-19
 * cookie cache (see lib/rbac.ts). A non-admin gets FORBIDDEN (HTTP 403); the role
 * is attached to ctx for the procedure body.
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = await getUserRole(ctx.session.user.id);
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { ...ctx, role } });
});

/**
 * Organizations (Tier 4 · Band 4). Builds on `protectedProcedure`, then requires the
 * caller to have an ACTIVE organization they're a member of. Both reads are
 * authoritative (lib/organization) — the active org bypasses the session cookie cache
 * and the membership role comes fresh from Postgres — so a just-created / just-switched
 * org works on the very next request and a removed member loses access immediately
 * (the org-plugin analogue of `adminProcedure`'s fresh role read; see lib/organization).
 *
 * No active org → BAD_REQUEST ("select an organization first"); active org set but the
 * caller isn't a member of it (stale pointer / just removed) → FORBIDDEN. The active
 * org id and the caller's `orgRole` are attached to ctx for the procedure body. This is
 * the base for org-scoped tRPC queries (the members list, org-scoped reads); org-scoped
 * WRITES stay in Server Actions (server/actions/post.ts), same split as the rest of the app.
 * @public — the base for consumers' org-scoped queries; API surface ahead of first in-app use.
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const activeOrganizationId = await getActiveOrganizationId(ctx.headers);
  if (!activeOrganizationId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No active organization" });
  }
  const orgRole = await getOrgRole(activeOrganizationId, ctx.session.user.id);
  if (!orgRole) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { ...ctx, activeOrganizationId, orgRole } });
});
