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
 * 6. Every scripts/init-app.mjs MENTION_PATCHES anchor still matches its target doc
 *    exactly once — that patcher is fail-soft by design, so a doc edit that breaks an
 *    anchor is invisible until it reaches a generated project.
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
// Both wiring forms are read: shell form (handler path inside the `command`
// string) and exec form (`command: "node"` + the path as an args entry, the
// form kit ≥0.11 installs) — exec-form entries used to be invisible here,
// which is how an installed-but-unwired kit handler slipped through.
const settingsHooks = existsSync(settingsPath)
  ? Object.entries(JSON.parse(readFileSync(settingsPath, "utf8")).hooks ?? {}).flatMap(
      ([event, entries]) =>
        (entries ?? []).flatMap((entry) =>
          (entry?.hooks ?? []).map((hook) => ({
            event,
            matcher: entry.matcher ?? "",
            command: String(hook?.command ?? ""),
            args: Array.isArray(hook?.args) ? hook.args.map(String) : [],
            if: hook?.if ?? "",
            timeout: hook?.timeout ?? null,
          })),
        ),
    )
  : [];
const wiringStrings = settingsHooks.map((h) => [h.command, ...h.args].join(" "));

for (const handler of handlers) {
  if (!wiringStrings.some((c) => c.includes(`.claude/hooks/${handler}`))) {
    failures.push(
      `.claude/hooks/${handler} is a repo-owned handler that nothing runs — either restore its wiring in .claude/settings.json, or delete the orphaned handler`,
    );
  }
}

for (const hook of settingsHooks) {
  const isExecForm = hook.args.length > 0;
  const haystack = [hook.command, ...hook.args].join(" ");
  const referenced = haystack.match(/\.claude\/hooks\/[\w./-]+\.mjs/)?.[0];
  if (!referenced) continue;
  if (!existsSync(join(root, referenced))) {
    failures.push(`.claude/settings.json runs "${referenced}" — no such file`);
  }
  // Hooks are spawned with the SESSION cwd, not the project root, so a repo-relative
  // handler path resolves against whatever subdirectory the session last cd'd into and
  // dies with MODULE_NOT_FOUND. That failure is invisible — only exit 2 blocks a hook,
  // these advise, and the existsSync check above passes either way — so it cost this repo
  // 14 silently-lost runs and a consumer 274 before anyone noticed. The correct anchor
  // differs by form: shell form needs braces AND quotes (bare $CLAUDE_PROJECT_DIR is
  // $null under the PowerShell hook shell; an unquoted path word-splits under bash when
  // the path has a space); exec form must be UNQUOTED — no shell strips the quotes, so
  // they'd be literal argv bytes.
  const anchored = isExecForm
    ? hook.args.some((a) => a === `\${CLAUDE_PROJECT_DIR}/${referenced}`)
    : hook.command.includes(`"\${CLAUDE_PROJECT_DIR}/${referenced}"`);
  if (!anchored) {
    failures.push(
      `.claude/settings.json runs "${referenced}" on a path relative to the session cwd — it will silently fail from any subdirectory. Shell form: node "\${CLAUDE_PROJECT_DIR}/${referenced}" (braced, double-quoted). Exec form: args ["\${CLAUDE_PROJECT_DIR}/${referenced}"] (unquoted). For ai-dev-kit/ handlers, fix hooks/installer-hooks.json in the kit and reinstall — an edit here is reverted by the next install.`,
    );
  }
}

