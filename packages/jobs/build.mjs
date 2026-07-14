// Bundle the background-jobs worker into a single self-contained ESM file for the
// production image. The worker runs TS source via `tsx` in development (see the
// `start`/`dev` scripts), but shipping a TS transpiler + the full dev install to
// production is wasteful; this compiles `worker.ts` and everything it imports —
// the workspace TS packages (@repo/db, @repo/email + its JSX templates) and their
// JS dependencies — down to `dist/worker.js`, which the slim Docker `worker` stage
// runs with a plain `node dist/worker.js`. See docker/Dockerfile + DEPLOYMENT.md.
//
// Run: `pnpm --filter @repo/jobs build` (also invoked by the root `pnpm build`).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(here, "src/worker.ts")],
  outfile: resolve(here, "dist/worker.js"),
  bundle: true,
  platform: "node",
  // Matches the Docker base image (node:24-alpine) and package.json engines.
  target: "node24",
  format: "esm",
  // Some bundled CommonJS dependencies call `require` at runtime; in an ESM output
  // `require` is not defined, so recreate it from the module URL (the standard
  // esbuild ESM-on-Node shim).
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  // `server-only` is a marker package whose default export throws outside a React
  // Server bundler — its only job is to fail a CLIENT build. The worker is a plain
  // Node process, so alias it to the empty stub (same neutralization the runtime
  // tsconfig applies via `paths`). @repo/email's send helper imports it.
  alias: {
    "server-only": resolve(here, "src/server-only.ts"),
  },
  // pg's optional libpq binding — never installed (node-postgres runs pure-JS by
  // default), so keep esbuild from trying to resolve it.
  external: ["pg-native"],
  logLevel: "info",
});
