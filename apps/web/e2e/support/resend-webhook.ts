import { createHmac } from "node:crypto";

/**
 * The email-suppression E2E's webhook contract (path-to-100 #8). The :3001
 * email-capture server also gets this fake-but-well-formed svix signing secret
 * (playwright.config.ts sets RESEND_WEBHOOK_SECRET to it), which flips on BOTH
 * halves of #8: the /api/resend/webhook route verifies against it, and the send
 * helper's suppression consult engages. The spec then SELF-SIGNS event payloads —
 * the svix scheme is plain HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` with
 * the base64-decoded secret (whsec_ prefix stripped), verified in the installed
 * standardwebhooks@1.0.0 that resend's `webhooks.verify` delegates to — so the E2E
 * exercises the REAL verification path with no provider, no network, no new dep.
 */
export const RESEND_WEBHOOK_TEST_SECRET = `whsec_${Buffer.from(
  "e2e-resend-webhook-signing-secret",
).toString("base64")}`;

/** Sign a raw webhook body the way svix/Resend would; returns the three headers. */
export function signResendWebhook(body: string): {
  "svix-id": string;
  "svix-timestamp": string;
  "svix-signature": string;
  "content-type": string;
} {
  const id = `msg_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(RESEND_WEBHOOK_TEST_SECRET.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
    // The signature covers the exact raw bytes, so the spec passes `body` as a
    // pre-serialized string; declare its type explicitly.
    "content-type": "application/json",
  };
}
