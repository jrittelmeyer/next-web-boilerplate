# UI

> When to load: building components, styling with Tailwind, using shadcn/ui, layout work.

## Stack

- **Components:** shadcn/ui (copy-paste, Radix UI primitives)
- **Styling:** Tailwind CSS v4
- **Icons:** Lucide React (shadcn default) — installed in `@repo/ui`
- **Dark mode:** `next-themes` provider + a theme toggle in `@repo/ui`
- **Package:** `@repo/ui` (`packages/ui/`) for shared components

## Tailwind v4 Key Differences

v4 has no `tailwind.config.js`. Configuration lives in CSS. The design system is
split: the shared **tokens** live in `tooling/tailwind/base.css` (the shadcn "slate"
theme — `@custom-variant dark`, `@theme`/`@theme inline`, `:root`/`.dark` variables,
base layer, and the `tw-animate-css` import), and each app composes the layers:

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";
@import "@repo/tailwind-config/base";

/* v4 only auto-scans this app's own sources — register external workspace
   packages so their component class names generate utilities. */
@source "../../../../packages/ui/src/**/*.{ts,tsx}";
```

Dark mode is **class-based**: a `class="dark"` on a parent (the `<html>` element)
flips the `.dark` token block. Edit colors/radius once in `tooling/tailwind/base.css`;
every app and `@repo/ui` component follows. The class is managed at runtime by
`next-themes` (see **Dark mode** below) — you don't toggle it by hand.

## Dark mode (`next-themes`)

The `.dark` tokens ship in `tooling/tailwind/base.css`; the runtime that toggles
them is two pieces in `@repo/ui`:

- **`ThemeProvider`** (`components/theme-provider.tsx`) — a thin `"use client"` wrapper
  over `next-themes`. The **app** mounts it in the document-shell layout
  (`app/[locale]/layout.tsx` since i18n — the root layout is a bare passthrough,
  see [I18N.md](I18N.md)) and supplies the config:

  ```tsx
  // apps/web/src/app/[locale]/layout.tsx — <html> needs suppressHydrationWarning
  <html lang={locale} suppressHydrationWarning>
    <body>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {/* other providers + children */}
      </ThemeProvider>
    </body>
  </html>
  ```

- **`ThemeToggle`** (`components/theme-toggle.tsx`) — the shadcn mode-toggle pattern: a
  `DropdownMenu` (Light / Dark / System) built on the `dropdown-menu` primitive and
  Lucide `Sun`/`Moon`/`Monitor` icons. It only ever calls `setTheme(...)` and **never
  reads `theme` during render** — the Sun/Moon swap is pure CSS via the `dark:` variant —
  so the markup is identical on the server and first client paint (no hydration mismatch).
  Dropped into the `/` landing page; reuse it anywhere.

Why `next-themes` and not a Zustand store: it owns three things a plain store can't do
without bugs — a **pre-paint inline script** that sets the class before first paint (no
SSR flash / FOUC), **`localStorage` persistence**, and **system-preference** resolution
(`prefers-color-scheme`). See STATE.md for the "theme is the one client-pref exception"
note. `attribute="class"` matches the `.dark` selector; `defaultTheme="system"` +
`enableSystem` honor the OS; `disableTransitionOnChange` avoids a transition flash on
switch. **`suppressHydrationWarning` on `<html>` is required** — the server renders no
theme class and the inline script adds it, a deliberate one-element mismatch.

**CSP note:** the pre-paint script is **inline**. In the default static CSP mode it's
allowed by `script-src 'unsafe-inline'`; in a **`CSP_MODE=nonce`** build — a first-class
mode, not a migration — the `[locale]` layout already passes the per-request nonce to
`ThemeProvider` (next-themes' `nonce` prop). Both modes work with no change here; current
truth in [SECURITY.md](SECURITY.md#csp-strategy-static-vs-nonce-the-csp_mode-switch).

**Biome + Tailwind v4:** Biome's CSS parser rejects Tailwind's `@theme`/`@import "tailwindcss"` unless `css.parser.tailwindDirectives: true` is set in `biome.json` (already configured). Keep that enabled or `pnpm lint` will fail on any file using Tailwind at-rules.

## Adopting an existing brand / token sheet

Every real project eventually replaces the shadcn "slate" defaults with its own design
system, and every `/project-adopt` port starts from one — the survey emits an extracted
**token sheet** (palette · type · space · radius · breakpoints). The entire mapping lands
in **one file**, `tooling/tailwind/base.css`, because apps and `@repo/ui` components only
ever consume tokens (`bg-primary`, `border-input`, …), never raw values. If a rebrand has
you editing `packages/ui/src/components/*`, a value bypassed the tokens — fix the token.

A sheet in the shape the `/project-adopt` survey produces (values illustrative, shaped
like the linkding adoption's):

| Sheet entry | Extracted value |
| --- | --- |
| Brand accent | indigo `#4f46e5`, white text on it |
| Canvas / text | white / near-black |
| Subdued fill | one cool light gray |
| Danger | red `#dc2626` |
| Lines | light gray borders |
| Type | Inter (UI) · system mono (code) |
| Radius | 6px controls |
| Breakpoints | framework defaults |

Map it in five moves:

1. **Palette → semantic slots (`:root`).** Assign *roles*, don't transcribe the palette:
   the brand accent becomes `--primary` (+ `--primary-foreground` for text on it, and
   usually `--ring` so focus rings are on-brand); canvas/text → `--background` /
   `--foreground`; raised surfaces → `--card` / `--popover`; the subdued fill →
   `--secondary` / `--muted` / `--accent` (slate keeps those three nearly identical —
   keep that unless the sheet genuinely distinguishes them); danger → `--destructive`;
   lines → `--border` / `--input`. Convert values to **oklch** to match the file — hex
   is valid CSS, but oklch keeps the file uniform and makes derived shades (hover, dark
   variants) perceptually predictable:

   ```css
   /* :root — from the sheet above */
   --primary: oklch(0.511 0.262 276.97); /* brand indigo ≈ #4f46e5 */
   --primary-foreground: oklch(0.985 0 0);
   --ring: oklch(0.511 0.262 276.97);
   ```

2. **Author `.dark`, don't invert.** Dark `--background` is the brand hue at low
   lightness (not pure black); `--primary` usually needs a **lighter** variant of the
   brand color to hold contrast on dark surfaces; keep slate's translucent-white
   `--border`/`--input` (`oklch(1 0 0 / 10%)`) unless the sheet ships real dark-mode
   line colors. Adopted apps are often light-only — then `.dark` is an *authored
   extension*: derive it from the brand hue and record it as an assumption in the
   migration map.

3. **Type.** Point `--font-sans`/`--font-mono` at the sheet's stacks in `@theme`. A real
   webfont goes through the [`next/font` recipe below](#fonts-nextfont--opt-in-brand-font)
   (`--font-brand` variable + `@theme inline`) — self-hosted, no CSP change.

4. **Radius · space · breakpoints.** Set `--radius` once (`0.375rem` for this sheet's
   6px) — the sm/md/lg/xl scale derives from it. Tailwind v4 derives the whole spacing
   scale from a single `--spacing` (default `0.25rem`) — override it only if the sheet's
   grid genuinely differs, and snap any ad-hoc pixel values to the scale rather than
   minting one-off utilities. Breakpoints only when the design specifies them
   (`@theme { --breakpoint-2xl: 90rem; }`); the defaults usually survive an adoption.

5. **The satellite sets.** `--chart-1…5` are categorical — replace them with the brand's
   data palette if it has one, keeping all five distinguishable in *both* themes. The
   `--sidebar-*` family mirrors the main tokens by default; leave it tracking unless the
   brand has a genuinely distinct nav surface.

**Verify:** `pnpm storybook`, flip the theme toolbar — every primitive re-skins with zero
component edits (that's the proof the mapping went through tokens); spot-check `--ring`
focus visibility and `--destructive` contrast in both themes. If the visual lane is on,
an intended token change rebases **both** platform baseline sets
([Visual regression](#visual-regression-repoui-opt-in)).

## Fonts (`next/font` — opt-in brand font)

The default is the **system font stack** — zero network cost, no layout shift, native on
every OS. It's a design **token** consumed by a utility class, not hard-coded, so swapping
it is a two-file change:

- `tooling/tailwind/base.css` `@theme` → `--font-sans: ui-sans-serif, system-ui, sans-serif`
  (and `--font-mono`).
- `apps/web/src/app/[locale]/layout.tsx` → `<body className="font-sans antialiased">` (the
  `font-sans` utility resolves to `var(--font-sans)`).

Most real projects add a brand font. Use **`next/font`** — it downloads the font at build
time and serves it from your **own origin** (`/_next/static/media/…`), so there are **no
external requests**: the existing `font-src 'self' data:` CSP already covers it and **no CSP
or `images.remotePatterns` change is needed** (unlike a `<link>` to Google Fonts, which would
need a `fonts.googleapis.com`/`fonts.gstatic.com` allowlist).

```tsx
// apps/web/src/app/[locale]/layout.tsx (the document shell — owns <html>)
import { Inter } from "next/font/google"; // or: import localFont from "next/font/local"

