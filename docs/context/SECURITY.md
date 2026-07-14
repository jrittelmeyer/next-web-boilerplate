# Security

> When to load: HTTP security headers, Content-Security-Policy, allowlisting a new
> SaaS origin, or any "why is the browser blocking this request" CSP question.

---

## Where the headers live

All security headers are set in **`apps/web/next.config.ts`** via `headers()`,
applied to every response (`source: "/:path*"`). They are **static** (no
per-request value), so every route stays statically renderable (see the CSP
strategy note below). The Sentry wrapper (`withSentryConfig`) wraps this config; it
doesn't touch the headers.

There **is** one edge middleware — `apps/web/src/proxy.ts` (Next 16 renamed the
`middleware` file convention to `proxy`) — but it does **not** set the security headers:
it composes the optimistic auth-cookie gate (a fast redirect for protected/auth pages,
see [AUTH.md](AUTH.md)) with next-intl's locale routing (see [I18N.md](I18N.md)). Since
i18n its `matcher` is **broad** — `'/((?!api|_next|_vercel|.*\\..*).*)'`, nearly every
HTML route — because locale negotiation must run everywhere. That does **not** make
routes dynamic: a rewrite/redirect decision doesn't opt a route out of prerendering
(the `[locale]` pages stay statically prerendered via `generateStaticParams` +
`setRequestLocale`). What forces dynamic rendering is a page *reading* per-request data
— which is exactly the nonce upgrade's cost below.

If you deploy behind your own edge/reverse proxy, you *can* set these there
instead — but config-level headers travel with the app (including the Docker
standalone server), so they work everywhere by default. Don't set them in both
places with conflicting values.

## The headers

| Header | Value | Why |
| --- | --- | --- |
| `Content-Security-Policy` | see below | Restricts where scripts/styles/connections/frames may load from — the main XSS / data-exfiltration control. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years incl. subdomains. **Production-only** (see below). |
| `X-Frame-Options` | `DENY` | Legacy clickjacking control for old browsers (modern ones use CSP `frame-ancestors`). |
| `X-Content-Type-Options` | `nosniff` | Stops MIME-type sniffing (e.g. a `.txt` being run as a script). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends the full URL same-origin, only the origin cross-origin, nothing to http. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=()` | Denies powerful APIs (and the Topics API) by default; relax per-feature when you need one. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Severs `window.opener` links to/from cross-origin windows (tabnabbing / XS-Leaks). Safe here — see the COOP/CORP/COEP section below. |

### Production-only headers (dev vs prod variance)

`headers()` is evaluated at server start, and the Next CLI sets `NODE_ENV`
(`next dev` → `development`, `next build`/`next start` → `production`). The config
branches on `const isDev = process.env.NODE_ENV !== "production"`:

- **`Strict-Transport-Security`** is emitted **only in production**. Sending HSTS
  over `http://localhost` would pin your browser to HTTPS for `localhost` across
  *every* project on the machine — a painful, sticky footgun.
- **`upgrade-insecure-requests`** is added to the CSP **only in production** for the
  same reason (it would try to upgrade local http assets).
- The CSP `script-src` gains **`'unsafe-eval'`** and `connect-src` gains **`ws:`**
  **only in development** — Turbopack + React Refresh (HMR) need eval and a
  websocket. Production stays strict (no eval).

## Content-Security-Policy

The CSP is built from a directive array in `next.config.ts`. Current directives
(production variant):

| Directive | Value | Notes |
| --- | --- | --- |
| `default-src` | `'self'` | Fallback for anything not listed. |
| `script-src` | `'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com` | `'unsafe-eval'` added in dev. `'unsafe-inline'` is required — see the strategy note. Stripe.js for a future Elements surface; `challenges.cloudflare.com` for the Turnstile CAPTCHA `api.js` (A12, opt-in). |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind/React inject inline `<style>` and `style=` attributes; inline styles are low-risk and standard. |
| `img-src` | `'self' blob: data: https:` | `blob:`/`data:` for previews & Next image placeholders. Optimized uploads (the `/uploads` thumbnail, A6) load from the same-origin `/_next/image` proxy (`'self'`) — Next fetches `ufs.sh` server-side. The `https:` allowance now only covers residual direct `<img>` (e.g. Radix avatars); tighten to specific hosts if you drop those. |
| `font-src` | `'self' data:` | System font stack (no `next/font`, no external font CDN). |
| `connect-src` | `'self' https://*.sentry.io https://*.posthog.com https://*.uploadthing.com https://*.ingest.uploadthing.com https://api.stripe.com` | `ws:` added in dev. `'self'` covers tRPC + the PostHog `/ingest` proxy. See per-origin table. |
| `frame-src` | `'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com` | Stripe Elements / 3-D Secure frames; `challenges.cloudflare.com` for the Turnstile CAPTCHA widget iframe (A12, opt-in). |
| `worker-src` | `'self' blob:` | Some SDKs spin up workers from `blob:` URLs. |
| `frame-ancestors` | `'none'` | Clickjacking control (the modern `X-Frame-Options`). |
| `base-uri` | `'self'` | Blocks `<base>`-tag base-URL hijacking. |
| `form-action` | `'self'` | Forms post same-origin only. |
| `object-src` | `'none'` | No `<object>`/`<embed>`/Flash. |
| `upgrade-insecure-requests` | (prod only) | Upgrades any http subresource to https. |

