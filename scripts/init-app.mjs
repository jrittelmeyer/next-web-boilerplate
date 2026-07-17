#!/usr/bin/env node
/**
 * init-app — one-shot scaffolding helper for adopters of this template.
 *
 * Cross-platform (pure Node, no shell builtins) and idempotent. The env-seed and
 * rename steps are purely additive; the slim step removes files, so it only ever
 * runs with your consent (an interactive y/N, or an explicit flag).
 *
 *   node scripts/init-app.mjs [--name <app-name>] [--slim | --keep-template-docs]
 *
 *   • seeds .env from .env.example (skips if .env already exists)
 *   • with --name, renames the root package + README title to your app
 *   • offers to remove the TEMPLATE's own history/marketing docs (they describe
 *     next-web-boilerplate's build journey, not your app): docs/PROJECT_STATUS.md,
 *     docs/BACKLOG.md, docs/archive/, docs/plain-english-guide/,
 *     .github/FUNDING.yml + the README "Support this project" section; resets
 *     CHANGELOG.md to an empty skeleton. Kept: FEATURES, GETTING_STARTED,
 *     VERIFICATION, MAINTENANCE, docs/context/ — those document YOUR app's
 *     foundation. Interactive runs ask; non-interactive runs skip unless --slim.
 *   • prints the remaining setup checklist
 *
 * Run it after `npx degit jrittelmeyer/next-web-boilerplate my-app` (or after
 * using the GitHub "Use this template" button + clone). See README → "Use this
 * template".
 */
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const root = resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const args = { name: undefined, help: false, slim: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--name") args.name = argv[++i];
    else if (arg.startsWith("--name=")) args.name = arg.slice("--name=".length);
    else if (arg === "--slim") args.slim = true;
    else if (arg === "--keep-template-docs") args.slim = false;
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/init-app.mjs [--name <app-name>] [--slim | --keep-template-docs]

  --name <app-name>      Rename the root package + README title (lowercase, npm-safe).
  --slim                 Remove the template's own history/marketing docs without asking.
  --keep-template-docs   Keep them without asking.
  -h, --help             Show this help.

  With neither slim flag, interactive runs ask; non-interactive runs keep the docs
  and say how to slim later. Idempotent — safe to re-run anytime.`);
}

/** Seed .env from .env.example, leaving an existing .env untouched. */
function seedEnv() {
  const example = resolve(root, ".env.example");
  const target = resolve(root, ".env");
  if (!existsSync(example)) {
    console.log("• .env.example not found — skipping env seed.");
    return;
  }
  if (existsSync(target)) {
    console.log("• .env already exists — left untouched.");
    return;
  }
  copyFileSync(example, target);
  console.log("• Created .env from .env.example — fill in DATABASE_URL + BETTER_AUTH_SECRET.");
}

/** Rename the root package.json + README H1 to the adopter's app name. */
function rename(name) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    console.log(`• Skipping rename — "${name}" is not a valid npm package name.`);
    return;
  }

  const pkgPath = resolve(root, "package.json");
  // Strip a leading UTF-8 BOM (0xFEFF) — some Windows editors add one, and JSON.parse chokes on it.
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  const previous = pkg.name;
  pkg.name = name;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`• Renamed root package "${previous}" → "${name}".`);

  const readmePath = resolve(root, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    const next = readme.replace(/^# .*$/m, `# ${name}`);
    if (next !== readme) {
      writeFileSync(readmePath, next);
      console.log("• Updated README title.");
    }
  }
}

// ── Slim: remove the template's own history/marketing docs ────────────────────

/** The journey/marketing set — describes next-web-boilerplate itself, not the derived app. */
const SLIM_REMOVALS = [
  "docs/PROJECT_STATUS.md",
  "docs/BACKLOG.md",
  "docs/archive",
  "docs/plain-english-guide",
  ".github/FUNDING.yml",
];

/** Remove one markdown section: from its `## heading` line up to the next `## `. */
function dropSection(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return { lines, dropped: false };
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end === -1) end = lines.length;
  return { lines: [...lines.slice(0, start), ...lines.slice(end)], dropped: true };
}

/** Replace a contiguous `>`-blockquote starting at the first line matching `startsWith`. */
function replaceBlockquote(lines, startsWith, replacement) {
  const start = lines.findIndex((l) => l.startsWith(startsWith));
  if (start === -1) return { lines, replaced: false };
  let end = start;
  while (end < lines.length && (lines[end].startsWith(">") || lines[end].trim() === "")) {
    if (lines[end].trim() === "" && end > start) break;
    end++;
  }
  return { lines: [...lines.slice(0, start), ...replacement, ...lines.slice(end)], replaced: true };
}

function patchReadme() {
  const path = resolve(root, "README.md");
  if (!existsSync(path)) return;
  const original = readFileSync(path, "utf8");
  // The Layout tree names the removed status doc — rewrite that annotation first,
  // so the row-filter below can't delete the tree line itself.
  let lines = original
    .replace("— PROJECT_STATUS + on-demand context docs", "— on-demand context docs + guides")
    .split("\n");

  // Drop the doc-table rows that point at removed files.
  lines = lines.filter(
    (l) => !l.includes("docs/plain-english-guide/") && !l.includes("docs/PROJECT_STATUS.md"),
  );
  const support = dropSection(lines, "## Support this project");
  lines = support.lines;

  const next = lines.join("\n");
  if (next !== original) {
    writeFileSync(path, next);
    console.log(
      `  • README: dropped the template-doc rows${support.dropped ? " + the Support section" : ""}.`,
    );
  }
}