// Self-hosted; expose a CSS variable (not a class) so the Tailwind token owns the wiring.
const brand = Inter({
  subsets: ["latin"],
  display: "swap",          // text is visible during load (FOUT, not FOIT)
  variable: "--font-brand", // NOT --font-sans directly — see the token wiring below
});

// Put the variable on <html> so it's in scope for the whole tree:
// <html lang={locale} className={brand.variable} suppressHydrationWarning>
```

Then point the existing token at it — every `font-sans` consumer (i.e. the whole app) picks
it up with no other change:

```css
/* tooling/tailwind/base.css — this references a RUNTIME next/font var, so it belongs in
   @theme inline (same reason the color tokens do: inline emits the var() reference instead
   of resolving it at build time). Keep the fallbacks INSIDE var() — a bare var(--font-brand)
   with the font somehow unset invalidates the whole declaration rather than falling through. */
@theme inline {
  --font-sans: var(--font-brand, ui-sans-serif, system-ui, sans-serif);
}
```

- **Licensed / self-hosted files** → `next/font/local` with
  `src: [{ path: "./BrandFont.woff2", weight: "400" }, …]` instead of `next/font/google`;
  identical `variable` wiring.
- **A brand code font** → repeat with a second `variable: "--font-brand-mono"` and
  `--font-mono` in `@theme inline`.
- Keep the system stack in the fallback list — it's what renders during `swap` and if the
  font ever fails to load.

## Adding shadcn Components

shadcn runs in **monorepo mode** (a `components.json` in both `apps/web` and
`packages/ui`). Shared primitives go into `@repo/ui`, not the app:

```bash
# From the repo root — --cwd points at the app whose components.json drives detection
pnpm dlx shadcn@latest add button input label card --cwd apps/web --yes
```

Files land in `packages/ui/src/components/` and import as `@repo/ui/components/<name>`.
Two follow-ups every time (the CLI does neither correctly here):

- **Move new deps:** the CLI installs component npm deps (e.g. `radix-ui`) into the
  `--cwd` project; move them to `packages/ui/package.json` where the components import
  them, then `pnpm install`.
- **Reformat:** the CLI emits semicolon-free output; run `biome check --write packages/ui`
  to match repo style.

Components use the unified `radix-ui` package and the `cn()` helper from
`@repo/ui/lib/utils`. Tokens they reference (`bg-primary`, `border-input`, …) come from
`tooling/tailwind/base.css`.

**Shipped primitive — `Avatar`** (`components/avatar.tsx`, `Avatar`/`AvatarImage`/`AvatarFallback`,
Radix `Avatar`): `AvatarImage` swaps to `AvatarFallback` automatically when the `src` is
empty or fails to load, so an absent/broken image degrades to initials rather than a broken
`<img>`. Used by the account **avatar upload** (`components/account/avatar-card.tsx`) and the
dashboard-header user menu (`components/dashboard/user-menu.tsx`) — both fall back to the
user's initial. Added with **no new dependency** (the `radix-ui` meta-package already ships it).

**Shipped primitives — `Dialog` + `Select`** (`components/dialog.tsx`, `components/select.tsx`,
Radix `Dialog`/`Select`): added for the Organizations UI (create-org modal + role pickers).
Both came in with **no new npm dependency** — they import the same `radix-ui` meta-package;
per the monorepo quirk above, the CLI's `radix-ui` install into `apps/web` was reverted.
`apps/web` did gain a direct `lucide-react` dep (exact-pinned to `@repo/ui`'s version) since
the org switcher/manager import icons directly — icons in app code, not only in `@repo/ui`.
Used by `components/organization/*` (see [auth/organizations.md](auth/organizations.md)).

`DialogContent` is **viewport-safe for tall content**: it caps its height at
`max-h-[calc(100dvh-2rem)]` and scrolls the overflow *inside* the dialog (`overflow-y-auto`), so a
dialog taller than the screen keeps its title + close button on screen instead of centering at 50%
with the top half off the viewport edge. (An earlier "animation overrides the transform" diagnosis
was disproven — record: [docs/archive/PHASE_HISTORY.md](../archive/PHASE_HISTORY.md).) Verified by
the `TallContent` story in `dialog.stories.tsx` (`pnpm --filter @repo/ui storybook`).

**Shipped primitive — `Toaster` (sonner)** (`components/sonner.tsx`): app-wide transient
notifications. A thin themed wrapper over `sonner`'s `Toaster` — it reads the active
theme from `next-themes` so toasts follow light/dark, and maps sonner's color slots to our
`--popover*` / `--border` tokens. Mounted **once** in `apps/web/src/app/[locale]/layout.tsx`
inside `ThemeProvider` (a portal leaf — it renders no children, so it doesn't widen the RSC boundary).
The `toast` function is **re-exported from the same module**, so app code imports both from one
place:

```ts
import { toast } from "@repo/ui/components/sonner";
toast.success("Photo removed.");
```

This keeps `sonner` a dependency of `@repo/ui` alone — no hand-synced second pin in `apps/web`
(unlike `lucide-react`, which the app imports directly; `toast` is a companion to this primitive,
not a standalone library). This was the **one new npm dependency** (version-checked; zero
transitive deps, React 18/19 peer); the CLI's `sonner` install into `apps/web` was moved to
`packages/ui` per the follow-ups above.

**When to toast vs. render inline** — the convention the `/account` + `/admin` surfaces follow:
use a **toast** for a *transient* outcome the user reads once (name saved, photo removed, role
changed, session revoked, a rejected password). Keep copy **inline** for (a) *standing, multi-step
instructions* the user must act on — the two-hop email-change and account-deletion "we sent a
link…" messages stay inline for exactly this reason — and (b) *field-level validation* (React Hook
Form's `FormMessage`). Toasts render in the layout portal, **outside** the form, so a test that
anchored a form-scoped `role="alert"` must move to sonner's toast (`[data-sonner-toast]`,
`data-type="error"`) — see `e2e/account.spec.ts`.

**Shipped primitive — `Skeleton`** (`components/skeleton.tsx`): the loading-placeholder
primitive. A plain pulsing box (`animate-pulse rounded-md bg-accent`) you size/shape with
utility classes — added with **no new dependency** (`cn` + React only). It's the canonical shadcn
Skeleton, hand-written to match the repo's `card.tsx` style (the shadcn CLI's value is dep
resolution + registry fidelity; a 6-line, zero-dep primitive needs neither, and skipping the CLI
avoids its monorepo dep-move/reformat follow-ups).

**Route-level vs component-level loading** — two complementary patterns:

- **Route-level** — `app/loading.tsx` (a spinner) is streamed in by the App Router during
  navigation / the initial render, covering the *whole route*.
- **Component-level** — a `<Suspense fallback={…}>` (or a client query's `isPending` branch) around
  *one region*, with a skeleton that **mirrors the shape of the content it stands in for** so the
  layout doesn't shift when data arrives. The worked example is the `/posts` feed: a shared
  `PostListSkeleton` (`components/posts/post-list-skeleton.tsx`) — placeholder rows shaped like a
  `PostItem` — is reused at **both** of the feed's loading boundaries (the server `<Suspense>`
  fallback in `app/[locale]/posts/page.tsx` while the RSC prefetch streams, **and** the client `post.list`
  `isPending` branch in `post-list.tsx`). The same page also uses a bare `<Skeleton>` for the
  single-line post-count and the composer-card placeholder. Group skeletons carry `role="status"`
  on the wrapper (like `loading.tsx`); the individual bones are decorative.

**Shipped primitive — `Table`** (`components/table.tsx`): the canonical shadcn data-table
family (`Table`/`TableHeader`/`TableBody`/`TableFooter`/`TableRow`/`TableHead`/`TableCell`/
`TableCaption`) — thin styled wrappers over the native `<table>` elements, added with **no new
dependency** (`cn` + React only, hand-written to match `card.tsx`/`skeleton.tsx` like the other
zero-dep primitives). `Table` wraps itself in an `overflow-x-auto` container so a wide table
scrolls inside its own box; size/align columns with utility classes on `TableHead`/`TableCell`
(`w-24`, `text-right`). Prefer it over a `<ul>` of flex rows for genuinely tabular data — a real
`<table>` with `<th>` column headers reads correctly to assistive tech. The **worked consumer** is
`/admin/audit` (`app/[locale]/(dashboard)/admin/audit/page.tsx`): Event · Actor → Target · Time
columns over the keyset-paginated `audit_log` read. (`/admin` deliberately stays a `<ul>` — its
rows carry per-row Role/Ban/Impersonate control clusters, not clean tabular cells.)

## Component gallery (Storybook)

`@repo/ui` ships a **Storybook** gallery — a live, isolated catalog of the
shared primitives. It's a **dev tool**, not part of the app:

```bash
pnpm storybook                          # dev server → http://localhost:6006
pnpm --filter @repo/ui build-storybook  # static export → packages/ui/storybook-static (gitignored)
```

The gallery is also **browsable without cloning** — the static export is published to
**GitHub Pages** ([live gallery](https://jrittelmeyer.github.io/next-web-boilerplate/))
on every push that touches `packages/ui/`, via `.github/workflows/pages.yml`. See
[DEPLOYMENT.md → Storybook on GitHub Pages](DEPLOYMENT.md#storybook-on-github-pages-component-gallery).

- **Framework: `@storybook/react-vite`** (not `@storybook/nextjs`). `@repo/ui` is a
  standalone React library with **zero `next/*` imports** (it uses `next-themes`, a
  plain React context, and nothing else from Next) — so the lighter Vite framework is
  the right fit and avoids dragging the Next compiler/webpack into a package that
  doesn't depend on Next. Reach for `@storybook/nextjs(-vite)` only if a story needs
  `next/image`/`next/link`/`next/font` — those live in `apps/web`, not here.
- **Config:** `packages/ui/.storybook/{main,preview}.ts`. Stories live next to their
  components as `src/components/*.stories.tsx` (CSF3 + `autodocs`).
- **Tailwind v4 tokens:** `.storybook/main.ts` adds the official `@tailwindcss/vite`
  plugin via `viteFinal`, and `.storybook/preview.ts` imports `.storybook/tailwind.css`
  — which mirrors how `apps/web` composes the layers (`@import "tailwindcss"; @import
  "@repo/tailwind-config/base"; @source "../src/**/*.{ts,tsx}";`). Same slate tokens,
  radius, and `.dark` block the app ships — one source of truth in
  `tooling/tailwind/base.css`.
