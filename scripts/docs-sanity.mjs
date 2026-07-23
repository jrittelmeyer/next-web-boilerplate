#!/usr/bin/env node
/**
 * Docs sanity — deterministic doc↔repo consistency checks (CI verify lane).
 *
 * 1. Every relative markdown link in AGENTS.md, CLAUDE.md, and docs/** (archive
 *    excluded — frozen history may legitimately reference removed files) must
 *    resolve to an existing file or directory. Anchors are stripped; external,
 *    mailto, and in-page links are skipped.
 * 2. Every `pnpm <script>` named in AGENTS.md's "## Commands" section must exist
 *    in root package.json scripts — a stale command sends an agent confidently
 *    down a wrong path.
 * 3. Warn-only: AGENTS.md above its ~150-line standing-instruction budget emits
 *    a GitHub warning annotation; it never fails the build (a heuristic, not
 *    physics).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];

function mdFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "archive") continue;
      out.push(...mdFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const leafDirs = ["apps", "packages", "tooling"].flatMap((d) => {
  const base = join(root, d);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((entry) => join(base, entry, "AGENTS.md"))
    .filter((f) => existsSync(f));
});

const files = [
  join(root, "AGENTS.md"),
  join(root, "CLAUDE.md"),
  ...leafDirs,
  ...mdFiles(join(root, "docs")),
].filter((f) => existsSync(f));

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(LINK)) {
    const target = match[1];
    if (/^(https?:|mailto:|#|data:)/.test(target)) continue;
    const path = target.split("#")[0];
    if (path === "") continue;
    if (!existsSync(resolve(dirname(file), decodeURI(path)))) {
      failures.push(`${file.slice(root.length + 1)}: broken link → ${target}`);
    }
  }
}

const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
const commandsSection = agents.split(/^## Commands$/m)[1]?.split(/^## /m)[0] ?? "";
for (const match of commandsSection.matchAll(/`pnpm ([a-z][\w:.-]*)`/g)) {
  if (!(match[1] in scripts)) {
    failures.push(`AGENTS.md Commands names "pnpm ${match[1]}" — not in package.json scripts`);
  }
}

const lineCount = agents.split("\n").length;
if (lineCount > 150) {
  console.log(
    `::warning file=AGENTS.md::AGENTS.md is ${lineCount} lines — above the ~150-line standing-instruction budget (warn-only; see docs-sanity.mjs).`,
  );
}

if (failures.length > 0) {
  console.error(`docs-sanity: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `docs-sanity: ${files.length} markdown files link-checked, AGENTS.md commands verified, ${lineCount}/150 lines.`,
);
