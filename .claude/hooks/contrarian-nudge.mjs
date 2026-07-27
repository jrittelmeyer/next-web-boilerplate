#!/usr/bin/env node
/**
 * Repo-owned hook — contrarian nudge (PreToolUse: ExitPlanMode).
 *
 * NOT ai-dev-kit output: this file is hand-maintained and lives outside
 * `.claude/hooks/ai-dev-kit/` on purpose, so `install.mjs --check` never reads
 * it as kit drift. Edit it here directly.
 *
 * Fires the moment a plan is about to be presented for sign-off — the one point
 * where dissent is still cheap. Injects a reminder to run the `contrarian`
 * subagent and fold its findings in BEFORE the founder reads the plan. Never
 * blocks: it emits context only, and the agent reading it decides (low-stakes
 * and copy/doc/test-only plans are exempt by design).
 */
import { readFileSync } from "node:fs";

JSON.parse(readFileSync(0, "utf8"));

const additionalContext =
  "contrarian nudge: a plan is about to go up for sign-off. If it touches schema, auth/RBAC, a " +
  "package boundary, a new package, or a non-patch dependency add — or if it simply came " +
  "together without friction — run the `contrarian` subagent now and fold its findings into the " +
  "plan, presenting its verdict alongside so the reader sees the dissent and not only the " +
  "conclusion. Dissent after sign-off is noise. If contrarian already reviewed this plan, or the " +
  "change is copy/doc/i18n, a mechanical refactor, or test-only, proceed.";

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext },
  }),
);
