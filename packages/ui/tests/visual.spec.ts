import { expect, type Page, test } from "@playwright/test";

// Visual regression over the Storybook gallery. Story ids are discovered from
// Storybook's /index.json at runtime, so a newly-added story is snapshotted
// automatically — there's no hand-maintained id list to drift out of sync. Each
// story is captured in both themes (the shared `dark` class variant), and the
// interactive Dialog stories are opened before capture (see below).
type StoryEntry = { id: string; title: string; name: string; type: string };

const THEMES = ["light", "dark"] as const;

// Stories handled specially or with nothing to capture at rest:
// - the Dialog stories render only a trigger button until clicked → covered by the
//   dedicated "dialog (open)" tests below, which open the portal.
// - a bare Toaster renders nothing until a toast fires → no meaningful frame.
const SKIP_IDS = new Set<string>([
  "components-dialog--default",
  "components-dialog--tall-content",
  "components-toaster--default",
  // ThemeToggle's rendered icon depends on next-themes runtime state, and its
  // `transition-all` on the theme class races the addon-themes decorator applying
  // `dark` on iframe load → a nondeterministic frame. Its parts (outline icon-button,
  // dropdown) are already covered by the button + dropdown-menu stories.
  "components-themetoggle--default",
]);

// `withThemeByClassName` (preview.ts) reads the `theme` global; Storybook takes it on
// the iframe URL as `globals=theme:<value>`.
function iframeUrl(id: string, theme: string): string {
  return `iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;
}

async function settle(page: Page): Promise<void> {
  await page.locator("#storybook-root").waitFor({ state: "visible" });
  // Fonts loaded + two animation frames flushed → any post-mount state (Radix
  // load-gates, the theme decorator's class) is committed before we capture, so the
  // screenshot lands on the settled frame rather than an intermediate one.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void document.fonts.ready.then(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }),
  );
}

test("component gallery matches baselines", async ({ page, baseURL }) => {
  // One test captures the whole gallery (dozens of stories × both themes), so it needs
  // more than the default 30s per-test budget — each screenshot does a two-frame
  // stability check plus the baseline compare.
  test.setTimeout(180_000);
  const res = await page.request.get(`${baseURL}/index.json`);
  const index = (await res.json()) as { entries: Record<string, StoryEntry> };
  const stories = Object.values(index.entries)
    .filter((entry) => entry.type === "story" && !SKIP_IDS.has(entry.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Guard against the index silently coming back empty (e.g. a server that booted but
  // hasn't indexed) — an empty loop would pass vacuously and hide a broken harness.
  expect(stories.length).toBeGreaterThan(5);

  for (const story of stories) {
    for (const theme of THEMES) {
      await page.goto(iframeUrl(story.id, theme));
      await settle(page);
      // Screenshot the story ROOT, not the whole page: with `layout: "centered"` a
      // small component is a sliver of a 1280×720 frame, so a full-page shot would
      // dilute a real change (e.g. a corner-radius tweak) below the pixel-ratio
      // threshold. The tight element bound keeps diffs meaningful.
      // Soft so every story's diff is reported in one run, not just the first failure.
      await expect
        .soft(page.locator("#storybook-root"))
        .toHaveScreenshot(`${story.id}-${theme}.png`);
    }
  }
});

// The Dialog primitive's real regression surface is the OPEN dialog (Radix mounts it
// in a portal only after the trigger is clicked), so these open it first.
for (const theme of THEMES) {
  test(`dialog default (open) — ${theme}`, async ({ page }) => {
    await page.goto(iframeUrl("components-dialog--default", theme));
    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`dialog-default-open-${theme}.png`);
  });

  test(`dialog tall-content (open) — ${theme}`, async ({ page }) => {
    // A short viewport forces the tall dialog to overflow — the B3 fix
    // (`max-h-[calc(100dvh-2rem)] overflow-y-auto`) must keep the title + close button
    // on screen and scroll the overflow INSIDE the dialog. This baseline locks that.
    await page.setViewportSize({ width: 640, height: 620 });
    await page.goto(iframeUrl("components-dialog--tall-content", theme));
    await page.getByRole("button", { name: "Open tall dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`dialog-tall-content-open-${theme}.png`);
  });
}
