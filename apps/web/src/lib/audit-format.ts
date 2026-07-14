import type { AuditAction } from "@repo/db/schema";

// Presentational mapper for `audit_log` rows (B2 read UI). Turns an event's `action`
// + `metadata` (an opaque `jsonb` column, so `unknown` at the type level) into a short
// human label and a one-line detail — the branchy, defensive narrowing that the
// `/admin/audit` Server Component would otherwise inline. Pure + deterministic so it's
// unit-tested (coverage-included); the page keeps only the DB read + timestamp/identity
// rendering. Identity (actor/target email) is resolved by the page's JOINs, not here.

export type AuditEventDisplay = {
  /** Short human label for the action, e.g. "Role changed". */
  label: string;
  /** One-line detail derived from `metadata`, or `null` when there's nothing to show. */
  detail: string | null;
};

// Exhaustive over the union — a new `AuditAction` won't compile until it's labelled.
const ACTION_LABELS: Record<AuditAction, string> = {
  "user.role_changed": "Role changed",
  "user.deleted": "User deleted",
  "user.email_changed": "Email changed",
  "user.signed_in": "Signed in",
  "user.banned": "User banned",
  "user.unbanned": "User unbanned",
  "user.impersonated": "User impersonated",
  "user.impersonation_stopped": "Impersonation stopped",
};

/** `metadata` is `jsonb` → `unknown`; only a non-null object carries usable detail. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** A present, non-empty string field, else `null` (a `jsonb` value can be anything). */
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Describe one audit event for display. `action` is typed `string` (not `AuditAction`)
 * on purpose: the column is open `text`, so an out-of-band writer / a fork's new event
 * is rendered with its raw action as the label rather than dropped.
 */
export function describeAuditEvent(event: {
  action: string;
  metadata: unknown;
}): AuditEventDisplay {
  const label = ACTION_LABELS[event.action as AuditAction] ?? event.action;
  const meta = asRecord(event.metadata);
  return { label, detail: meta ? deriveDetail(event.action, meta) : null };
}

function deriveDetail(action: string, meta: Record<string, unknown>): string | null {
  switch (action) {
    case "user.role_changed": {
      const from = str(meta.oldRole);
      const to = str(meta.newRole);
      return from && to ? `${from} → ${to}` : null;
    }
    case "user.email_changed": {
      const from = str(meta.oldEmail);
      const to = str(meta.newEmail);
      return from && to ? `${from} → ${to}` : null;
    }
    case "user.signed_in": {
      const ip = str(meta.ip);
      return ip ? `from ${ip}` : null;
    }
    case "user.banned": {
      const reason = str(meta.reason);
      return reason ? `reason: ${reason}` : null;
    }
    default:
      return null;
  }
}
