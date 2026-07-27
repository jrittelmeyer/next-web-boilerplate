#!/usr/bin/env node
/**
 * Repo-owned hook — contrarian nudge (PreToolUse: ExitPlanMode).
 *
 * NOT ai-dev-kit output: hand-maintained, and deliberately OUTSIDE
 * `.claude/hooks/ai-dev-kit/` — the installer strips settings.json hook entries whose
 * command carries that path as a marker, so a handler placed there would have its
 * wiring deleted on the next `install.mjs --hooks`. Out here it survives untouched.
 * See CONVENTIONS.md → Agent tooling.
 *
 * Deliberately a POINTER, not a copy of the policy. CLAUDE.md is always loaded and is
 * the authority; restating its trigger list here would create a second source of truth
 * that drifts (it already had — the first draft omitted the template-surface trigger,
 * the one repo-specific rule the policy exists to add).
 *
 * Timing, honestly: a PreToolUse hook's `additionalContext` lands next to the TOOL
 * RESULT, so this fires after the plan is already on screen — and plans here are
 * usually files rather than `ExitPlanMode` calls. It is a next-turn safety net for the
 * revision loop, not the mechanism that gets contrarian run before sign-off. Never
 * blocks: context only, and the reader decides.
 */
import { readFileSync } from "node:fs";

// Guard on the payload rather than discarding it: the matcher is hand-maintained, so a
// broader one (or a malformed/empty stdin) must make this inert, never noisy. An
// advisory nudge has no business throwing at a plan gate.
let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
if (input?.tool_name !== "ExitPlanMode") process.exit(0);

const additionalContext =
  "contrarian nudge: a plan is going up for sign-off. Re-read the `contrarian` policy in " +
  "CLAUDE.md (Subagents) and apply it — it is the authority on when to run, and this hook " +
  "cannot restate it without drifting. In particular: template-surface changes are an " +
  "ALWAYS trigger, and so is a non-trivial plan that came together with no friction. If " +
  "contrarian already reviewed this plan, or the change is on the Skip list, proceed.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext },
  }),
);
