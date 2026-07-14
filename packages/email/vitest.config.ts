import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Render smoke tests (verify lane, fast + no I/O). They render every template to
// BOTH HTML and plain-text through the SAME `@react-email/render` calls the app's
// send path uses (see send.tsx), and assert the send helpers degrade gracefully
// when email is unconfigured. String rendering needs no DOM, so environment: node.
// Vitest 4's built-in oxc transform handles the automatic JSX runtime — no
// @vitejs/plugin-react needed (mirrors @repo/ui). The `server-only` alias lets the
// send helpers be imported in node (the real marker throws outside a React Server
// bundle); the templates themselves are pure and import nothing server-only.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./src/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      all: true,
      // Scope to the pure, fully render-covered templates. send.tsx/client.ts wrap
      // the Resend SDK + `server-only` (the email equivalent of @repo/jobs' boss.ts
      // bootstrap) — smoke-tested for degradation but kept out of the floor.
      include: ["src/templates/**/*.tsx"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reporter: ["text", "json", "lcov"],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