### Which SaaS needs which origin

The CSP allowlists exactly the integrations this boilerplate wires up. When you
add or remove a SaaS, update this table **and** the CSP together.

| SaaS | Origin(s) | Directive | Why |
| --- | --- | --- | --- |
| **PostHog** | reached via same-origin `/ingest` proxy → covered by `'self'`; `https://*.posthog.com` listed for non-proxied features (toolbar, surveys) | `connect-src` | The browser SDK uses `api_host: "/ingest"` (a `next.config.ts` rewrite), so analytics traffic is same-origin and ad-blocker-resistant. |
| **Sentry** | `https://*.sentry.io` | `connect-src` | The browser SDK posts events to your DSN's ingest host (`https://oNNN.ingest.<region>.sentry.io`). |
| **Stripe** | `https://js.stripe.com` (script + frame), `https://hooks.stripe.com` (frame), `https://api.stripe.com` (connect) | `script-src`/`frame-src`/`connect-src` | The **hosted-checkout redirect** is a top-level navigation and isn't restricted by CSP at all — these are pre-allowlisted for a **future** client SDK / Elements (the `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env var is reserved for that). |
| **Uploadthing** | `https://*.uploadthing.com`, `https://*.ingest.uploadthing.com` (connect); `https:` (img, for residual direct `<img>`) | `connect-src`/`img-src` | The client SDK negotiates uploads with the API host and PUTs to the ingest host; served files live on `*.ufs.sh`. Optimized thumbnails go through the same-origin `/_next/image` proxy (`img-src 'self'`; `*.ufs.sh` is allowlisted in `images.remotePatterns`, A6) — the raw `https:` allowance only covers plain `<img>` such as Radix avatars. |
| **Cloudflare Turnstile** (A12, opt-in) | `https://challenges.cloudflare.com` | `script-src`/`frame-src` | The CAPTCHA `api.js` (script) renders the challenge widget in a cross-origin iframe (frame). The widget's own network calls happen *inside* that iframe (its origin), so no `connect-src` entry is needed. Only loaded when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set; the static directive is harmless otherwise. See [AUTH.md](AUTH.md#bot-protection--captcha-cloudflare-turnstile-tier-4--band-2). |

**Realtime SSE (A22) needs no CSP change.** The `EventSource` to
`/api/notifications/stream` is **same-origin**, so `connect-src 'self'` already covers it
— nothing to allowlist. Two security properties come from the code, not the CSP: the
stream **authenticates the session** and streams **only that user's** notifications
(`app/api/notifications/stream/route.ts` returns 401 without a session and subscribes
strictly by `session.user.id`), and the publish helper uses **parameterized `pg_notify`**
so a channel name can't inject SQL. See [API.md](API.md#realtime--server-sent-events-sse-tier-4--a22).

## CSP strategy: static vs nonce (and the upgrade path)

This boilerplate ships a **static CSP** with **`script-src 'self' 'unsafe-inline'`**.
That `'unsafe-inline'` is a deliberate tradeoff, not an oversight:

- **Why not hashes?** Next.js App Router injects inline `<script>` tags whose
  content is generated per render (RSC flight data, hydration bootstrap). They
  can't be hash-pinned ahead of time.
- **Why not a nonce?** A nonce-based strict CSP (`script-src 'nonce-…'
  'strict-dynamic'`) is the gold standard, but the nonce must be generated **per
  request in the proxy (middleware)** and read back when rendering. **Reading** it
  (`headers()` in the layout) opts routes into **dynamic rendering**, which regresses
  this repo's static-generation / full-route-cache posture (the `/` landing page
  prerenders statically). The existing broad proxy matcher (i18n) isn't the problem —
  a middleware rewrite doesn't make a route dynamic; the per-request *read* in the
  document shell is.
