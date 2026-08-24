#!/usr/bin/env node
/**
 * ai-dev-kit hook — context-guard (PostToolUse: Edit|Write).
 *
 * Fires when a standing-instruction file (`AGENTS.md` / `CLAUDE.md` at any
 * depth — leaf files included), an agent-context doc (the adapter's
 * `docs.contextDir`, default `docs/context`), or an agent-memory file
 * (`~/.claude/projects/<slug>/memory/*.md`, the MEMORY.md index included) is
 * edited with a file tool. Injects the matching economy reminder: standing
 * instructions stay non-inferable, cache-stable, and within budget; memory
 * stays within its index/file budgets and defers history to the repo's
 * living docs. Never blocks; the agent decides.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let input = null;
try {
  let raw = readFileSync(0, "utf8");
  // PowerShell 5.1 pipes BOM-prefix stdin — strip it, or a live event dies
  // into the malformed-input exit below as a false "silent".
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  input = JSON.parse(raw);
} catch {
  process.exit(0); // malformed harness event — advise-only, exit silently
}
const filePath = String(input?.tool_input?.file_path ?? "").replaceAll("\\", "/");
if (!filePath) process.exit(0);

// Hooks spawn with the *session* cwd (any subdirectory the session cd'd into);
// the harness exports the project root as CLAUDE_PROJECT_DIR. The adapter config
// must resolve against the root, or a custom contextDir is silently lost.
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? ".";

let contextDir = "docs/context";
try {
  const cfg = JSON.parse(readFileSync(join(projectDir, ".claude/ai-dev-kit.config.json"), "utf8"));
  if (cfg?.docs?.contextDir) {
    contextDir = String(cfg.docs.contextDir).replaceAll("\\", "/").replace(/\/+$/, "");
  }
} catch {
  /* no adapter config — keep the default */
}

// Segment-boundary + case-insensitive matching: an unanchored substring would let
// `mydocs/context/` hit a `docs/context` contextDir, and case-insensitive
// filesystems (Windows/macOS) make `Claude.md` the same file as `CLAUDE.md`.
// Advise-only, so the rare case-sensitive-Linux false positive costs one
// harmless reminder; the false negative would silently skip the guard.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isInstructionFile = /(^|\/)(AGENTS|CLAUDE)\.md$/i.test(filePath);
const isContextDoc = new RegExp(`(^|/)${escapeRe(contextDir)}/`, "i").test(filePath);
const isMemoryFile = /\/\.claude\/projects\/[^/]+\/memory\/[^/]+\.md$/i.test(filePath);
if (!isInstructionFile && !isContextDoc && !isMemoryFile) process.exit(0);

const additionalContext = isMemoryFile
  ? "ai-dev-kit context-guard: an agent-memory file was just edited. Keep the index " +
    "(MEMORY.md) a one-line-per-memory pointer list within budget (adapter contextBudget; " +
    "defaults ~700 tokens, ~120-char hooks) — never memory content; keep each memory file " +
    "within ~1,500 tokens. Record shipped work as one clause on an existing line, not a " +
    "new block — the repo (status doc, git log) owns history; memory keeps only what the " +
    "next session can't infer from the repo."
  : "ai-dev-kit context-guard: a standing-instruction or agent-context file was just edited. " +
    "Keep it non-inferable-only (the repo already says the rest); keep always-loaded files " +
    "(AGENTS.md/CLAUDE.md) within budget (adapter contextBudget; default ~150 lines) with a " +
    "stable top — volatile status, dates, and scores belong in the status doc, not the " +
    "prompt-cache prefix. If this edit tracks a code or behavior change, land doc + code in " +
    "the same commit.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
  }),
);
