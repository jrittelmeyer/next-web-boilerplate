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

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = String(input.tool_input?.file_path ?? "").replaceAll("\\", "/");
if (!filePath) process.exit(0);

let contextDir = "docs/context";
try {
  const cfg = JSON.parse(readFileSync(".claude/ai-dev-kit.config.json", "utf8"));
  if (cfg?.docs?.contextDir) {
    contextDir = String(cfg.docs.contextDir).replaceAll("\\", "/").replace(/\/+$/, "");
  }
} catch {
  /* no adapter config — keep the default */
}

const isInstructionFile = /(^|\/)(AGENTS|CLAUDE)\.md$/.test(filePath);
const isContextDoc = filePath.includes(`${contextDir}/`);
const isMemoryFile = /\/\.claude\/projects\/[^/]+\/memory\/[^/]+\.md$/.test(filePath);
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
