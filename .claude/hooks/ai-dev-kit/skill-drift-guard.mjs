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

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = String(input.tool_input?.file_path ?? "").replaceAll("\\", "/");

if (!/(^|\/)\.claude\/(skills|hooks)\//.test(filePath)) process.exit(0);

const additionalContext =
  "ai-dev-kit skill-drift guard: a file under .claude/skills/ or .claude/hooks/ was just " +
  "edited directly. Installed copies are installer output — if this file is kit-managed, the " +
  "edit will be flagged by `node ai-dev-kit/install.mjs --check` and overwritten on the next " +
  "install. Make the change in ai-dev-kit/ (skills/ or hooks/) and re-run the installer " +
  "instead. If the file is not in the kit manifest (a project-local skill), ignore this.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
  }),
);
