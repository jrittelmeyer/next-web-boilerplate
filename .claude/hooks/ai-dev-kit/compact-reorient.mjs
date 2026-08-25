#!/usr/bin/env node
/**
 * ai-dev-kit hook — compact-reorient (SessionStart, matcher: "compact").
 *
 * Fires when a session resumes from context compaction — the moment a session
 * is most likely to have lost its orientation (which backlog row, which plan
 * state, which findings were verified). Injects a one-shot reorientation
 * reminder. Deliberately NOT wired on "startup"/"resume"/"clear" — a
 * per-session nudge would be latency and noise; compaction is the one entry
 * point where disorientation is the default. Never blocks; the agent decides.
 */
import { existsSync, readFileSync } from "node:fs";
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

// The harness matcher scopes this to compaction re-entry; guard on the event
// name so a mis-wired matcher can't turn this into an every-event nudge.
if (input?.hook_event_name !== "SessionStart") process.exit(0);

// The SessionStart payload carries `source` (startup|resume|clear|compact|fork).
// Enforce the compact-only contract from the payload too, so a mis-wired matcher
// can't turn this into a per-session nudge. Deliberately a NEGATIVE guard: a
// payload with no `source` still fires, because the matcher remains the primary
// scope and a harness that omits the field must not silently kill the hook.
// `fork` is excluded on purpose — a forked session inherits its parent's context,
// so orientation is intact; compaction is the entry where it is not.
if (input.source !== undefined && input.source !== "compact") process.exit(0);

// Name the status/backlog docs only if they actually exist at the adapter's
// paths: a scaffold (e.g. a template's init --slim) can delete the docs while
// shipping .claude/ verbatim, and an advisory pointing at nonexistent files on
// every compaction, forever, is worse than a generic one.
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? ".";
const docTargets = [];
try {
  const cfg = JSON.parse(readFileSync(join(projectDir, ".claude/ai-dev-kit.config.json"), "utf8"));
  for (const [key, label] of [
    ["status", "status doc"],
    ["backlog", "backlog"],
  ]) {
    const rel = cfg?.docs?.[key];
    if (typeof rel === "string" && rel && existsSync(join(projectDir, rel))) {
      docTargets.push(`${label} (${rel})`);
    }
  }
} catch {
  /* no adapter config — keep the generic wording */
}
const reopen =
  docTargets.length > 0
    ? `re-open the project's ${docTargets.join(" and the current row in the ")}`
    : "re-open the project's status/backlog docs if it keeps them (adapter docs.status / docs.backlog)";

const additionalContext =
  `ai-dev-kit compact-reorient: this session just resumed from context compaction. Before ` +
  `continuing, ${reopen}, and treat carried findings as unverified unless the summary ` +
  "marks where they were verified — re-verify the assumed ones first. If mid-plan, restate " +
  "the plan-approval state before editing.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }),
);