- **The deeper conflict: `cacheComponents`.** A per-request nonce has to live in
  the **document shell's** inline scripts (next-themes' pre-paint script + Next's
  bootstrap), so the shell itself must render per-request — the exact opposite of
  Cache Components' static-shell model. Reading the nonce in the root layout
  **fails the production build** under `cacheComponents: true` (`Route
  "/_not-found": Uncached data was accessed outside of <Suspense>`). So the nonce
  upgrade is **not a one-file flip here** — it's a deliberate reversal of D4 (Cache
  Components), spelled out in step 4 below and in [DECISIONS.md](DECISIONS.md) (the
  "CSP: static … default; nonce upgrade …" decision).

For most apps the static CSP is the right default. **If your threat model wants the
stronger script-src**, the upgrade ships in-repo as a ready recipe —
**[`apps/web/src/proxy.csp-nonce.ts.example`](../../apps/web/src/proxy.csp-nonce.ts.example)**.

> ✅ **i18n-aware (reworked 2026-07-12) — a drop-in again.** The `.example` now *is*
> the current `proxy.ts` (next-intl's `handleI18nRouting` + the `METADATA_SEGMENTS`
> guard + the locale-stripped auth gate — see [I18N.md](I18N.md)) with the nonce CSP
> layered **around** the i18n hand-off: it augments the request headers with the nonce
> (`x-nonce` + `Content-Security-Policy`), hands the augmented request to next-intl so
> it forwards them to the render, then sets the CSP on the response. Swapping it in
> keeps locale routing intact (`/es/*` still works); an earlier revision carried only
> the pre-i18n auth gate and would have deleted locale routing.

It layers the nonce CSP onto the (locale-aware) auth-cookie gate. It's a verified, scoped
change — but, per the conflict above, **a real reversal of Cache Components, not a
one-file flip**. To adopt it:

1. **Replace `proxy.ts`** with the `.example`'s contents. Per request it generates
   a nonce (`Buffer.from(crypto.randomUUID()).toString("base64")`), builds the CSP
   with `script-src 'self' 'nonce-<nonce>' 'strict-dynamic'` (drops `'unsafe-inline'`
   for scripts; **keeps** it for `style-src`), forwards the nonce on the request
   headers (so Next stamps it on its own injected scripts) plus an `x-nonce` header,
   and sets the `Content-Security-Policy` response header. Its `matcher` is broadened
   to all routes except `api`/`_next`/static files.
2. **Remove the `Content-Security-Policy` entry** from `securityHeaders` in
   `next.config.ts` (keep the other static headers) so the static and per-request
   CSPs don't collide. API/`_next` routes then ship no CSP — fine, they serve no
   page scripts.
3. **In the document-shell layout** (`app/[locale]/layout.tsx` since i18n — already
   `async`, it awaits `params`), read the nonce
   (`(await headers()).get("x-nonce")`) and pass it to any inline script. The only
   one in the default tree is next-themes' pre-paint script — its provider takes a
   `nonce` prop and the `@repo/ui` `ThemeProvider` spreads props through, so
   `<ThemeProvider nonce={nonce} …>` is all it needs. PostHog needs nothing
   (bundled, loaded by the nonced bootstrap → trusted via `'strict-dynamic'`).
