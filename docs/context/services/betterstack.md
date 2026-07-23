# BetterStack / Logtail (Logging)

> When to load: working on structured server-side logging via `@logtail/next` (BetterStack/Logtail). Shared degradation conventions: [../SERVICES.md](../SERVICES.md).

- SDK: `@logtail/next` (BetterStack's Next.js logger; `withLogtail`/`log` are aliases
  of the rebranded `withBetterStack`/`log`).
- Usage: structured server-side logging via the `log` export. Used directly in
  server code (Server Actions / route handlers / RSCs) — no next.config wrapper is
  required for the scaffold (`withBetterStack` is available for automatic request +
  web-vitals logging as an opt-in).

```typescript
import { log } from "@logtail/next";
import { after } from "next/server";

log.info("User signed in", { userId: session.user.id });
log.error("Stripe webhook failed", { error: err.message });
// Flush via next/after: runs AFTER the response is sent, so a short-lived/serverless
// runtime can't freeze before the batched logs ship — without blocking the response.
after(() => log.flush());
```

**Graceful when unconfigured:** with the source token + ingesting URL unset, `log`
**falls back to console** (it never throws), so the app runs identically without
BetterStack creds. Example scaffold: `apps/web/src/server/actions/observability.ts`
(`logExampleEvent`, returns the typed `{ error } | { data }` shape).

**Key env vars** (both **optional**; both needed to actually ship logs):
- `BETTER_STACK_SOURCE_TOKEN` — the source token. *(The SDK also reads the legacy
  `LOGTAIL_SOURCE_TOKEN`. Note: it is **not** `BETTERSTACK_API_KEY` — verified against
  the installed `@logtail/next@0.3.1` source.)*
- `BETTER_STACK_INGESTING_URL` — the per-source ingesting host from the BetterStack
  dashboard (legacy `LOGTAIL_URL`). The logger needs **both** token and URL set.

**Swap, don't delete — `log` is the app's logging façade.** `@logtail/next`'s `log` is imported
across the server layer (`server/trpc/trpc.ts`, every `server/actions/*`, the Uploadthing router)
and already **falls back to `console`** when the env is unset:
1. **Just stop shipping logs:** leave `BETTER_STACK_SOURCE_TOKEN`/`BETTER_STACK_INGESTING_URL`
   unset (the default) — `log` is console-only. Nothing to remove.
2. **Fully drop `@logtail/next`:** add a local `log` shim (e.g. `apps/web/src/lib/log.ts` wrapping
   `console` with the same `{ info, warn, error, flush }` shape), swap
   `import { log } from "@logtail/next"` → the shim across every file that uses it
   (grep `@logtail/next`), then `pnpm --filter web remove @logtail/next` and drop the two
   `BETTER_STACK_*` env vars.
3. The BetterStack **dashboards-as-code** package (`@repo/observability`) is a separate concern —
   see [observability-dac.md](observability-dac.md).
