#!/usr/bin/env node
/**
 * ai-dev-kit hook — live-verify reminder (PreToolUse: Bash, if: "Bash(git *)").
 *
 * Fires when a `git commit` is about to run (including compound commands like
 * `git add … && git commit …`). Injects a reminder to confirm the live-verify
 * loop ran for product-source changes. Never blocks — it emits context only;
 * the agent reading it decides (docs/tests-only commits are exempt by design).
 */
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = String(input.tool_input?.command ?? "");

// Match `git … commit` within one command segment (not across | & ;), so
// `git log | grep commit` doesn't fire but `git -c x=y commit` and the commit
// segment of a compound command do.
if (!/\bgit\b[^|&;]*\bcommit\b/.test(command)) process.exit(0);

const additionalContext =
  "ai-dev-kit live-verify: a git commit is about to run. If it includes product source (not " +
  "docs/tests/config-only), confirm the live-verify loop happened for the change: full gate " +
  "(lint · type-check · build) plus driving the affected flow against a fresh prod build and " +
  "observing real output. If that already happened this session, or the commit is " +
  "docs/config-only, proceed.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext },
  }),
);
