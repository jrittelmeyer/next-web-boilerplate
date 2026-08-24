#!/usr/bin/env node
/**
 * ai-dev-kit hook — skill-drift guard (PostToolUse: Edit|Write).
 *
 * Fires when a file under `.claude/skills/` or `.claude/hooks/` is edited
 * directly with a file tool. Installed copies are installer output — direct
 * edits get flagged by `install.mjs --check` and overwritten on the next
 * install. Injects a pointer to the kit source instead. Never blocks; the
 * installer itself writes via Node fs (not the Edit tool), so legitimate
 * installs never trigger this.
 */
import { readFileSync } from "node:fs";

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

if (!/(^|\/)\.claude\/(skills|hooks)\//.test(filePath)) process.exit(0);

const additionalContext =
  "ai-dev-kit skill-drift guard: a file under .claude/skills/ or .claude/hooks/ was just " +
  "edited directly. Installed copies are installer output — if this file is kit-managed, the " +
  "edit will be flagged by `install.mjs --check` and overwritten on the next install. Make " +
  "the change in a clone of the ai-dev-kit repo (skills/ or hooks/) and re-run the installer " +
  "instead. If the file is not in the kit manifest (a project-local skill), ignore this.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
  }),
);
