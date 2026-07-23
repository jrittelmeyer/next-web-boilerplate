# PostHog (Analytics + Feature Flags)

> When to load: working on analytics, feature flags, user identification, the consent banner, or the `/ingest` proxy (PostHog). Shared client/degradation conventions: [../SERVICES.md](../SERVICES.md).

- SDKs: `posthog-js` (client), `posthog-node` (server).
- **Client provider:** `apps/web/src/components/observability/posthog-provider.tsx`
  (`"use client"`), mounted in the root layout. Guarded `posthog.init()` (only when
  `NEXT_PUBLIC_POSTHOG_KEY` is set) and renders `children` straight through, so it's a
  transparent passthrough when unconfigured and **does not widen the RSC boundary**
  (see [../STATE.md](../STATE.md)).
- **Server client:** `apps/web/src/lib/posthog.ts` (`import "server-only"`), a lazy
  guarded singleton (`getPostHogServer()` + `isPostHogConfigured()`) — **same posture
  as `lib/stripe.ts`/`lib/search.ts`**. Used for feature-flag evaluation and
  server-side capture. Feature flags are checked **server-side** to avoid client flicker.
- **User identification:** `PostHogAuthSync`, a tiny watcher inside the
  provider's *configured* branch, subscribes to Better Auth's `useSession` and calls
  `posthog.identify(user.id, { email, name })` when a signed-in session appears with
  PostHog still on an anonymous id (merging the device's pre-login events into the
  person), and `posthog.reset()` on a sign-out **transition** (new anonymous id, so a
  shared device doesn't attribute the next visitor's events; reopening with an
  *expired* session deliberately does NOT reset — PostHog ties reset to explicit
  logout). It's a **session watcher, not per-form calls**: OAuth sign-in returns via a
  top-level redirect (no client success callback ever runs), and sessions also end
  outside the sign-out button (remote revoke, account deletion) — one component covers
  every path. The identify id equals the Better Auth user id, i.e. exactly the
  `distinctId` the server-side flag checks pass, so client + server land on one person
  profile. Decision logic is extracted to `lib/posthog-identity.ts` (unit-tested +
  coverage-gated, the `user-agent.ts` pattern); a direct user-A→user-B cookie swap
  resets before re-identifying so A's events never merge into B. When unconfigured
  the watcher never mounts — no `useSession` subscription, zero cost (the one cost
  when configured: a client get-session fetch per hard load).

- **Consent gating:** the client SDK inits with
  `opt_out_capturing_by_default: true`, so **no events, pageviews, or `identify` fire
  until the user explicitly opts in** — GDPR-friendly by default. A `ConsentBanner`
  (`components/observability/consent-banner.tsx`), rendered only inside the provider's
  *configured* branch, asks once: **Accept** → `posthog.opt_in_capturing()`, **Decline**
  → `posthog.opt_out_capturing()`. posthog-js persists that single opt-in/out record (the
  consent decision itself — the one thing it may store pre-consent), so the banner shows
  once and the choice survives reloads. Withdrawing/changing it later lives on `/account`
  (the **Privacy & data** card, `components/account/privacy-card.tsx`). The tri-state
  decision logic (`granted`/`denied`/`unset`) is a pure, unit-tested `readConsent()`
  (`lib/consent.ts`); the shared reactive store + mutators are `useConsent()`
  (`components/observability/use-consent.ts`), woken by `notifyConsentChanged()` on each
  choice and once after `posthog.init` (posthog-js emits no consent/ready event). When
  unconfigured, none of this mounts — nothing to consent to.

```typescript
// Server-side feature flag (RSC) — degrade gracefully, never throw:
if (isPostHogConfigured()) {
  const on = await getPostHogServer().isFeatureEnabled("example-flag", distinctId);
}
```

**`/ingest` reverse proxy:** `next.config.ts` adds `rewrites()` (+ `skipTrailingSlashRedirect`)
that proxy `/ingest/*` → the PostHog ingestion host and `/ingest/static/*` → the
`-assets` host (both derived from `NEXT_PUBLIC_POSTHOG_HOST`). The client SDK uses
`api_host: "/ingest"` so analytics traffic is same-origin and dodges ad-blockers.

**Key env vars** (all **optional** — unset means the SDKs are inert):
- `NEXT_PUBLIC_POSTHOG_KEY` — project API key; `isPostHogConfigured()` gates on it.
- `NEXT_PUBLIC_POSTHOG_HOST` — region ingestion host: `https://us.i.posthog.com` (US)
  or `https://eu.i.posthog.com` (EU). Defaulted to US at use sites. The legacy
  `app.posthog.com` is deprecated for ingestion.

**Remove it** (self-contained):
1. Delete (under `apps/web/src/`) `lib/posthog.ts`, `lib/posthog-identity.ts` (+ `.test.ts`),
   `lib/consent.ts` (+ `.test.ts`), `components/observability/posthog-provider.tsx`,
   `components/observability/consent-banner.tsx`, `components/observability/use-consent.ts`.
   Then drop the analytics section from `components/account/privacy-card.tsx` (or delete the
   whole card if no data-export control remains) and its render in
   `app/[locale]/(dashboard)/account/page.tsx`.
2. Unmount the provider in `app/[locale]/layout.tsx` (the document shell): drop the
   `PostHogProvider` import + wrapper, keeping the other providers nested as they are.
3. Remove the `/ingest` proxy in `next.config.ts`: the `posthogHost`/`posthogAssetHost` consts,
   both `rewrites()` entries, and `skipTrailingSlashRedirect` (added only for the proxy).
4. `pnpm --filter web remove posthog-js posthog-node`.
5. Remove from `.env.example` + `env.ts`: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
   (`client` entries + `experimental__runtimeEnv` lines).
6. Trim the CSP `connect-src` in `next.config.ts`: drop `https://*.posthog.com`. Then grep for any
   `getPostHogServer()` / `isPostHogConfigured()` feature-flag call sites and remove them.
