#!/usr/bin/env node
/**
 * harness-audit §1 inventory emitter — zero-dep, no network. Measures the
 * local surface (per-skill description/body sizes + references, wired hook
 * events) so a harness-audit run starts from numbers instead of hand-counts.
 * Report-only: never fails, never writes files.
 *
 * Usage: node .claude/skills/harness-audit/scripts/inventory.mjs [projectRoot]
 *        (run from the consumer's project root; projectRoot defaults to cwd)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? process.cwd();
const tokens = (s) => Math.ceil(s.length / 4);
const posix = (p) => p.replaceAll("\\", "/");

/** Minimal frontmatter reader: `---` fence, `key: value` scalars + `>-` folded blocks. */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fields: {}, body: text };
  const fields = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      fields[key] = kv[2] === ">-" || kv[2] === ">" ? "" : kv[2];
    } else if (key && /^\s+\S/.test(line)) {
      fields[key] = (fields[key] ? `${fields[key]} ` : "") + line.trim();
    }
  }
  return { fields, body: text.slice(m[0].length) };
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : [p];
  });

function findSkillsDir() {
  for (const candidate of [".claude/skills", "skills"]) {
    if (existsSync(join(root, candidate))) return candidate;
  }
  return null;
}

function skillRows(skillsDir) {
  const rows = [];
  const dirs = readdirSync(join(root, skillsDir), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of dirs) {
    const skillPath = join(root, skillsDir, name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const { fields, body } = parseFrontmatter(readFileSync(skillPath, "utf8"));
    const desc = fields.description ?? "";
    const files = walk(join(root, skillsDir, name)).filter((f) => !f.endsWith("SKILL.md"));
    const refs = files.map((f) => posix(relative(join(root, skillsDir, name), f)));
    rows.push({
      name,
      descChars: desc.length,
      descTok: tokens(desc),
      bodyTok: tokens(body),
      refs,
    });
  }
  return rows;
}

/** Wired hook events from a single hooks.json- or settings.json-shaped file
 * (both nest `{ hooks: { EventName: [{ matcher, hooks: [...] }] } }`). */
function hooksFromFile(path) {
  const rows = [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const wired = parsed.hooks ?? {};
  for (const [event, entries] of Object.entries(wired)) {
    for (const entry of entries) {
      for (const h of entry.hooks ?? []) {
        const handler =
          [h.command ?? "", ...(Array.isArray(h.args) ? h.args : [])]
            .join(" ")
            .match(/([\w-]+\.mjs)\b/)?.[1] ?? "?";
        rows.push({
          event,
          matcher: entry.matcher ?? "*",
          handler,
          type: h.type ?? "command",
          if: h.if ?? "",
          timeout: h.timeout ?? "",
          file: posix(relative(root, path)),
        });
      }
    }
  }
  return rows;
}

function findHookFiles() {
  const found = [];
  for (const candidate of [
    "hooks/hooks.json",
    "hooks/installer-hooks.json",
    ".claude/settings.json",
    ".claude/settings.local.json",
  ]) {
    if (existsSync(join(root, candidate))) found.push(join(root, candidate));
  }
  const installedDir = join(root, ".claude/hooks");
  if (existsSync(installedDir)) {
    for (const entry of readdirSync(installedDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = join(installedDir, entry.name, "hooks.json");
      if (existsSync(p)) found.push(p);
    }
  }
  return found;
}

function printSkillTable(rows) {
  console.log("## Skills\n");
  console.log("| skill | desc chars | desc ≈tok | body ≈tok | references/scripts |");
  console.log("|---|---:|---:|---:|---|");
  let totalDescTok = 0;
  for (const r of rows) {
    totalDescTok += r.descTok;
    console.log(`| ${r.name} | ${r.descChars} | ${r.descTok} | ${r.bodyTok} | ${r.refs.join(", ") || "—"} |`);
  }
  console.log(`\nAlways-loaded description budget: ≈${totalDescTok} tokens across ${rows.length} skills.`);
}

function printHookTable(hookFiles) {
  console.log("\n## Hooks\n");
  if (hookFiles.length === 0) {
    console.log("No hooks.json / installer-hooks.json / settings.json found under the given root.");
    return;
  }
  console.log("| event | matcher | handler | type | if | timeout | wiring file |");
  console.log("|---|---|---|---|---|---:|---|");
  const seen = new Set();
  for (const file of hookFiles) {
    for (const row of hooksFromFile(file)) {
      const key = `${row.event}|${row.matcher}|${row.handler}|${row.file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(
        `| ${row.event} | ${row.matcher} | ${row.handler} | ${row.type} | ${row.if || "—"} | ${row.timeout || "—"} | ${row.file} |`,
      );
    }
  }
}

const skillsDir = findSkillsDir();
if (!skillsDir) {
  console.error(`inventory: no .claude/skills or skills directory found under ${root}`);
  process.exit(1);
}
printSkillTable(skillRows(skillsDir));
printHookTable(findHookFiles());
