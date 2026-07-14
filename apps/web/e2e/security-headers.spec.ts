import { expect, test } from "@playwright/test";

// Guards the securityHeaders set in next.config.ts (see docs/context/SECURITY.md).
// Asserts only the environment-unconditional headers so the spec passes against
// any server (HSTS and the CSP's dev/prod extras vary by NODE_ENV).
test("every response carries the security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const headers = response.headers();

  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");

  const csp = headers["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
});
