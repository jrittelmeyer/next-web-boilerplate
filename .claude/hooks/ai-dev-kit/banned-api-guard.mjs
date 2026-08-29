#!/usr/bin/env node
/**
 * ai-dev-kit hook — banned-api-guard (PostToolUse: Edit|Write). OPT-IN BLOCKING.
 *
 * Path-scoped banned-pattern tripwire: blocks listed regex patterns from
 * entering files under the adapter's `enforcement.bannedApis[].paths`.
 * Generalized from the danger-noodles/smash-gods determinism-guard (banned
 * nondeterministic APIs in `src/sim/**`) — the pattern applies to any
 * domain-law boundary: a pure core that must not import I/O, a sim that must
 * not read wall-clock time, a parser that must not touch globals. Pair it
 * with a lint rule for AST precision; this is the immediate, unskippable
 * tripwire at edit time.
 *
 * Inert by default: without `enforcement.bannedApis` in the user-owned adapter
 * config this handler exits 0 silently — blocking is the project's explicit,
 * recorded choice.
 *
 * Matching is line-based after comment stripping (block comments blanked
 * preserving line numbers, `//` tails removed) — a banned name in a comment
 * never fires; a banned name in a string still does (accepted tradeoff, same
 * as the consumer originals).
 *
 * A rule whose `pattern` doesn't compile as a RegExp is skipped (not the
 * whole guard) and named once on stderr per matching invocation — silent
 * skip would make a broken blocking rule look like a clean pass forever.
 * `install.mjs --check` also flags a non-compiling pattern in the installed
 * config as an advisory, and rejects one pre-write via `--adapter`.
 */
import { readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

let input = null;
try {
  let raw = readFileSync(0, "utf8");
  // PowerShell 5.1 pipes BOM-prefix stdin — strip it, or a live event dies
  // into the malformed-input exit below and the guard silently no-ops.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const filePath = String(input?.tool_input?.file_path ?? "");
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? ".";

let groups = null;
try {
  const cfg = JSON.parse(readFileSync(join(projectDir, ".claude/ai-dev-kit.config.json"), "utf8"));
  groups = cfg?.enforcement?.bannedApis;
} catch {
  process.exit(0); // no adapter config — enforcement is opt-in, stay inert
}
if (!Array.isArray(groups) || groups.length === 0) process.exit(0);

const abs = resolve(projectDir, filePath);
const underPrefix = (prefix) => {
  const p = resolve(projectDir, prefix);
  return abs === p || abs.startsWith(p + sep);
};

let content = null;
let stripped = null;
const violations = [];
const brokenPatterns = [];
let hit = null;

for (const group of groups) {
  const exts = Array.isArray(group?.extensions) && group.extensions.length > 0
    ? group.extensions
    : [".ts", ".tsx", ".js", ".mjs"];
  if (!exts.includes(extname(abs))) continue;
  if (!(Array.isArray(group?.paths) && group.paths.some(underPrefix))) continue;
  if (Array.isArray(group?.excludePaths) && group.excludePaths.some(underPrefix)) continue;

  if (content === null) {
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      process.exit(0); // deleted/unreadable — nothing to guard
    }
    // Strip comments while preserving line numbers (block comments → spaces).
    stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""));
  }

  for (const rule of group?.rules ?? []) {
    let re;
    try {
      re = new RegExp(rule.pattern);
    } catch (e) {
      // Invalid pattern in user config — skip the rule, not the guard, but
      // note it once so a broken blocking rule doesn't read as "nothing to
      // report" (it would otherwise be silently inert forever).
      brokenPatterns.push(
        `  ${group?.name ?? "(unnamed group)"}: pattern "${rule.pattern}" — ${e.message}`,
      );
      continue;
    }
    stripped.forEach((line, i) => {
      if (re.test(line)) {
        violations.push(`  line ${i + 1}: ${rule.why}\n    > ${line.trim()}`);
      }
    });
  }
  if (violations.length > 0) {
    hit = group;
    break;
  }
}

if (brokenPatterns.length > 0) {
  console.error(
    `ai-dev-kit banned-api-guard: ${brokenPatterns.length} non-compiling pattern(s) in ` +
      `enforcement.bannedApis — these rule(s) are inert, not blocking:\n${brokenPatterns.join("\n")}`,
  );
}

if (violations.length > 0) {
  const name = hit?.name ? ` "${hit.name}"` : "";
  const docs = hit?.docs ? ` (${hit.docs})` : "";
  console.error(
    `ai-dev-kit banned-api-guard: ${filePath} violates the${name} rules${docs} ` +
      `(adapter enforcement.bannedApis):\n${violations.join("\n")}\n` +
      "Fix the violation — do not weaken the guard config to pass.",
  );
  process.exit(2);
}
process.exit(0);