- **Dark mode:** the `@storybook/addon-themes` toolbar switch (`withThemeByClassName`)
  toggles a `dark` class on the preview `<html>` — the same class-based mechanism
  `next-themes` drives at runtime — so every story flips tokens. The `ThemeToggle` story
  mounts the real `ThemeProvider` so its menu works for real.
- **Zero app-bundle / CI cost.** Storybook is never imported by `apps/web`, isn't in
  `turbo.json`, and CI doesn't run it by default → no prod weight (the opt-in `visual`
  regression job below is the one exception — gated on `ENABLE_VISUAL`, which this repo
  sets). One
  guard makes this airtight: `apps/web/globals.css`
  scans `packages/ui/src`, so it adds `@source not "…/packages/ui/src/**/*.stories.tsx"`
  to keep story-only utility classes **out of the production stylesheet**. When you add a
  new primitive, drop a `*.stories.tsx` beside it.

## Visual regression (`@repo/ui`, opt-in)

Screenshot regression over the Storybook gallery: it catches a *rendered* change a unit
test can't (a shifted border-radius, a broken dark-mode token, a layout regression). It's
a **Playwright** harness in `@repo/ui` (reusing the `@playwright/test` already installed
for `apps/web` e2e — no new browser download), **opt-in** and not part of `pnpm test` / the
default CI gate.

