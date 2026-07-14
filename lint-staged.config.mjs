/**
 * lint-staged — runs on staged files only, invoked by .husky/pre-commit.
 *
 * Biome owns JS/TS/JSON(C)/CSS: it formats, lints, and sorts imports in one
 * pass. `--write` applies safe fixes and lint-staged re-stages them; an
 * unfixable lint error (e.g. an unused import — `error` in this repo) exits
 * non-zero and blocks the commit. `--no-errors-on-unmatched` keeps it quiet
 * when a staged path is ignored by biome.json.
 *
 * Markdown is intentionally excluded — Biome doesn't lint it; markdownlint
 * stays editor-only (see .markdownlint.jsonc).
 */
export default {
  "*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,jsonc,css}":
    "biome check --write --no-errors-on-unmatched",
};
