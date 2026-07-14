import "./load-env";
import { heartbeats, monitors } from "./config";
import type { Heartbeat, Monitor } from "./schema";

/**
 * Pushes the checked-in config (`config.ts`) to BetterStack via the Uptime REST
 * API v2 — the "apply" half of dashboards-as-code.
 *
 *   pnpm --filter @repo/observability sync
 *
 * Graceful by design: with BETTER_STACK_API_TOKEN unset it logs and no-ops (so a
 * clone/CI never needs credentials), mirroring `enqueue()`/`getStripe()`. With a
 * token it upserts idempotently — match by name, PATCH if present else POST — so
 * re-running it converges rather than duplicating. A real API error throws
 * (non-zero exit): unlike a request-path call, a manual sync SHOULD fail loudly.
 */

const API_BASE = "https://uptime.betterstack.com/api/v2";

interface BetterStackItem {
  id: string;
  attributes: Record<string, unknown>;
}
interface BetterStackList {
  data: BetterStackItem[];
  pagination?: { next: string | null };
}

async function bsFetch(
  pathOrUrl: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<Response> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `BetterStack ${init?.method ?? "GET"} ${url} → ${res.status} ${res.statusText}: ${detail}`,
    );
  }
  return res;
}

/** Fetch every page of a resource list so the upsert match-by-name is exhaustive. */
async function listAll(resource: string, token: string): Promise<BetterStackItem[]> {
  const items: BetterStackItem[] = [];
  let next: string | null = `/${resource}?per_page=50`;
  while (next) {
    const res = await bsFetch(next, token);
    const page = (await res.json()) as BetterStackList;
    items.push(...page.data);
    next = page.pagination?.next ?? null;
  }
  return items;
}

/** Match by the resource's human-readable name field, then PATCH or POST. */
async function upsert(
  resource: string,
  matchField: string,
  name: string,
  body: Record<string, unknown>,
  token: string,
): Promise<void> {
  const existing = await listAll(resource, token);
  const match = existing.find((item) => item.attributes[matchField] === name);
  if (match) {
    await bsFetch(`/${resource}/${match.id}`, token, { method: "PATCH", body });
    console.info(`[observability] updated ${resource}: ${name}`);
  } else {
    await bsFetch(`/${resource}`, token, { method: "POST", body });
    console.info(`[observability] created ${resource}: ${name}`);
  }
}

/** camelCase config → BetterStack's snake_case monitor attributes. */
function monitorBody(m: Monitor): Record<string, unknown> {
  return {
    monitor_type: m.monitorType,
    url: m.url,
    pronounceable_name: m.name,
    expected_status_codes: m.expectedStatusCodes,
    check_frequency: m.checkFrequencySeconds,
    email: m.notify.email,
    sms: m.notify.sms,
    call: m.notify.call,
  };
}

/** camelCase config → BetterStack's snake_case heartbeat attributes. */
function heartbeatBody(h: Heartbeat): Record<string, unknown> {
  return {
    name: h.name,
    period: h.periodSeconds,
    grace: h.graceSeconds,
    email: h.notify.email,
    sms: h.notify.sms,
    call: h.notify.call,
    push: h.notify.push,
  };
}

async function main(): Promise<void> {
  const token = process.env.BETTER_STACK_API_TOKEN;
  if (!token) {
    console.info(
      "[observability] BETTER_STACK_API_TOKEN not set — skipping sync (no-op). " +
        "Set it to push monitors + heartbeats to BetterStack.",
    );
    return;
  }

  for (const m of monitors) {
    await upsert("monitors", "pronounceable_name", m.name, monitorBody(m), token);
  }
  for (const h of heartbeats) {
    await upsert("heartbeats", "name", h.name, heartbeatBody(h), token);
  }

  console.info(
    `[observability] sync complete — ${monitors.length} monitor(s), ${heartbeats.length} heartbeat(s).`,
  );
}

main().catch((err: unknown) => {
  console.error("[observability] sync failed:", err);
  process.exit(1);
});
