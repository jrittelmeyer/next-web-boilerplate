#!/usr/bin/env node
/**
 * ai-dev-kit hook — dep-check nudge (PostToolUse: Edit|Write|Bash).
 *
 * Fires when the dependency surface changes: a package.json edit, or a
 * package-manager add/install/update command. Injects a reminder to run the
 * dep-check skill. Silent (exit 0, no output) for everything else — this hook
 * advises, it never blocks.
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
const tool = input?.tool_name ?? "";
const filePath = String(input?.tool_input?.file_path ?? "").replaceAll("\\", "/");
const command = String(input?.tool_input?.command ?? "");

const editsManifest =
  (tool === "Edit" || tool === "Write") && /(^|\/)package\.json$/.test(filePath);

// `<pm> … add|update|upgrade|up`, or `<pm> … install|i <name>` with a real package
// argument (a bare `pnpm install` is a routine lockfile install — no nudge).
const addsViaCli =
  tool === "Bash" &&
  (/\b(pnpm|npm|yarn|bun)\b(?:\s+\S+)*?\s+(add|update|upgrade|up)\b/.test(command) ||
    /\b(pnpm|npm|yarn|bun)\b(?:\s+\S+)*?\s+(install|i)\s+(?:-\S+\s+)*[^-\s]/.test(command));

if (!editsManifest && !addsViaCli) process.exit(0);

const additionalContext =
  "ai-dev-kit dep-check: the dependency surface just changed (package.json edit or " +
  "package-manager install). Before relying on any added/bumped package, run the dep-check " +
  "skill: registry-verify the real version + dist-tags, apply the release-age window, choose " +
  "the pin per policy, check peers/deprecation, and respect standing holds recorded in project " +
  "memory/docs. Skip if this exact change was already dep-check'd this session.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
  }),
);