function patchDocsReadme() {
  const path = resolve(root, "docs/README.md");
  if (!existsSync(path)) return;
  const original = readFileSync(path, "utf8");
  let lines = original
    .split("\n")
    .filter(
      (l) =>
        !l.includes("[PROJECT_STATUS.md](PROJECT_STATUS.md)") &&
        !l.includes("[BACKLOG.md](BACKLOG.md)") &&
        !l.includes("plain-english-guide"),
    );
  lines = dropSection(lines, "## History — `archive/`").lines;

  const next = lines.join("\n");
  if (next !== original) {
    writeFileSync(path, next);
    console.log("  • docs/README.md: dropped the removed-doc rows + the History section.");
  }
}

function patchAgentsMd() {
  const path = resolve(root, "AGENTS.md");
  if (!existsSync(path)) return;
  const original = readFileSync(path, "utf8");
  let lines = original.split("\n");

  const status = replaceBlockquote(lines, "> **Status:**", [
    "> **Status:** derived from the",
    "> [next-web-boilerplate](https://github.com/jrittelmeyer/next-web-boilerplate)",
    "> template (its own history/marketing docs were removed by `init-app`). Every",
    "> integration shipped verified — re-prove them in this app with",
    "> [docs/VERIFICATION.md](docs/VERIFICATION.md). New work goes plan → sign-off →",
    "> build.",
  ]);
  lines = status.lines;

  lines = replaceBlockquote(lines, "> Historical detail", [
    "> Human-first guides: [docs/FEATURES.md](docs/FEATURES.md) (what's included &",
    "> why) · [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) (template usage).",
  ]).lines;

  // The "keep docs current" agreement names the deleted status file.
  const idx = lines.findIndex((l) =>
    l.includes("Update `docs/PROJECT_STATUS.md` (state) and the relevant"),
  );
  if (idx !== -1) {
    lines[idx] = lines[idx].replace(
      "Update `docs/PROJECT_STATUS.md` (state) and the relevant",
      "Update the relevant",
    );
  }

  // Compare content, not "did a matcher fire" — the replacement status quote also
  // starts with "> **Status:**", so a re-run always matches but changes nothing.
  const next = lines.join("\n");
  if (next !== original) {
    writeFileSync(path, next);
    console.log("  • AGENTS.md: neutralized the template-status blockquotes.");
  }
}

function resetChangelog() {
  const path = resolve(root, "CHANGELOG.md");
  if (!existsSync(path)) return;
  const current = readFileSync(path, "utf8");
  const skeleton = `# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
`;
  if (current === skeleton) return;
  writeFileSync(path, skeleton);
  console.log("  • Reset CHANGELOG.md to an empty skeleton (the PR template references it).");
}

/** Report leftover mentions of removed docs — harmless historical pointers, listed for later tidying. */
function reportDanglingReferences() {
  const needle = /docs\/archive|archive\/|PROJECT_STATUS|BACKLOG\.md|plain-english-guide/;
  const targets = [];
  const docsDir = resolve(root, "docs");
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) targets.push(full);
    }
  };
  if (existsSync(docsDir)) walk(docsDir);
  for (const f of ["README.md", "AGENTS.md", "CLAUDE.md"]) {
    const full = resolve(root, f);
    if (existsSync(full)) targets.push(full);
  }

  const hits = [];
  for (const file of targets) {
    const count = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => needle.test(l)).length;
    if (count > 0) hits.push(`${relative(root, file).replaceAll("\\", "/")} (${count})`);
  }
  if (hits.length > 0) {
    console.log(
      `  Leftover historical mentions — dead links are harmless; tidy when you next touch:\n    ${hits.join("\n    ")}`,
    );
  }
}

function slim() {
  console.log("\nSlim: removing the template's own history/marketing docs…");
  for (const rel of SLIM_REMOVALS) {
    const full = resolve(root, rel);
    if (!existsSync(full)) continue;
    rmSync(full, { recursive: true, force: true });
    console.log(`  • removed ${rel}`);
  }
  resetChangelog();
  patchReadme();
  patchDocsReadme();
  patchAgentsMd();
  reportDanglingReferences();
}

/** Decide whether to slim: explicit flag wins; otherwise ask when interactive, skip when not. */
async function resolveSlim(flag) {
  if (flag !== undefined) return flag;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(
      "• Keeping the template's history/marketing docs (non-interactive run — pass --slim to remove them; see docs/GETTING_STARTED.md).",
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "\nRemove the template's own history/marketing docs (PROJECT_STATUS, BACKLOG,\ndocs/archive, plain-english guide, funding link; resets CHANGELOG)?\nThey describe next-web-boilerplate's build journey, not your app. [y/N] ",
  );
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.log("Initializing your app from next-web-boilerplate…\n");
  seedEnv();
  if (args.name) rename(args.name);
  if (await resolveSlim(args.slim)) slim();

  console.log(`
Next steps:
  1. Edit .env             — set DATABASE_URL + BETTER_AUTH_SECRET (others are optional)
  2. docker compose -f docker/docker-compose.yml up -d   — start Postgres
  3. pnpm install
  4. pnpm --filter @repo/db db:migrate
  5. pnpm dev              — http://localhost:3000

If you cloned with git history, start fresh: remove .git and run \`git init\`.
(\`npx degit\` already gives you a history-less copy.)

Full rename checklist (containers, CI names, fly.toml, landing H1):
  docs/GETTING_STARTED.md → "Make it yours"`);
}

await main();
