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
 * 4. Repo-owned Claude Code hook handlers (.claude/hooks/*.mjs) and their
 *    .claude/settings.json wiring must agree in both directions — nothing imports
 *    them, so a lost wiring silently disarms a hook with every other gate green.
 *    An ABSENT settings.json is not a failure (a generated project may decline this
 *    template's config); an orphaned handler is.
 * 5. Subagents in .claude/agents/ and the policy in CLAUDE.md must reference each
 *    other. Existence only — actual registration is surface-dependent and not
 *    observable from CI (see CONVENTIONS.md → Agent tooling).
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
const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
const commandsSection = agents.split(/^## Commands$/m)[1]?.split(/^## /m)[0] ?? "";
for (const match of commandsSection.matchAll(/`pnpm ([a-z][\w:.-]*)`/g)) {
  if (!(match[1] in scripts)) {
    failures.push(`AGENTS.md Commands names "pnpm ${match[1]}" — not in package.json scripts`);
  }
}

// 4. Every repo-owned Claude Code hook handler (.claude/hooks/*.mjs, top level — the
//    ai-dev-kit/ subdirectory is installer-managed) must be wired to a command in
//    .claude/settings.json, and every .claude/hooks command must resolve to a real file.
//    Nothing imports these handlers, so a lost or mistyped wiring disarms the hook while
//    every other gate stays green. Catches both real failure modes: a bad hand-merge of
//    settings.json, and relocating a handler under `.claude/hooks/ai-dev-kit/` (where the
//    installer would strip its entry). See CONVENTIONS.md → Agent tooling.
// A missing settings.json is NOT a failure on its own: a generated project may
// legitimately decline this template's allowlist, or drop `.claude/` wholesale. What is
// never valid is a repo-owned handler with nothing to run it, so the check is an XOR and
// its message names BOTH exits — a template must not assert its own config is the only
// valid one (this runs in downstream CI too).
const settingsPath = join(root, ".claude", "settings.json");
const hooksDir = join(root, ".claude", "hooks");
const handlers = existsSync(hooksDir)
  ? readdirSync(hooksDir).filter((f) => f.endsWith(".mjs"))
  : [];
const commands = existsSync(settingsPath)
  ? Object.values(JSON.parse(readFileSync(settingsPath, "utf8")).hooks ?? {})
      .flat()
      .flatMap((entry) => entry?.hooks ?? [])
      .map((hook) => String(hook?.command ?? ""))
  : [];

for (const handler of handlers) {
  if (!commands.some((c) => c.includes(`.claude/hooks/${handler}`))) {
    failures.push(
      `.claude/hooks/${handler} is a repo-owned handler that nothing runs — either restore its wiring in .claude/settings.json, or delete the orphaned handler`,
    );
  }
}

for (const command of commands) {
  const referenced = command.match(/\.claude\/hooks\/[\w./-]+\.mjs/)?.[0];
  if (referenced && !existsSync(join(root, referenced))) {
    failures.push(`.claude/settings.json runs "${referenced}" — no such file`);
  }
}

// 5. Every subagent CLAUDE.md mandates must exist, and vice versa. Deliberately an
//    EXISTENCE check, not a frontmatter-shape one: whether a well-formed agent actually
//    REGISTERS is surface-dependent and only observable by running the CLI (see
//    CONVENTIONS.md → Agent tooling), so a shape validator would pass green in exactly
//    the world where invocation is broken. A dangling reference is what this can catch.
const agentsDir = join(root, ".claude", "agents");
const agentNames = existsSync(agentsDir)
  ? readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        file: f,
        name: readFileSync(join(agentsDir, f), "utf8").match(/^name:\s*(\S+)/m)?.[1],
      }))
  : [];

for (const { file, name } of agentNames) {
  if (!name) {
    failures.push(`.claude/agents/${file} has no \`name:\` frontmatter — it cannot register`);
  } else if (!claudeMd.includes(`\`${name}\``)) {
    failures.push(
      `.claude/agents/${file} defines "${name}" but CLAUDE.md never references it — an agent no policy invokes is dead weight`,
    );
  }
}

// Unanchored on purpose: the phrase sits mid-sentence in CLAUDE.md, and a `^`-anchored
// pattern matched nothing — the check passed while the agent file was deleted.
for (const mandated of claudeMd.matchAll(/`([a-z][a-z0-9-]*)` is standing-authorized/g)) {
  if (!agentNames.some((a) => a.name === mandated[1])) {
    failures.push(
      `CLAUDE.md says \`${mandated[1]}\` is standing-authorized but no .claude/agents/*.md defines it`,
    );
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
