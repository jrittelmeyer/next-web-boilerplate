import { createHmac } from "node:crypto";

/**
 * A minimal RFC 6238 TOTP generator for the 2FA E2E — it plays the role of an
 * authenticator app (Google Authenticator, 1Password, …), computing the same 6-digit
 * code from the enrollment secret so the test can answer the challenge. Deliberately an
 * in-repo ~30 lines rather than a dependency (the same "no library for a tiny, stable
 * primitive" ethos as `lib/user-agent.ts`). Defaults match Better Auth's twoFactor()
 * plugin: HMAC-SHA1, 6 digits, 30-second period.
 */

// Decode a standard RFC 4648 base32 secret (no padding needed) to bytes. Authenticator
// URIs (`otpauth://…?secret=…`) carry the secret base32-encoded; this reverses that.
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** Compute the current TOTP code for a base32 secret (RFC 6238, SHA1/6-digit/30s). */
export function generateTotp(base32Secret: string, atMs: number = Date.now()): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(atMs / 1000 / 30);

  // 8-byte big-endian counter.
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  // Dynamic truncation (RFC 4226 §5.3).
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (binary % 1_000_000).toString().padStart(6, "0");
}

/** Pull the base32 secret out of an `otpauth://…?secret=…` enrollment URI. */
export function secretFromOtpauthUri(uri: string): string {
  const match = /[?&]secret=([^&]+)/i.exec(uri);
  if (!match?.[1]) throw new Error(`No secret in otpauth URI: ${uri}`);
  return decodeURIComponent(match[1]);
}
