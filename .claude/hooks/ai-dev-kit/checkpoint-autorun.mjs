#!/usr/bin/env node
/**
 * ai-dev-kit hook — checkpoint-autorun (Stop). OPT-IN.
 *
 * When the session goes idle with pending work (dirty tree and/or unpushed
 * commits), force one more turn that runs the `checkpoint` skill fully
 * autonomously. The hook does none of the git work itself — commit-message
 * quality and resume-prompt authorship need real conversation context a
 * stdin→stdout script never has. It only decides WHETHER to ask for one more
 * turn, via the documented Stop-hook block mechanism. Ported from
 * next-web-boilerplate's consumer-proven checkpoint-autorun.
 *
 * Inert by default: fires only when the user-owned adapter config sets
 * `enforcement.checkpointAutorun: true`. Setting that flag IS the standing
 * authorization for checkpoint's own autonomous commit+push in this repo —
 * a scaffold/template must not ship it pre-set (the consent is per-project;
 * see SECURITY.md). Everything outside checkpoint's normal scope
 * (destructive ops, force-push) still follows the project's safety rules.
 *
 * Loop safety — two independent layered guards:
 *   1. `stop_hook_active` on stdin (set on the Stop event after a hook-forced
 *      turn); the harness's own consecutive-block backstop sits behind it.
 *   2. A short-TTL lock file written right before blocking — self-contained,
 *      doesn't depend on the harness honoring guard 1. A stale lock is
 *      cleared so a genuinely-still-dirty repo can retrigger later.
 *
 * Trigger-scope guards: skip when the last assistant message reads like a
 * pending question (dirty tree ≠ done — it can mean "paused to ask"), and
 * skip mid rebase/merge/cherry-pick (a dirty tree there means something other
 * than ordinary uncommitted work).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const LOCK_TTL_MS = 10 * 60 * 1000; // long enough to cover one checkpoint run

let input = {};
try {
  let raw = readFileSync(0, "utf8");
  // PowerShell 5.1 pipes BOM-prefix stdin — strip it, or the loop guard below
  // is silently skipped.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  input = JSON.parse(raw);
} catch {
  /* tolerate missing/malformed stdin */
}
if (input?.stop_hook_active === true) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR;
if (!root) process.exit(0); // can't safely locate the repo — stay silent

let enabled = false;
try {
  const cfg = JSON.parse(readFileSync(join(root, ".claude/ai-dev-kit.config.json"), "utf8"));
  enabled = cfg?.enforcement?.checkpointAutorun === true;
} catch {
  /* no adapter config — stay inert */
}
if (!enabled) process.exit(0);

const lastMsg = input?.last_assistant_message;
if (typeof lastMsg === "string" && lastMsg.trim().endsWith("?")) process.exit(0);

if (
  existsSync(join(root, ".git", "rebase-merge")) ||
  existsSync(join(root, ".git", "rebase-apply")) ||
  existsSync(join(root, ".git", "MERGE_HEAD")) ||
  existsSync(join(root, ".git", "CHERRY_PICK_HEAD"))
) {
  process.exit(0);
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function hasPendingWork() {
  const status = git(["status", "--short"]);
  if (status && status.trim().length > 0) return true;
  // No upstream (detached, fresh branch) — nothing to compare, stay inert.
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream) return false;
  const unpushed = git(["log", "@{u}..HEAD", "--oneline"]);
  return Boolean(unpushed && unpushed.trim().length > 0);
}

const lockPath = join(root, ".claude", ".checkpoint-hook-active");
if (existsSync(lockPath)) {
  try {
    if (Date.now() - statSync(lockPath).mtimeMs < LOCK_TTL_MS) process.exit(0);
    unlinkSync(lockPath); // stale — clear so a real still-dirty repo can retrigger
  } catch {
    /* unreadable lock — fall through; guard 1 still covers the loop case */
  }
}

if (!hasPendingWork()) process.exit(0);

try {
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, String(Date.now()));
} catch (err) {
  // best-effort — stop_hook_active still covers the common case; leave a trace
  // so a debugging session isn't left guessing why the double-guard degraded.
  console.error(`ai-dev-kit checkpoint-autorun: failed to write loop-guard lock: ${err.message}`);
}

const reason = [
  "Autonomous checkpoint trigger: this repo has uncommitted changes and/or unpushed",
  "commits, and the session just went idle. Run the `checkpoint` skill now, fully",
  "autonomously — do NOT ask for confirmation before committing or pushing; that",
  "authorization is standing for this hook's scope (checkpoint's own git actions),",
  "recorded as the adapter's `enforcement.checkpointAutorun` opt-in. Everything else",
  "(destructive ops, force-push, anything outside checkpoint's normal scope) still",
  "follows this project's normal safety rules.",
  "",
  "Follow the checkpoint skill exactly: commit pending work in this repo's commit",
  "style (adapter `commit`), push, watch CI to green where the adapter names a",
  "workflow, run the adapter's `cache.prune` if set, then ALWAYS finish by writing",
  "the resume-prompt handoff (orientation, next item + sign-off status, carried",
  "findings with file:line, verification expectations) plus a launch recommendation",
  "(model × effort) as its last line — and print that same resume prompt and launch",
  "line back to the user.",
].join(" ");

console.log(JSON.stringify({ decision: "block", reason }));
