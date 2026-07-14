import { z } from "zod";

// Format schemas for the env vars whose validation needs real logic (P1-4).
// They live outside env.ts because that module runs createEnv() at import —
// Vitest aliases `@/env` to a stub for exactly that reason — so the logic is
// only testable as plain schemas. Both stay `.optional()`: graceful degradation
// covers UNSET env; only a set-and-malformed value fails (loudly, at boot).

const address = z.email();

// RFC-5322-style name-addr: optional display name + <angle-addr>.
const NAME_ADDR = /^[^<>]*<([^<>]+)>$/;

/**
 * Sender for outgoing email. Resend accepts a bare address
 * ("noreply@example.com") or the display-name form its docs use as the
 * canonical example ("Acme <noreply@example.com>") — a strict z.email() would
 * reject the latter. Either shape must carry a valid address.
 */
export const emailFromSchema = z
  .string()
  .refine(
    (value) => address.safeParse(NAME_ADDR.exec(value)?.[1] ?? value).success,
    'must be an email address, bare or in the "Name <address>" form',
  )
  .optional();

/**
 * Comma-separated extra trusted origins for Better Auth. Validate-only — the
 * consumer (packages/auth trustedOrigins()) re-splits process.env itself, so
 * this mirrors its tolerance exactly: entries are trimmed and empty entries
 * (trailing comma) are ignored. Each remaining entry must be a parseable URL
 * (https origins, custom-scheme deep links like "myapp://…") or contain a "*" —
 * Better Auth matches wildcard patterns ("https://*.vercel.app",
 * "*.example.com") itself, so those must never fail here.
 */
export const trustedOriginsSchema = z
  .string()
  .superRefine((value, ctx) => {
    for (const entry of value.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed || trimmed.includes("*") || URL.canParse(trimmed)) continue;
      ctx.addIssue({
        code: "custom",
        message: `"${trimmed}" is not a URL or *-wildcard origin pattern`,
      });
    }
  })
  .optional();
