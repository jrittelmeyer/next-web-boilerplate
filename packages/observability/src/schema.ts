import { z } from "zod";

/**
 * Schemas for the checked-in BetterStack monitoring/alerting config — the
 * "dashboards-as-code" contract. They give us two things a bare TS type can't:
 *
 *  1. Value-level validation TS won't catch (a malformed URL, a `period` below
 *     BetterStack's 30s floor, an unknown monitor type) — surfaced by `check.ts`
 *     in CI with no credentials.
 *  2. A single source of truth the typed `config.ts` and the `sync.ts` uploader
 *     both share, so the config can't drift from what gets sent to the API.
 *
 * Fields are camelCase here (idiomatic TS); `sync.ts` maps them to BetterStack's
 * snake_case API attributes at the boundary, so the mapping is explicit and the
 * config stays readable.
 */

/** Who gets paged. Shared by monitors and heartbeats (BetterStack uses the same
 *  boolean alert channels on both). `push` is heartbeat-only on the API, so it's
 *  modelled per-resource below. */
const alertChannels = z.object({
  email: z.boolean().default(true),
  sms: z.boolean().default(false),
  call: z.boolean().default(false),
});

/** Monitor types BetterStack accepts (subset we expose; the API supports more). */
export const monitorType = z.enum([
  "status",
  "expected_status_code",
  "keyword",
  "keyword_absence",
  "ping",
  "tcp",
]);

/**
 * An uptime monitor — an HTTP/host check BetterStack runs on a schedule and
 * alerts on when it fails. Our shipped example watches `/api/health`.
 */
export const MonitorSchema = z.object({
  /** Human-readable name → API `pronounceable_name`. Also the upsert match key. */
  name: z.string().min(1),
  /** What to check → API `url`. */
  url: z.url(),
  /** → API `monitor_type`. */
  monitorType: monitorType.default("expected_status_code"),
  /** HTTP codes treated as healthy → API `expected_status_codes`. */
  expectedStatusCodes: z.array(z.int().min(100).max(599)).min(1).default([200]),
  /** How often to check, seconds → API `check_frequency`. */
  checkFrequencySeconds: z.int().min(30).default(180),
  /** Alert channels → API `email`/`sms`/`call`. `prefault` (not `default`) so an
   *  omitted/partial `notify` is parsed through the per-channel defaults. */
  notify: alertChannels.prefault({}),
});
export type Monitor = z.infer<typeof MonitorSchema>;

/**
 * A heartbeat — an inverse check: BetterStack expects a periodic ping and
 * alerts when one fails to arrive. Our shipped example watches the pg-boss
 * worker, which otherwise dies silently (jobs just queue). The worker pings the
 * URL BetterStack returns for this heartbeat (see `BETTER_STACK_HEARTBEAT_URL`).
 */
export const HeartbeatSchema = z.object({
  /** Human-readable name → API `name`. Also the upsert match key. */
  name: z.string().min(1),
  /** Expected ping frequency, seconds (BetterStack floor is 30) → API `period`. */
  periodSeconds: z.int().min(30).default(60),
  /** Slack before a missed ping alerts, seconds → API `grace`. */
  graceSeconds: z.int().min(0).default(180),
  /** Alert channels → API `email`/`sms`/`call`/`push`. `prefault` (not `default`)
   *  so an omitted/partial `notify` is parsed through the per-channel defaults. */
  notify: alertChannels.extend({ push: z.boolean().default(false) }).prefault({}),
});
export type Heartbeat = z.infer<typeof HeartbeatSchema>;
