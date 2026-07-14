#!/usr/bin/env node
/**
 * init-app — one-shot scaffolding helper for adopters of this template.
 *
 * Cross-platform (pure Node, no shell builtins), idempotent, and purely
 * additive: it does nothing you can't do by hand, so ignoring it costs nothing.
 *
 *   node scripts/init-app.mjs [--name <app-name>]
 *
 *   • seeds .env from .env.example (skips if .env already exists)
 *   • with --name, renames the root package + README title to your app
 *   • prints the remaining setup checklist
 *
 * Run it after `npx degit jrittelmeyer/next-web-boilerplate my-app` (or after
 * using the GitHub "Use this template" button + clone). See README → "Use this
 * template".
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const args = { name: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--name") args.name = argv[++i];
    else if (arg.startsWith("--name=")) args.name = arg.slice("--name=".length);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/init-app.mjs [--name <app-name>]

  --name <app-name>   Rename the root package + README title (lowercase, npm-safe).
  -h, --help          Show this help.`);
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.log("Initializing your app from next-web-boilerplate…\n");
  seedEnv();
  if (args.name) rename(args.name);

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

main();
