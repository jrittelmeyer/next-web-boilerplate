# Uploadthing (File Uploads)

> When to load: working on file uploads, avatars, the `/uploads` surface, upload cleanup, or `next/image` remote optimization. Shared client/degradation conventions: [../SERVICES.md](../SERVICES.md).

- SDKs: `uploadthing` (server SDK + route handler) + `@uploadthing/react`
  (client helpers: `generateUploadButton`/`generateUploadDropzone`). Both are
  normal npm deps in `apps/web` (compiled — **not** in `transpilePackages`,
  unlike raw-`.tsx` `@repo/ui`/`@repo/email`).
- File router: `apps/web/src/lib/uploadthing.ts` (`import "server-only"`) —
  defines allowed file types/sizes and gates uploads behind a Better Auth session.
- Route handler: `apps/web/src/app/api/uploadthing/route.ts` —
  `createRouteHandler({ router })`, exports `{ GET, POST }`.
- Client helpers: `apps/web/src/lib/uploadthing-client.ts` — exports typed
  `UploadButton`/`UploadDropzone` via a **type-only** import of `OurFileRouter`,
  so the server-only router (and its auth/db imports) never reach the client bundle.

**File router (`lib/uploadthing.ts`):** two routes. `imageUploader`
(images, 4 MB, max 1 file): its `.middleware()` resolves the session with
`auth.api.getSession({ headers: req.headers })` and throws `UploadThingError`
when unauthenticated, then applies the same per-user `rateLimit` the write Server
Actions use (10/min — the thrown message surfaces in `onUploadError`); the
returned `{ userId }` is passed to `.onUploadComplete()`.
**`onUploadComplete` persists the file** — it upserts `file.ufsUrl`
(plus `name`/`size`/`type`) against `metadata.userId` into the `uploads` table via
`@repo/db`, keyed by Uploadthing's storage `key` so a redelivered callback is
idempotent (the upload analog of the Stripe webhook). Errors propagate so a
non-2xx makes Uploadthing retry. See [../DATABASE.md](../DATABASE.md) (`uploads`).