4. **Turn Cache Components off and unwind D4** — required (see the conflict above).
   The layout's `headers()` read fails the build with `cacheComponents: true`, so:
   set `cacheComponents: false` in `next.config.ts`; remove the `"use cache"`
   directive + `cacheLife`/`cacheTag` from `components/posts/post-stats.tsx`; and
   drop the `updateTag("posts")` calls in `server/actions/post.ts` (keep
   `revalidatePath("/posts")`, or use Next 16's two-arg `revalidateTag`). If your
   fork doesn't use D4's `"use cache"` showcase, this is just `cacheComponents: false`.

The `.example` file carries these steps inline plus a verification recipe, and
follows Next.js's official "Content Security Policy" guide. **Verified end-to-end**
(2026-06-27; re-verified against the i18n proxy 2026-07-12): with the recipe + D4
unwind applied, a prod build serves a per-request `'nonce-…' 'strict-dynamic'` CSP
(no script `'unsafe-inline'`) on **both** the unprefixed default locale and `/es`;
every `<script>` tag (external chunks + next-themes' inline pre-paint) carries that
per-request nonce; the `/en`→`/` and locale-aware auth redirects still fire; and
`/[locale]` builds dynamic (`ƒ`). Documented here — and in
[DECISIONS.md](DECISIONS.md) (the CSP decision) — so the upgrade is a known, scoped
change, not a rediscovery.

## CSP violation reporting (opt-in)

The shipped CSP is **enforce-only and silent**: when a directive blocks something
in production, the symptom is a broken feature plus a DevTools console line on the
*user's* machine — nothing reaches you. Pointing the CSP's reporting directives at
Sentry's per-project **security endpoint** makes violations observable (each report
becomes a Sentry event). That matters in two situations:

- **Catching breakage you didn't cause** — a SaaS SDK starts loading from a new
  host and a feature dies only for real users.
- **Trialing a policy change** — serve the candidate policy as
  `Content-Security-Policy-Report-Only` with these same reporting directives and
  watch what real traffic *would* have broken before enforcing it. This is the
  natural dry-run companion to the nonce upgrade above.

Like the nonce upgrade, this ships as a **recipe, not a default**: reports are
noisy (browser extensions inject resources that violate *your* policy and report
as if they were your bugs), they consume Sentry quota, and there's no Sentry
project to point at until you configure one.

### The endpoint

Derived from the DSN already in `NEXT_PUBLIC_SENTRY_DSN` (or copy it ready-made
from Sentry → **Project Settings → Security Headers**):

```text
DSN:      https://<key>@o<org>.ingest.<region>.sentry.io/<projectId>
endpoint: https://o<org>.ingest.<region>.sentry.io/api/<projectId>/security/?sentry_key=<key>
```

Optional `&sentry_environment=…` / `&sentry_release=…` query params tag the events.

### The recipe (`next.config.ts`)

Ship **both** reporting mechanisms — that's deliberate, not redundancy:

- **`report-uri`** — deprecated in the CSP spec, but the only directive pre-2026
  Safari/Firefox understand; delivers promptly as `application/csp-report`.
- **`report-to`** + the **`Reporting-Endpoints`** response header — the
  replacement, but Baseline "newly available" only since **March 2026**; batched
  delivery as `application/reports+json`.

Browsers that support `report-to` **ignore** `report-uri`, so nothing
double-reports. And **no `connect-src` change is needed**: violation reports are
exempt from the page's own CSP by spec (observed live — see below).

```diff
 const isDev = process.env.NODE_ENV !== "production";

+// CSP violation reporting (opt-in, Sentry): derive the project's security
+// endpoint from the DSN — https://<key>@o<org>.ingest.<region>.sentry.io/<proj>
+// → <origin>/api/<proj>/security/?sentry_key=<key>. Violation reports are
+// exempt from the page's own CSP, so connect-src needs no change. Unset DSN →
+// null → the CSP below stays byte-identical to the no-reporting build.
+const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
+let cspReportEndpoint: string | null = null;
+if (sentryDsn) {
+  try {
+    const dsn = new URL(sentryDsn);
+    const projectId = dsn.pathname.slice(1);
+    if (dsn.username && projectId) {
+      cspReportEndpoint = `${dsn.protocol}//${dsn.host}/api/${projectId}/security/?sentry_key=${dsn.username}`;
+    }
+  } catch {
+    // Malformed DSN — env.ts (z.url()) fails the boot before this is reachable.
+  }
+}
```

```diff
   "object-src 'none'",
+  // Both reporting mechanisms: report-uri for pre-2026 Safari/Firefox,
+  // report-to (+ the Reporting-Endpoints header below) for modern browsers —
+  // browsers that support report-to ignore report-uri, so nothing double-reports.
+  ...(cspReportEndpoint ? [`report-uri ${cspReportEndpoint}`, "report-to csp-endpoint"] : []),
   ...(isDev ? [] : ["upgrade-insecure-requests"]),
 ].join("; ");
