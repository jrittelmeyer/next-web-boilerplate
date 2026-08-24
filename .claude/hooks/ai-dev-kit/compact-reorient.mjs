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

// The harness matcher scopes this to compaction re-entry; guard on the event
// name so a mis-wired matcher can't turn this into an every-event nudge.
if (input?.hook_event_name !== "SessionStart") process.exit(0);

const additionalContext =
  "ai-dev-kit compact-reorient: this session just resumed from context compaction. Before " +
  "continuing, re-open the project's status doc and the current backlog row (adapter " +
  "docs.status / docs.backlog), and treat carried findings as unverified unless the summary " +
  "marks where they were verified — re-verify the assumed ones first. If mid-plan, restate " +
  "the plan-approval state before editing.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }),
);
