import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `apps/web` Vitest project (C2). Unit/branch coverage for the logic-dense server
// modules (Server Actions + lib/*). Environment is `node` — these are server-side
// logic with no DOM (unlike @repo/ui's jsdom config). Unit tests are `src/**/*.test.ts`;
// Playwright owns `e2e/**/*.spec.ts`, so the two runners never collide (TESTING.md).
//
// These aliases unblock importing app modules under test (the historical reason this
// project didn't exist):
//   - `@/env`     → a plain stub, so createEnv()'s import-time validation never runs.
//   - `server-only` → an empty module, since the real package throws on import in a
//                     non-React-Server (node) env, which `lib/rate-limit` + `lib/rbac` hit.
//   - `next/navigation` + `next/link` → no-op stubs. lib/i18n-metadata.ts imports
//     @/i18n/navigation, whose next-intl createNavigation imports these Next runtime
//     modules at load; the tests only call its PURE getPathname, so the stubs just
//     satisfy the ESM link check. No tested module imports the real next/navigation.
// Exact-match aliases must come BEFORE the `@/` prefix alias (first match wins).
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/env$/, replacement: `${srcDir}/test/env.stub.ts` },
      { find: /^server-only$/, replacement: `${srcDir}/test/empty.ts` },
      { find: /^next\/navigation$/, replacement: `${srcDir}/test/next-navigation.stub.ts` },
      { find: /^next\/link$/, replacement: `${srcDir}/test/next-link.stub.ts` },
      { find: /^@\//, replacement: `${srcDir}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Inline next-intl so vite TRANSFORMS it (node_modules are externalized by
    // default, which would skip the next/navigation + next/link aliases above).
    // lib/i18n-metadata.ts reaches next-intl's createNavigation through
    // @/i18n/navigation; inlining lets the stubs intercept its Next-runtime imports.
    server: { deps: { inline: ["next-intl"] } },
    // Coverage is scoped to exactly the modules C2 covers — NOT all of src/, which
    // would force a near-zero floor (every route/component would count). `all: true`
    // so untested branches in these files drag the % down honestly. The suite
    // sits at 100% statements/lines/functions and ~91% branches (the remaining
    // branches are defensive `?? fallback` right-hand sides that a failed Zod parse /
    // a non-Error throw can't actually reach). Thresholds are a regression FLOOR a few
    // points under those values (repo convention) — a real coverage drop fails CI's
    // `test:coverage` step, while defensive-fallback churn doesn't.
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "src/server/actions/avatar.ts",
        "src/server/actions/calendar.ts",
        "src/server/actions/post.ts",
        "src/server/actions/admin.ts",
        "src/server/actions/billing.ts",
        "src/server/actions/data-export.ts",
        "src/server/actions/notification.ts",
        "src/server/actions/uploads.ts",
        "src/server/actions/user.ts",
        "src/lib/audit-format.ts",
        "src/lib/auth-redirect.ts",
        "src/lib/avatar.ts",
        // This list is an explicit file list, NOT a glob (a glob would drag every
        // route and component into the denominator and force the floor to near
        // zero). The tell that a new module was forgotten is that the totals don't
        // move when it lands — so add the file in the same commit as the module.
        "src/lib/calendar-acl.ts",
        "src/lib/calendar-attendees.ts",
        "src/lib/calendar/grid.ts",
        "src/lib/calendar/recurrence-dates.ts",
        "src/lib/calendar/recurrence-prose.ts",
        "src/lib/consent.ts",
        "src/lib/data-export.ts",
        "src/lib/env-schema.ts",
        "src/lib/forms.ts",
        "src/lib/i18n-metadata.ts",
        "src/lib/keyset-cursor.ts",
        "src/lib/organization.ts",
        "src/lib/otel.ts",
        "src/lib/posthog-identity.ts",
        "src/lib/rate-limit.ts",
        "src/lib/rbac.ts",
        "src/lib/slugify.ts",
        "src/server/realtime/sse.ts",
        "src/lib/subscription.ts",
        "src/lib/user-agent.ts",
        "src/lib/user-preferences.ts",
        "src/server/notifications/create.ts",
        // Has had a test file since A22 but was never counted — and it is the file
        // whose fail-closed `safeParse` drops a notification with no log, no error and
        // no Sentry event. Counting it is part of closing that hole, not bookkeeping.
        "src/server/realtime/notification-bus.ts",
        "src/stores/ui-store.ts",
      ],
      reporter: ["text", "json", "lcov"],
      thresholds: { lines: 95, functions: 95, branches: 88, statements: 95 },
    },
  },
});
