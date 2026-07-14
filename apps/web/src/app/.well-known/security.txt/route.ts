import { siteUrl } from "@/lib/site";

// Serves /.well-known/security.txt (RFC 9116) — the standard disclosure channel
// security researchers look for. A route handler (not a static public/ file) so
// the REQUIRED `Expires` field is computed at request time instead of a
// hand-maintained date, matching the generated posture of the sibling metadata
// routes (robots.ts / sitemap.ts / manifest.ts). Reads `siteUrl` from @/lib/site
// for `Canonical` exactly like robots.ts (the SITE_URL ?? BETTER_AUTH_URL ??
// localhost fallback lives there, so this works with the env unset).
//
// ⚠ Replace the placeholder `Contact` before production — and ideally add a PGP
// `Encryption:` key and a PGP-signed variant. See https://securitytxt.org.
export function GET(): Response {
  // Expires is REQUIRED by RFC 9116 (ISO 8601). Computed ~1 year out at request
  // time, so the file never serves an already-expired date.
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const body = `# Replace the placeholder contact below before deploying to production.
# Format: RFC 9116 — https://www.rfc-editor.org/rfc/rfc9116 (https://securitytxt.org)
Contact: mailto:security@example.com
Expires: ${expires}
Preferred-Languages: en
Canonical: ${siteUrl}/.well-known/security.txt
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