**`avatarUploader`** (the worked "real feature" wiring of this
integration): same auth+`rateLimit` gate but tighter (2 MB) and persisted to the
caller's own **`user.image`**, *not* the `uploads` table (an avatar is profile state
you replace, not a file you manage in the `/uploads` list). Its `onUploadComplete`
reads the previous `user.image`, points it at `file.ufsUrl`, then **best-effort
deletes the replaced file** (`avatarKeyFromUrl()` in `lib/avatar.ts` recovers the
storage `key` from the stored URL → `UTApi().deleteFiles`) so changing an avatar
never orphans storage. The companion **`removeUserAvatar` Server Action**
(`server/actions/avatar.ts`) nulls `user.image` + best-effort deletes the file, but
**fail-OPEN** (nulling the column is the user-visible effect and must always land) —
the deliberate inverse of `deleteUpload`'s fail-closed stance. Surfaced by
`components/account/avatar-card.tsx` on `/account` and rendered via the `@repo/ui`
`Avatar` primitive there **and** in the dashboard-header user menu (both fall back to
the user's initial). Like `imageUploader`, the write leg's `onUploadComplete` is
**dev-only on localhost** (VERIFICATION.md ⚠️) unless the callback is tunneled —
see the `UPLOADTHING_CALLBACK_URL` runbook below; the render + `removeUserAvatar`
paths work on any build.

**Styling:** the prebuilt stylesheet is imported by every surface that mounts an
`UploadButton` (`import "@uploadthing/react/styles.css"` — the `/uploads` demo page and
the `avatar-card` client component), **not** via the `withUt` Tailwind plugin — `withUt`
targets a v3-style `tailwind.config.js`, and this repo is on Tailwind v4 (CSS-config).
The prebuilt CSS styles the `.ut-*` classes self-containedly without touching the v4
`@source` setup. (Skip the import and the button renders as bare unstyled text.)

**Demo:** a public scaffold route at `/uploads` (like `/billing`, `/state`)
renders an `<UploadButton endpoint="imageUploader">`. The upload is
auth-gated and needs `UPLOADTHING_TOKEN` to store files; without it the route
still mounts and uploads fail gracefully. Delete when a real upload surface lands.

**Read path + delete:** signed-in visitors to
`/uploads` also get a **"Your uploads"** card — a direct `uploads`-table read in
the page (the sessions-card pattern; thumbnails for `image/*`, newest first)
with per-row **Delete** via the `deleteUpload` Server Action
(`server/actions/uploads.ts`): session gate → per-user `rateLimit` (10/min) →
row-level ownership check → remote-first delete. **Fail-closed when configured**:
`UTApi.deleteFiles(key)` must succeed before the row is deleted, so a storage
failure surfaces as the typed error and nothing is orphaned at a still-served
`ufs.sh` URL; with the token unset the remote call is skipped and the row alone is
deleted (such rows are leftovers from a previously-configured run). The row is
removed optimistically client-side (`components/uploads/uploads-list.tsx`;
`router.refresh()` is background reconcile only). The `UTApi` client lives behind
`getUTApi()`/`isUploadthingConfigured()` in `lib/uploadthing-api.ts` (the
`getStripe()`/`getResend()` lazy pattern — `new UTApi()` resolves the token per
request, not at construction, verified in 7.7.4).

**Optimized remote images:** the `/uploads` thumbnail (`uploads-list.tsx`) is
the worked **`next/image`** example — remote uploads render through the optimizer
(responsive `srcset` + modern formats) instead of a plain `<img>`. It works because
`next.config.ts` allows the Uploadthing served host in `images.remotePatterns`
(`{ protocol: "https", hostname: "*.ufs.sh", pathname: "/f/*" }` — files are served at
`https://<appId>.ufs.sh/f/<key>`). The browser only loads the same-origin
`/_next/image?url=…` proxy (`img-src 'self'`); Next fetches `ufs.sh` **server-side**, so
this needs **no CSP change** (see [../SECURITY.md](../SECURITY.md)). The thumbnail is a fixed
40 px square, so it uses explicit `width`/`height` (a variable-size gallery would use
`fill` + a sized container instead). Avatars stay on the `@repo/ui` `Avatar` primitive's
plain `<img>` — that framework-agnostic package must not depend on `next/image`, and
Radix's `AvatarImage` gives the load-error→initials fallback `next/image` doesn't.
The optimizer itself is pinned keylessly by `e2e/image-optimization.spec.ts`: a
committed `/public` fixture (a local asset needs no `remotePatterns` entry)
must come back from `/_next/image` genuinely transformed — PNG→webp, an IHDR-verified
resize, and a 400 for any non-allowlisted remote `url=` — so a green e2e lane proves the
sharp engine (version currently forced by a pnpm override, see
[MAINTENANCE.md → Watch items](../../MAINTENANCE.md#watch-items-known-tracked-deliberately-not-done))
still transforms, not merely installs.

**Key env var** (**optional** — the app builds/runs without it):
- `UPLOADTHING_TOKEN` — read automatically by `createRouteHandler` at request
  time (not at module load), so an unset token never breaks the build. Get it
  from the Uploadthing dashboard (app → API Keys).

**Local testing:** `GET /api/uploadthing` returns the route config without a
token (verifies the handler mounts); a real upload needs a token + a signed-in
session + a file, so it's exercised only when `UPLOADTHING_TOKEN` is set. The
keyless surface (page renders, button mounts + settles, signed-in empty list) is
pinned by `e2e/uploads.spec.ts` — CI runs it tokenless on every push.

**Prod-build callback on a local box — the tunnel runbook.**
On a prod build (`next start`), `onUploadComplete` runs only when Uploadthing's
cloud can POST **into** your route handler — on localhost it can't, so the
`uploads` row is never written (the VERIFICATION.md ⚠️ box; the exact analog of
"Stripe webhooks need `stripe listen`"). The override is **`UPLOADTHING_CALLBACK_URL`**
— verified in the installed `uploadthing@7.7.4` source: `createRouteHandler`'s
`config.callbackUrl` ("the full, absolute URL to where your route handler is
hosted... override if the automatic detection fails") resolves through an Effect
`ConfigProvider` that falls back to `UPLOADTHING_`-prefixed constant-case env vars,
so the env var needs **zero code change** (explicit `config:` would take
precedence). Worked recipe:

1. Start a quick tunnel to the app: `cloudflared tunnel --url http://localhost:3000`
   (no account needed; note the `https://<name>.trycloudflare.com` URL it prints) —
   ngrok works identically.
2. Start the prod server with the override (runtime var → restart, not rebuild):
   `UPLOADTHING_CALLBACK_URL="https://<name>.trycloudflare.com/api/uploadthing"`
   alongside the live `UPLOADTHING_TOKEN`.
3. Sign in → `/uploads` → upload. UT's cloud now POSTs the completion callback
   through the tunnel (`x-uploadthing-hook: callback`) → `onUploadComplete` runs →
   the `uploads` row lands (the "Your uploads" card shows it after the refresh).

**Status:** verified — see [VERIFICATION.md](../../VERIFICATION.md) → Uploadthing.

**Account deletion cleans up files:** deleting a
user cascades the `uploads` **rows** away; the remote **files** are handled by the
`delete-uploads` background job (`@repo/jobs` — see [jobs.md](jobs.md); same reason
the welcome email is a job: never block an auth flow on an external service). Better
Auth's `user.deleteUser.beforeDelete` captures the account's storage keys while
the rows still exist; `afterDelete` enqueues only once the account is actually
gone; the worker calls `UTApi.deleteFiles(keys)` (idempotent — safe under
pg-boss's at-least-once retries). **Graceful when unconfigured:** with no
`UPLOADTHING_TOKEN` the handler completes with a "skipped — N file(s) left in
storage" log instead of retrying forever (nothing a retry could fix; in practice
files only exist if a previously-configured run wrote them). See AUTH.md → Danger
zone.

**Remove it** (self-contained — but note avatars ride on it):
1. Delete (under `apps/web/src/`) `lib/uploadthing.ts`, `lib/uploadthing-client.ts`,
   `lib/uploadthing-api.ts`, `app/api/uploadthing/route.ts`, `server/actions/uploads.ts`, the
   `app/[locale]/uploads/` route, and `components/uploads/` — plus `*.test.ts` siblings.
2. Drop the DB table: delete `packages/db/src/schema/uploads.ts`, remove its line from
   `schema/index.ts`, then `db:generate` a drop migration.
3. `pnpm --filter web remove uploadthing @uploadthing/react`.
4. Remove `UPLOADTHING_TOKEN` from `.env.example` + `env.ts`.
5. Trim `next.config.ts`: drop `https://*.uploadthing.com https://*.ingest.uploadthing.com` from
   the CSP `connect-src`, **and** the `images.remotePatterns` `*.ufs.sh` entry.
6. Unhook the cleanup job: remove the `delete-uploads` handler + queue entry in `@repo/jobs` and
   the `afterDelete` enqueue in `packages/auth/src/auth.ts`.
7. **Avatars ride on this integration** (`avatarUploader`): also remove `server/actions/avatar.ts`,
   `lib/avatar.ts`, `components/account/avatar-card.tsx` — or repoint avatars at another uploader.
   The `@repo/ui` `Avatar` primitive (initials fallback) stays regardless.
