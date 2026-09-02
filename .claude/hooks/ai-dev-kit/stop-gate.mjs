#!/usr/bin/env node
/**
 * ai-dev-kit hook — stop-gate (Stop). OPT-IN, ASYNC REWAKE.
 *
 * The session should not end with the project's fast gate failing, but the
 * turn itself is not held open for it: this hook is wired with
 * `asyncRewake: true`, so the turn ends immediately and the gate runs in the
 * background. It runs the adapter's `enforcement.stopGate.commands` in order;
 * any failure exits 2, and the harness wakes the agent one turn later with
 * this process's stderr as a system reminder, so the fix lands next turn
 * rather than mid-turn. Generalized from the danger-noodles/smash-gods/wyrd
 * stop-gate hooks (consumer-proven before upstreaming).
 *
 * Inert by default: without `enforcement.stopGate.commands` in the user-owned
 * adapter config this handler exits 0 silently — the kit's advise-only default
 * is unchanged; gating is the project's explicit, recorded choice. Keep the
 * commands fast (a typecheck + unit-test pair) — this runs at every session
 * end.
 *
 * Loop safety: `stop_hook_active` on stdin marks the Stop event that follows a
 * hook-forced turn — exit 0 there, or a persistently red gate re-wakes forever.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let input = {};
try {
  let raw = readFileSync(0, "utf8");
  // PowerShell 5.1 pipes BOM-prefix stdin — strip it, or the loop guard below
  // is silently skipped and a red gate blocks forever.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  input = JSON.parse(raw);
} catch {
  /* tolerate missing/malformed stdin — the gate itself still applies */
}
if (input?.stop_hook_active === true) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? ".";

let gate = null;
try {
  const cfg = JSON.parse(readFileSync(join(projectDir, ".claude/ai-dev-kit.config.json"), "utf8"));
  gate = cfg?.enforcement?.stopGate;
} catch {
  process.exit(0); // no adapter config — enforcement is opt-in, stay inert
}
const commands = Array.isArray(gate?.commands) ? gate.commands.filter(Boolean) : [];
if (commands.length === 0) process.exit(0);
const timeoutMs =
  (Number.isInteger(gate?.timeoutSeconds) && gate.timeoutSeconds > 0 ? gate.timeoutSeconds : 150) *
  1000;

const tail = (s, n = 3000) => (s.length > n ? `…${s.slice(-n)}` : s);

for (const cmd of commands) {
  try {
    execSync(cmd, { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
  } catch (err) {
    const out = tail(`${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim());
    console.error(
      `ai-dev-kit stop-gate: \`${cmd}\` failing — fix before finishing ` +
        `(adapter enforcement.stopGate).\n${out}`,
    );
    process.exit(2);
  }
}
process.exit(0);