```bash
pnpm --filter @repo/ui test:visual         # assert every story against its baseline
pnpm --filter @repo/ui test:visual:update  # rebase baselines (after an intended change)
```

**How it works** (`packages/ui/playwright.config.ts` + `tests/visual.spec.ts`):
- The config's `webServer` boots Storybook (`storybook dev --ci`); locally an
  already-running `:6006` is reused, in CI it starts one.
- The spec **discovers story ids from Storybook's `/index.json`** at runtime — a new
  story is snapshotted automatically, no id list to maintain — and captures the
  `#storybook-root` element (not the full page: `layout: "centered"` makes a small
  component a sliver of a 1280×720 frame, which would dilute a real change below the
  threshold) in **both themes** (`?globals=theme:light|dark`). The interactive **Dialog**
  is opened before capture (`Default` + `TallContent` at a short 640×620 viewport — the
  tall-content regression surface).
- **Determinism** is the whole game: Chromium launch flags
  (`--font-render-hinting=none --disable-lcd-text --disable-gpu --force-color-profile=srgb
  --hide-scrollbars`) plus frozen animations bring cross-run antialiasing noise to ~0 px,
  so the tight `maxDiffPixelRatio: 0.01` catches a real change (a button corner-radius
  tweak measures ~2%) without flaking. Stories whose render depends on runtime state are
  skipped in `SKIP_IDS` (e.g. `ThemeToggle` — its `next-themes` provider and the
  addon-themes decorator both drive the theme class, so the captured frame isn't
  deterministic; its parts are covered by the button + dropdown-menu stories).