```

```diff
 const securityHeaders = [
   { key: "Content-Security-Policy", value: contentSecurityPolicy },
+  // Names the "csp-endpoint" group the CSP's report-to directive references.
+  ...(cspReportEndpoint
+    ? [{ key: "Reporting-Endpoints", value: `csp-endpoint="${cspReportEndpoint}"` }]
+    : []),
   { key: "X-Frame-Options", value: "DENY" },
```

With `NEXT_PUBLIC_SENTRY_DSN` unset both spreads contribute nothing — the built
header set is **byte-identical** to the shipped one (verified by diffing
`.next/routes-manifest.json` between builds), the same graceful-degradation
posture as every other integration.

### Verified (2026-07-05 local · 2026-07-06 live) + what to expect

The recipe was applied ad hoc to a local prod build with the endpoint pointed at
a local sink (no Sentry creds on the dev box; the shipped commit is docs-only):

- Both headers render exactly as designed, and a real violation (`fetch()` to an
  off-allowlist origin) delivered this actual legacy POST —
  `Content-Type: application/csp-report`:

  ```json
  {
    "csp-report": {
      "document-uri": "http://localhost:3100/",
      "violated-directive": "connect-src",
      "effective-directive": "connect-src",
      "blocked-uri": "https://example.com/",
      "disposition": "enforce",
      "source-file": "http://localhost:3100/_next/static/chunks/39_….js",
      "line-number": 10,
      "status-code": 200,
      "original-policy": "default-src 'self'; … report-uri http://localhost:9099/api/424242/security/?sentry_key=…"
    }
  }
  ```

- The modern path verifies to the browser's edge: CDP
  (`Network.enableReportingApi`) shows the same violation queued as a
  `csp-violation` report for the `csp-endpoint` group. **Chromium's report
  uploader only delivers to trusted-https endpoints** — plain-http endpoints
  (even localhost) and self-signed certs are refused, and the cert-bypass launch
  flags don't apply to it — so modern-path delivery can't be faked locally.
  (That untrusted endpoint is also *why* the legacy POST above was observable at
  all: a rejected endpoint never registers the `csp-endpoint` group, and with no
  recognized `report-to` group the browser falls back to `report-uri`.)
  Sentry's real endpoint *is* trusted https, and the legacy path proved delivery
  to the same URL. The Sentry-side half (report → event in the Sentry UI) is a
  [VERIFICATION.md](../VERIFICATION.md) Phase-4 row.
- **Live re-run against a real DSN (2026-07-06→07, Phase-4 row):** Sentry's
  endpoint answers the CORS preflight and returns **200** to both wire formats
  POSTed directly; a real browser-generated report **delivered end-to-end → 200**
  via the legacy leg (`report-uri` alone, i.e. pre-2026-browser behavior); and
  report→event processing is confirmed (`event.type:csp` in Issues — the default
  Issues feed can hide these, so search explicitly). Two caveats for re-verifiers:
  - **Sentry silently drops security reports for `localhost` pages** —
    200-accepted, no event, even with the "Filter out events coming from
    localhost" inbound filter **off** (paired-probe verified: the same report
    with a non-localhost `document-uri` creates the event). Local-page tests
    will never show in Issues; prove processing with a non-localhost
    `document-uri` probe and treat the delivery 200 as the local success signal.
  - The modern `report-to` **background uploader never fires under browser
    automation** — Playwright Chromium (headless *and* headed), real Chrome
    launched under automation, and Firefox 151 all register + queue the report
    (CDP shows Queued→Pending cycles) but no upload ever leaves the browser, and
    since a *registered* `report-to` group suppresses `report-uri`, an automated
    check of the full recipe observes nothing at all. That leg is only
    observable by hand on a **deployed (non-localhost) page** in a normal
    browser; don't burn time trying to script it.
- **Self-hosted / non-`sentry.io` Sentry:** the *reports* are CSP-exempt, but the
  browser SDK's own event POSTs are not — a DSN pointing off `*.sentry.io` also
  needs its host added to `connect-src` (the live check watched exactly this
  violation fire when the DSN targeted the local sink).

Expect **noise** once enabled: extension-injected resources and outdated browsers
file reports that aren't your bugs. Tag events with `sentry_environment`, and
treat report volume as a signal to *investigate*, not an error budget.

## Cross-origin isolation (COOP · CORP · COEP)

Of the three cross-origin isolation headers, **only COOP ships**; CORP and COEP are
**deliberate omissions**, not oversights.

- **`Cross-Origin-Opener-Policy: same-origin`** (shipped, dev + prod — no localhost
  footgun, unlike HSTS). It cuts the `window.opener` reference between this app and
  any cross-origin window, blocking tabnabbing and opener-based XS-Leaks. Plain
  `same-origin` (not `same-origin-allow-popups`) is safe **because every cross-origin
  hand-off in this repo is a same-tab, top-level redirect, which COOP does not
  affect**: OAuth is `signIn.social` (full-page navigation to the provider,
  `components/auth/social-sign-in.tsx`) and Stripe hosted checkout is
  `window.location.href = url` (`components/billing/subscribe-button.tsx`). Nothing
  calls `window.open` or relies on `window.opener`. PostHog's toolbar launch also
  survives: it authenticates via a URL fragment, not the opener. **Relax to
  `same-origin-allow-popups` only if your fork adds a popup flow that must keep its
  opener** (popup-mode OAuth, a payment SDK that opens and messages a window).
- **`Cross-Origin-Embedder-Policy` (omitted).** COEP (`require-corp`) exists to turn
  on `crossOriginIsolated` (SharedArrayBuffer, high-precision timers) — nothing here
  needs that, and the cost is real: every cross-origin subresource must opt in via
  CORP/CORS, which would break the Stripe `js.stripe.com` frames and Uploadthing
  `*.ufs.sh` images unless those hosts cooperate. Don't add it without a concrete
  `crossOriginIsolated` requirement.
- **`Cross-Origin-Resource-Policy` (omitted).** CORP restricts **who may embed this
  app's own responses** cross-origin. A blanket `same-origin` would be safe for the
  repo as shipped (no other origin embeds our assets; the email templates reference
  no app-hosted images) — but it's a silent footgun for the most common fork move:
  hosting a logo on the app and embedding it in emails would invisibly break image
  rendering in webmail clients, with no error surfaced anywhere. If you serve nothing
  meant for cross-origin embedding, opt in with one line in `securityHeaders`:
  `{ key: "Cross-Origin-Resource-Policy", value: "same-origin" }`.

The unconditional header set (including COOP) is regression-guarded by
`apps/web/e2e/security-headers.spec.ts`.

## security.txt (RFC 9116)

`/.well-known/security.txt` advertises a vulnerability-disclosure channel — the
standard location security researchers (and automated scanners) probe. It's a
**route handler**, `apps/web/src/app/.well-known/security.txt/route.ts`, not a
static `public/` file, so the RFC-9116-**required** `Expires` field is **computed**
(`now + 1 year`, ISO 8601) at request time instead of a hand-maintained date —
matching the generated posture of the sibling metadata routes (`robots.ts` /
`sitemap.ts` / `manifest.ts`). `Canonical` uses `siteUrl` from `@/lib/site` exactly
like `robots.ts` (so it works with the env unset, falling back to `localhost`).

> ⚠ **Replace the placeholder `Contact` (`mailto:security@example.com`) before
> production** — the file leads with a comment saying so. Consider also adding an
> `Encryption:` PGP key and serving a PGP-signed variant (out of scope for the
> boilerplate). See <https://securitytxt.org>.

## Verifying headers locally

```bash
# Production headers (build first; a lingering `next dev` may hold :3000, so
# start prod on another port via PORT — the `start` script is dotenv-wrapped, so
# `-- -p 3100` gets mangled; set PORT instead):
pnpm --filter web build
PORT=3100 pnpm --filter web start    # PowerShell: $env:PORT=3100; pnpm --filter web start
curl -I http://localhost:3100/          # shows CSP, HSTS, X-Frame-Options, etc.

# Dev headers (note 'unsafe-eval' + ws: in the CSP, and no HSTS):
curl -I http://localhost:3000/
```

The PostHog proxy stays reachable with the CSP on: `curl -I
http://localhost:3100/ingest/static/array.js` → `200`. For a deployed host, an
external scanner (e.g. securityheaders.com, Mozilla Observatory) grades the live
response.

## Rate limiting (app-level)

Rate limiting is **two layers**, by design — don't conflate them:

1. **Auth routes** (`/api/auth/*`) — Better Auth's own built-in limiter, configured
   in `packages/auth/src/auth.ts` (Step 19). Tight `customRules` on sign-in /
   sign-up / password-reset / verification, plus the **four 2FA endpoints** —
   `/two-factor/enable` + `/two-factor/disable` (3/min, password-gated state changes)
   and `/two-factor/verify-totp` + `/two-factor/verify-backup-code` (5/min, the
   brute-force-sensitive sign-in challenge) — and the **six passkey / WebAuthn
   endpoints** `/passkey/{generate-register-options, verify-registration,
   generate-authenticate-options, verify-authentication, delete-passkey, update-passkey}`
   (10/min each — a passkey is a strong credential, so the cap is looser than TOTP yet
   still throttles abuse), plus the **five admin-plugin endpoints** `/admin/{set-role,
   ban-user, unban-user}` (20/min), `/admin/impersonate-user` (10/min) and
   `/admin/stop-impersonating` (30/min) — already admin-gated, so these caps limit a
   compromised or misbehaving admin session, not an anonymous brute force. Its counters are
   stored in the **app Postgres** (`rateLimit.storage: "database"`, the `rate_limit` table) so
   they hold across instances / a restart, not per-instance memory. See
   [AUTH.md](AUTH.md#multi-instance-storage) → Rate limiting.
2. **Everything else** — the broader **app-level** limiter in
   `apps/web/src/lib/rate-limit.ts` (Step 20), applied to the Stripe webhook, a
   sample Server Action, and a tRPC middleware. This section covers (2).

### The utility

`lib/rate-limit.ts` is a standalone, `server-only` helper (it mirrors Better Auth's
window/max posture but is callable from any server surface — Better Auth's limiter
is internal to its request handler and can't be reused):

```ts
rateLimit(identifier, { limit, windowSec }): Promise<{ success, limit, remaining, reset }>
clientKeyFromHeaders(headers): string        // x-forwarded-for / x-real-ip → IP key
isDistributedRateLimitConfigured(): boolean
```

Prefix the identifier per surface (`webhook:${ip}`, `checkout:${userId}`,
`trpc:${path}:${ip}`) so call sites don't share a bucket.

### Where it's applied

| Surface | File | Keyed by | Limit | On exceed |
| --- | --- | --- | --- | --- |
| Stripe webhook | `app/api/stripe/webhook/route.ts` | client IP (`webhook:noip` when unresolved) | 100 / min (**20 / min** for the `noip` bucket) | HTTP **429** + `RateLimit-*` / `Retry-After` (before signature work) |
| Checkout + billing-portal actions | `server/actions/billing.ts` | `session.user.id` | 5 / min each | typed `{ error }` (Server Actions can't set a 429 status) |
| Post create / update actions | `server/actions/post.ts` | `session.user.id` | 10 / min each | typed `{ error }` |
| `reindexPosts` action | `server/actions/post.ts` | `session.user.id` | 3 / min (full-table scan + bulk index write — see SERVICES.md) | typed `{ error }` |
| Upload middleware + `deleteUpload` action | `lib/uploadthing.ts` / `server/actions/uploads.ts` | `session.user.id` | 10 / min each | `UploadThingError` (surfaces in `onUploadError`) / typed `{ error }` |
| tRPC (`rateLimitedProcedure`) | the public reads — `post.list` (`routers/post.ts`) + `search.search` (`routers/search.ts`) | `trpc:${path}:${ip}` | 20 / min | `TRPCError TOO_MANY_REQUESTS` → HTTP **429** + `RateLimit-*` / `Retry-After` |
| tRPC (`userRateLimitedProcedure`, A16) | the authenticated abusable reads — `post.listMine` (`routers/post.ts`) | `trpc:${path}:user:${session.user.id}` | 20 / min | `TRPCError TOO_MANY_REQUESTS` → HTTP **429** + `RateLimit-*` / `Retry-After` |

The webhook limit is deliberately generous: genuine Stripe deliveries come from a
small set of IPs and can burst, so 100/min passes normal traffic while capping a
spoofed flood.

### 429 response headers

Every surface that returns an HTTP **429** from this limiter — the Stripe webhook and
the tRPC `rateLimitedProcedure` / `userRateLimitedProcedure` — emits the standard set
via one helper, `rateLimitHeaders()` (`lib/rate-limit.ts`), so the contract is defined once:

| Header | Value | Spec |
| --- | --- | --- |
| `RateLimit-Limit` | the per-window ceiling (e.g. `20`) | IETF draft `ratelimit-headers` |
| `RateLimit-Remaining` | requests left in the window (`0` when blocked) | IETF draft |
| `RateLimit-Reset` | **delta-seconds** until the window resets | IETF draft |
| `Retry-After` | same delta-seconds | RFC 9110 |

Emitted on the **429 only** — a normal 2xx carries none (verified live: a `post.list`
200 has no rate-limit headers; the 21st hit in a 60 s window returns 429 with all four).
The tRPC path can't set headers from the thrown `TRPCError`, so the middleware stashes
the blocked bucket on `ctx.rateLimit.blocked` and the fetch handler's `responseMeta`
(`app/api/trpc/[trpc]/route.ts`) translates it into headers after the batch resolves.

The **Server-Action** surfaces (checkout / post / upload) return a typed `{ error }`
rather than a 429 — a Server Action can't set a response status — so they carry no
headers by design; the client renders the typed error.

The **auth routes** (`/api/auth/*`) are a separate layer (Better Auth's own limiter,
Step 19), which already emits its own **`X-Retry-After`** header on a 429 — not the
`RateLimit-*` set above, and not touched by this helper.

### Storage: in-memory default → optional Upstash

- **Unset (default):** a per-instance in-memory fixed-window counter. Zero deps,
  works offline, live in local dev. **Caveat:** it resets on restart and is **not
  shared across instances** — correct for single-instance only. (This is the layer that
  still carries that caveat: the Better Auth auth-route limiter was moved to
  `rateLimit.storage: "database"` so *its* counters now hold across instances — see
  [AUTH.md](AUTH.md#multi-instance-storage).)
- **Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`:** switches to a
  distributed Upstash sliding-window limiter (`@upstash/ratelimit` +
  `@upstash/redis`, imported lazily only when configured). **Required for any
  multi-instance / serverless deployment.** Get the REST URL+token from the Upstash
  console; the names are exactly what `Redis.fromEnv()` reads.

**No CSP / allowlist change for Upstash:** the limiter's REST calls are
**server-to-server** (the module is `server-only`), never browser fetches — CSP only
governs browser content sources. This is why Step 20 touches no `next.config.ts` CSP
directive. (If a future limiter ran in the *browser*, you'd add its origin to
`connect-src` and to the per-SaaS table above.)

**Failure mode:** if Upstash is unreachable the limiter **fails open** (allows the
request) and logs the error — a transient Redis blip shouldn't lock everyone out.
Flip the fallback in `lib/rate-limit.ts` to a denying result if you prefer
fail-closed.

### Client IP resolution & trusted proxies (D10)

IP-based limiting is only as trustworthy as the headers it reads. `lib/rate-limit.ts`
exposes two resolvers:

- `clientIpFromHeaders(headers): string | null` — the first `x-forwarded-for` entry,
  then `x-real-ip`, else `null`. Use it when the caller wants to branch on "no IP."
- `clientKeyFromHeaders(headers): string` — best-effort; the IP, or the constant
  `"unknown"` when none. **Fail-safe**: an unknown source shares one bucket rather than
  bypassing the limit. Used by the public tRPC reads.

**These headers are only reliable behind a proxy that sets (and sanitizes) them.** On
the platforms you'd actually deploy this on, the edge/load-balancer sets them for you:

| Platform | Header it sets |
| --- | --- |
| Vercel | `x-forwarded-for` (+ `x-real-ip`) |
| Fly.io | `fly-client-ip` → also `x-forwarded-for` |
| Railway / Render | `x-forwarded-for` |
| Cloudflare (in front) | `cf-connecting-ip` → propagated as `x-forwarded-for` |
| nginx / Caddy / Traefik (self-host) | `x-forwarded-for` / `x-real-ip` (configure the proxy to set it) |

⚠️ **Spoofing caveat.** If the app is **directly internet-facing** (no proxy in front),
`x-forwarded-for` is *client-controlled*: an attacker can rotate it per request for a
fresh bucket each time, bypassing IP limiting entirely — and a client that omits it
collapses everyone into the shared `"unknown"` bucket. **Put a trusted proxy in front**
(one that overwrites the inbound header with the real peer IP) for IP limiting to mean
anything. This is a deployment property, not something the app can detect — hence it's
documented rather than enforced.

**Per-surface IP-less behavior:**

- **tRPC reads** — share the `"unknown"` bucket (fail-safe; low stakes for public reads).
- **Stripe webhook** — a genuine delivery always carries a client IP, so an IP-less hit
  is abnormal: it's routed to a separate, tighter `webhook:noip` bucket (20/min) instead
  of the generous 100/min per-IP ceiling. We **throttle, not hard-deny** — a hard deny
  would break the webhook on a misconfigured no-proxy host. If you run behind a proxy you
  trust to always set the header, flip the `noip` branch in `route.ts` to a `400`.

## Admin authorization & impersonation (Tier 4 · Band 4)

The `/admin` operator console and the Better Auth `admin()` plugin (ban + impersonation) form a
privileged surface. The security posture:

- **Authorization is always the fresh-DB `requireAdmin()`**, never the cookie-cached session
  role. The proxy does only an optimistic cookie-presence redirect for `/admin`; the
  authoritative check is `requireAdmin()` in the Server Component / Server Action, so a demotion
  bites on the **next request**, not up to 5 min later. Every `admin()` plugin endpoint, by
  contrast, authorizes off the **session** role — which is exactly why ban/unban are performed as
  **fresh-gated direct DB writes** (not the plugin endpoint) and why impersonation carries a
  ≤5-min residual (below). See
  [AUTH.md](AUTH.md#admin-plugin--ban--impersonation-tier-4--band-4).
- **Ban revokes live sessions immediately** (`banUser` deletes the target's `session` rows) and
  blocks re-sign-in via the plugin's fresh `session.create.before` hook — not just a future
  sign-in block. An elapsed `ban_expires` auto-lifts at the next sign-in attempt.
- **Impersonation residual (accepted, documented).** Impersonation is a session-cookie swap only
  the plugin can do, so it authorizes off the session role: a **just-promoted admin must
  re-sign-in** before they can impersonate. The wrapper Server Action's fresh `requireAdmin()`
  gate still blocks a just-*demoted* admin the plugin alone would trust for ≤5 min, and every
  ban / impersonation mutation is written to the `audit_log`. **`allowImpersonatingAdmins` is
  false** — an admin can't impersonate another admin (no lateral privilege capture).
- **Anti-lockout throughout** — an admin can't ban or impersonate themselves, and can't change
  their own role, so the last admin can never lock the app out of `/admin`.
