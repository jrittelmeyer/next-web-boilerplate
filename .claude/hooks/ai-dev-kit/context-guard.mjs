#!/usr/bin/env node
/**
 * ai-dev-kit hook — context-guard (PostToolUse: Edit|Write).
 *
 * Fires when a standing-instruction file (`AGENTS.md` / `CLAUDE.md` at any
 * depth — leaf files included) or an agent-context doc (the adapter's
 * `docs.contextDir`, default `docs/context`) is edited with a file tool.
 * Injects the standing-instruction-economy reminder: non-inferable content
 * only, stay within budget, keep the top of always-loaded files stable, and
 * land doc + code in the same commit. Never blocks; the agent decides.
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
if (!isInstructionFile && !isContextDoc) process.exit(0);

const additionalContext =
  "ai-dev-kit context-guard: a standing-instruction or agent-context file was just edited. " +
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