**Baselines are PLATFORM-SPECIFIC.** Playwright names them
`tests/visual.spec.ts-snapshots/<story>-<theme>-chromium-<platform>.png` because font
rendering differs per-OS. **Both sets are committed** (2026-07-12): the maintainer's
dev platform (`…-win32.png`) and CI's (`…-linux.png`, generated in the pinned Playwright
Docker image — **the same image the CI `visual` job runs inside** (`container:` in
`ci.yml`), so baselines and CI share a bit-identical rendering environment; keep the two
tags in lockstep with the installed `@playwright/test`. Don't expect the bare ubuntu
runner to match the image: its font set differs, glyph widths shift a few px, and every
text-bearing story fails — the lane's first live run proved it). To regenerate the Linux
set, **copy the repo into the container — do NOT `pnpm install` over the mounted repo**:
pnpm sees the host's win32-flavored `node_modules`, wants to purge it, and aborts without
a TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`); forcing it with `CI=true` would
delete the host's `node_modules` through the mount. The working recipe generates, then
re-runs in **assert** mode (the determinism gate — the update pass alone proves nothing),
and copies back only the verified PNGs, leaving the host tree untouched:

```bash
# tag = the installed @playwright/test version + the runner's Ubuntu release. On Windows,
# run from PowerShell (Git Bash's MSYS path conversion mangles the container paths).
docker run --rm -v "${PWD}:/src" mcr.microsoft.com/playwright:v1.61.0-noble bash -lc '
  export CI=true && mkdir /w && cd /src &&
  tar -c --exclude=node_modules --exclude=.git --exclude=.turbo --exclude=.next \
      --exclude=dist --exclude=backups --exclude=playwright-report --exclude=test-results . \
    | tar -x -C /w &&
  cd /w && corepack enable && pnpm install --frozen-lockfile &&
  (pnpm --filter @repo/ui test:visual:update || true) &&
  pnpm --filter @repo/ui test:visual &&
  cp packages/ui/tests/visual.spec.ts-snapshots/*-linux.png \
     /src/packages/ui/tests/visual.spec.ts-snapshots/'
```

**CI is variable-gated and ON in this repo** — the `visual` job in
`.github/workflows/ci.yml` runs only when the `ENABLE_VISUAL` repo variable is `true` (the
`ENABLE_CODEQL` / `ENABLE_GHCR_PUBLISH` pattern). This repo set it on 2026-07-12, so
the job runs on every PR/push and stays green because the Linux baselines above are
committed. A fresh fork starts with the variable unset (lane off) so its pipeline is green
before it commits baselines for its own runner; flip it with `gh variable set ENABLE_VISUAL
--body true` once they exist. **An intended visual change must now rebase BOTH sets** —
win32 locally (`test:visual:update`) and linux via the Docker recipe — or the lane goes red.

## Component Patterns

**Server Component (default):**
```typescript
// No "use client" directive — renders on server
export function UserCard({ name, email }: { name: string; email: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="font-semibold">{name}</p>
      <p className="text-sm text-muted-foreground">{email}</p>
    </div>
  );
}
```

**Client Component (when needed):**
```typescript
"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/button";

export function Counter() {
  const [count, setCount] = useState(0);
  return <Button onClick={() => setCount(c => c + 1)}>{count}</Button>;
}
```

## Form Pattern (shadcn + React Hook Form + Zod)

The client validates with the **shared** schema (`@repo/validators`); the mutation
runs through a **Server Action** (writes live in actions, not tRPC — see API.md). The
action takes `FormData` and returns `{ error } | { data }`, so `onSubmit` builds a
`FormData` and branches on the typed result. Working example:
`apps/web/src/components/account/update-name-form.tsx`, hosted at `/account` (see
[auth/account-page.md](auth/account-page.md)).

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { updateNameSchema, type UpdateNameInput } from "@repo/validators";
import { updateUserName } from "@/server/actions/user";

export function UpdateNameForm({ defaultName }: { defaultName?: string }) {
  const form = useForm<UpdateNameInput>({
    resolver: zodResolver(updateNameSchema),
    defaultValues: { name: defaultName ?? "" },
  });

  async function onSubmit(values: UpdateNameInput) {
    const formData = new FormData();
    formData.set("name", values.name);
    const result = await updateUserName(formData);
    if ("error" in result) {
      form.setError("name", { message: result.error });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
      </form>
    </Form>
  );
}
```

> `react-hook-form` is a dep of **both** `@repo/ui` (the `form` component imports
> `Controller`/`FormProvider`) and `apps/web` (the form calls `useForm`);
> `@hookform/resolvers` lives in `apps/web` only (where `zodResolver` is called).

## Layout Conventions

- Document shell in `apps/web/src/app/[locale]/layout.tsx` — `<html lang={locale}>` + the
  providers (theme, PostHog, TanStack Query, next-intl) + `Toaster`; the root
  `app/layout.tsx` is a bare passthrough owning only the `globals.css` import (see
  [I18N.md](I18N.md))
- Route groups (under `[locale]/`): `(auth)` for unauthenticated pages, `(dashboard)` for
  protected app
- Page files export a default function (Next.js requirement); everything else uses named exports