// Kit-wiring parity: the entries carrying the .claude/hooks/ai-dev-kit/ marker must
// describe exactly what .claude/hooks/ai-dev-kit/hooks.json (the installer's shipped
// record of its own wiring) declares — same event/matcher/handler/if/timeout set.
// This is the check that would have caught compact-reorient sitting installed but
// unwired from 0.16.0 until the 2026-08-25 fleet audit found it by hand.
const kitMarker = ".claude/hooks/ai-dev-kit/";
const kitWiringPath = join(root, ".claude", "hooks", "ai-dev-kit", "hooks.json");
const kitWired = settingsHooks.filter((h) => [h.command, ...h.args].join(" ").includes(kitMarker));
if (existsSync(kitWiringPath) && (kitWired.length > 0 || existsSync(settingsPath))) {
  const shape = (event, matcher, path, ifClause, timeout) =>
    JSON.stringify([event, matcher, path.match(/([\w-]+\.mjs)$/)?.[1] ?? path, ifClause, timeout]);
  const want = Object.entries(JSON.parse(readFileSync(kitWiringPath, "utf8")).hooks ?? {})
    .flatMap(([event, entries]) =>
      (entries ?? []).flatMap((entry) =>
        (entry?.hooks ?? []).map((hook) =>
          shape(
            event,
            entry.matcher ?? "",
            String(hook?.args?.[0] ?? hook?.command ?? ""),
            hook?.if ?? "",
            hook?.timeout ?? null,
          ),
        ),
      ),
    )
    .sort();
  const got = kitWired
    .map((h) => shape(h.event, h.matcher, [h.command, ...h.args].join(" "), h.if, h.timeout))
    .sort();
  if (JSON.stringify(want) !== JSON.stringify(got)) {
    const missing = want.filter((w) => !got.includes(w));
    const extra = got.filter((g) => !want.includes(g));
    failures.push(
      `.claude/settings.json kit-hook wiring disagrees with .claude/hooks/ai-dev-kit/hooks.json` +
        (missing.length ? ` — missing: ${missing.join(", ")}` : "") +
        (extra.length ? ` — extra: ${extra.join(", ")}` : "") +
        `. Re-run the kit installer with --hooks rather than hand-editing.`,
    );
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

// 6. Every `MENTION_PATCHES` anchor in scripts/init-app.mjs must still match its target
//    doc, exactly once. init-app rewrites these passages by LITERAL string match when a
//    project is generated, and is deliberately fail-soft ("a passage that has drifted
//    simply no-ops") — so an anchor broken by an ordinary doc edit is invisible by
//    construction. Nothing else can see it: link-checking passes because in THIS repo the
//    target still exists; the breakage only surfaces in a generated project, where the
//    doc now points at a file `--slim` deleted. Costs one string compare per anchor.
//    A missing init-app.mjs is not a failure (a generated project may drop it), but a
//    PRESENT one that parses to ZERO anchors is — that means the array's shape changed
//    and this check went blind, which is the exact defect it exists to prevent.
const initApp = join(root, "scripts", "init-app.mjs");
if (existsSync(initApp)) {
  const src = readFileSync(initApp, "utf8");
  const start = src.indexOf("const MENTION_PATCHES");
  const block = start === -1 ? "" : src.slice(start, src.indexOf("\n];", start));
  const anchors = [...block.matchAll(/file:\s*"([^"]+)",\s*\n\s*from:\s*("(?:[^"\\]|\\.)*")/g)];

  if (anchors.length === 0) {
    failures.push(
      "scripts/init-app.mjs: could not parse any MENTION_PATCHES anchors — the array's shape changed and this check is no longer verifying anything. Update the parser in docs-sanity.mjs.",
    );
  }

  for (const [, target, rawFrom] of anchors) {
    let from;
    try {
      from = JSON.parse(rawFrom);
    } catch {
      failures.push(`scripts/init-app.mjs: unparseable MENTION_PATCHES \`from\` for ${target}`);
      continue;
    }
    const full = join(root, target);
    if (!existsSync(full)) {
      failures.push(`scripts/init-app.mjs patches ${target} — no such file`);
      continue;
    }
    const hits = readFileSync(full, "utf8").split(from).length - 1;
    if (hits !== 1) {
      failures.push(
        `scripts/init-app.mjs: its ${target} anchor matches ${hits} times (expected exactly 1) — ${
          hits === 0
            ? "an edit to that doc broke the anchor, so init-app will silently skip the rewrite and generated projects ship a stale pointer. Restore the phrase verbatim, or update the `from:` string in the same commit"
            : "the phrase is now ambiguous; make the anchor unique"
        }. Anchor: ${JSON.stringify(from.length > 60 ? `${from.slice(0, 60)}…` : from)}`,
      );
    }
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
