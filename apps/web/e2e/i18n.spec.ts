import { expect, test } from "@playwright/test";

// i18n E2E (#21 step 5): drives the user-facing internationalization end-to-end —
// the LanguageSwitcher (step 3), the localized <title> + hreflang alternates
// (step 4), and locale-aware auth gating (step 2b). All four flows are public /
// unauthenticated, so this is a DB-free spec (no sign-up, no signUp-flake). The
// switcher trigger has an sr-only, LOCALIZED label, so it's matched with a
// locale-agnostic name regex; the radio items are endonyms ("English"/"Español"),
// identical in both locales.

test("the language switcher flips the landing page between en and es", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("next-web-boilerplate");
  await expect(page.getByText("Production-ready Next.js starter")).toBeVisible();

  // → Spanish: re-navigates to the same path under /es (as-needed prefixing).
  await page.getByRole("button", { name: /Change language|Cambiar idioma/ }).click();
  await page.getByRole("menuitemradio", { name: "Español" }).click();
  await page.waitForURL("**/es");
  await expect(page.getByText("Starter de Next.js listo para producción")).toBeVisible();

  // → back to English: the default locale is unprefixed again ("/").
  await page.getByRole("button", { name: /Change language|Cambiar idioma/ }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByText("Production-ready Next.js starter")).toBeVisible();
});

test("page titles localize per locale", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/^Sign in ·/);

  await page.goto("/es/login");
  await expect(page).toHaveTitle(/^Iniciar sesión ·/);
});

test("public pages expose hreflang alternates in the head", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
  await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
    "href",
    /\/es\/login$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
});

test("the posts demo page renders in Spanish under /es (path-to-100 #7)", async ({ page }) => {
  // Full-surface coverage: the demo/scaffold routes are translated too. Both
  // assertions live in the PPR static shell (composer card title + posts card
  // description), so this stays DB-free like the rest of the file.
  await page.goto("/es/posts");
  await expect(page.getByText("Nueva publicación")).toBeVisible();
  await expect(
    page.getByText("Se leen mediante la consulta pública de tRPC, las más recientes primero."),
  ).toBeVisible();
});

test("an unauthenticated /es/dashboard visit bounces to the es login carrying redirectTo", async ({
  page,
}) => {
  await page.goto("/es/dashboard");
  await page.waitForURL(/\/es\/login\?redirectTo=/);

  const url = new URL(page.url());
  expect(url.pathname).toBe("/es/login");
  expect(url.searchParams.get("redirectTo")).toBe("/es/dashboard");

  // The localized sign-in form renders (exact match avoids the "Iniciar sesión con
  // una clave de acceso" passkey button, which contains the same prefix).
  await expect(page.getByRole("button", { name: "Iniciar sesión", exact: true })).toBeVisible();
});
