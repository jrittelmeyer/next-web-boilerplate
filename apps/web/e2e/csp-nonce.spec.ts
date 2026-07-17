import { expect, type Page, test } from "@playwright/test";
import { makeTestUser, signUp } from "./support/auth";

/**
 * CSP_MODE=nonce matrix (path-to-100 #10). This spec only runs against a build
 * made with CSP_MODE=nonce — playwright.config.ts routes it to the dedicated
 * `chromium-csp-nonce` project in that mode and excludes it from the default
 * suite (a static-CSP server would fail every assertion here by design). In CI
 * it runs in the variable-gated `csp-nonce` lane (DEPLOYMENT.md → CI/CD).
 *
 * What "nonce mode works" means, per docs/context/SECURITY.md → CSP strategy:
 * a per-request 'nonce-…' 'strict-dynamic' script-src (no 'unsafe-inline'),
 * rotating on every request, stamped on every <script> tag in the served HTML
 * for BOTH locales — and the app still functions end-to-end with zero CSP
 * violations (a strict CSP that blocks the bootstrap fails silently for users,
 * so the console guard is the real assertion).
 */

const NONCE_RE = /'nonce-([A-Za-z0-9+/=]+)'/;

function scriptSrcOf(csp: string): string {
  const directive = csp.split(";").find((d) => d.trim().startsWith("script-src"));
  expect(directive, `script-src directive present in: ${csp}`).toBeTruthy();
  return directive as string;
}

// Collect CSP-violation console output for the lifetime of a page. Chromium
// reports enforcement as console errors ("Refused to execute inline script…" /
// "…violates the following Content Security Policy directive…").
function trackCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to (execute|load|apply|connect|frame)/i.test(text)) {
      violations.push(text);
    }
  });
  return violations;
}

test("per-request nonce CSP on both locales, rotating every request", async ({ request }) => {
  for (const path of ["/", "/es"]) {
    const [first, second] = [await request.get(path), await request.get(path)];
    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(true);

    const csp = first.headers()["content-security-policy"] ?? "";
    expect(csp, `CSP header on ${path}`).toBeTruthy();

    // The strict policy: nonce + 'strict-dynamic', and script-src has dropped
    // 'unsafe-inline' (style-src deliberately keeps it — inline style= attributes
    // can't be nonced).
    const scriptSrc = scriptSrcOf(csp);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toMatch(NONCE_RE);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");

    // Single-use: a fresh nonce per request.
    const nonce = scriptSrcOf(csp).match(NONCE_RE)?.[1];
    const nonceAgain = scriptSrcOf(second.headers()["content-security-policy"] ?? "").match(
      NONCE_RE,
    )?.[1];
    expect(nonce).toBeTruthy();
    expect(nonceAgain).toBeTruthy();
    expect(nonceAgain).not.toBe(nonce);
  }
});

test("every script tag in the served HTML carries that request's nonce", async ({ request }) => {
  // Raw-HTML check (request fixture, no browser): browsers hide the nonce
  // content attribute after parsing, so DOM getAttribute("nonce") reads "" —
  // the wire HTML is the only place the stamping is observable.
  for (const path of ["/", "/es"]) {
    const response = await request.get(path);
    const nonce = scriptSrcOf(response.headers()["content-security-policy"] ?? "").match(
      NONCE_RE,
    )?.[1];
    expect(nonce).toBeTruthy();

    const html = await response.text();
    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    // A page with no scripts would vacuously pass — make sure Next's bootstrap
    // and the next-themes pre-paint inline script are actually there.
    expect(scriptTags.length).toBeGreaterThan(1);
    for (const tag of scriptTags) {
      expect(tag, `un-nonced script tag on ${path}: ${tag}`).toContain(`nonce="${nonce}"`);
    }
  }
});

test("primary journeys run with zero CSP violations", async ({ page }) => {
  const violations = trackCspViolations(page);

  // Landing: the next-themes pre-paint script is the one inline script the
  // layout nonces by hand — if the nonce hand-off broke, the CSP blocks it and
  // <html> never gets its theme class.
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("class", /light|dark/);

  // Auth → dashboard (hydrated forms, router navigation).
  const user = makeTestUser("csp-nonce");
  await signUp(page, user);

  // Posts: create one through the UI — also proves the `"use cache"` +
  // updateTag("posts") path still works in this mode (cacheComponents off,
  // experimental.useCache on; see next.config.ts).
  await page.goto("/posts");
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();
  const title = `CSP nonce post ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Content").fill("Created by the CSP nonce spec.");
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  // Account (authenticated settings surface).
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();

  expect(violations, `CSP violations:\n${violations.join("\n")}`).toEqual([]);
});
