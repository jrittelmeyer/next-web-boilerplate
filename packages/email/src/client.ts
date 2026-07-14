import "server-only";
import { Resend } from "resend";

/**
 * Lazy Resend client (guarded singleton, same posture as apps/web's lib/stripe.ts).
 *
 * `new Resend(undefined)` THROWS "Missing API key" in resend v6, so it must NOT be
 * constructed at import time — otherwise any module that imports @repo/email (e.g.
 * @repo/auth, which is in the /api/auth route graph) would break `next build` when
 * RESEND_API_KEY is unset, violating the "builds without creds" guarantee.
 * Construct on first use instead; callers gate on isEmailConfigured() (see send.tsx)
 * and degrade gracefully, so getResend() is only reached when the key is present.
 * RESEND_API_KEY is optional and validated at the app boundary (apps/web/src/env.ts).
 */
let client: Resend | undefined;

export function getResend(): Resend {
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}
