#!/usr/bin/env node
/**
 * Repo-owned hook — checkpoint autorun (Stop).
 *
 * NOT ai-dev-kit output: hand-maintained, and deliberately OUTSIDE
 * `.claude/hooks/ai-dev-kit/` — the installer strips settings.json hook entries whose
 * command carries that path as a marker, so a handler placed there would have its
 * wiring deleted on the next `install.mjs --hooks`. Out here it survives untouched.
 * See CONVENTIONS.md → Agent tooling.
 *
 * Purpose: every time the assistant goes idle with pending work in this repo, force one
 * more turn that runs the `checkpoint` skill fully autonomously — commit, push, watch
 * CI, prune the build cache, and always leave a resume-prompt.md handoff plus a launch
 * (model x effort) recommendation printed to the user. This hook does none of that work
 * itself: git actions benefit from the in-session model's judgment (commit message
 * quality, resume-prompt authorship needs real conversation context a stdin→stdout
 * script never has). It only decides WHETHER to ask for one more turn, via the
 * documented Stop-hook block mechanism.
 *
 * The autonomous-push authorization this hook invokes is a recorded, dated decision,
 * not something asserted here for the first time — see
 * docs/context/DECISIONS.md → "checkpoint-autorun standing push authorization".
 *
 * REPO-IDENTITY GUARD: `.claude/**` is template surface (ships verbatim to every
 * project scaffolded from this repo — see CONVENTIONS.md; `scripts/init-app.mjs`
 * never touches `.claude/`). The autonomous-push authorization behind this hook was
 * granted for THIS repo only. Without a same-repo check, a generated project would
 * silently inherit a hook that commits and pushes a stranger's dirty tree the first
 * time their session goes idle, with no consent ever given. Gate on the root
 * `package.json` name so a renamed/forked/generated project is inert by default.
 *
 * Loop safety — two independent, layered guards:
 *   1. `stop_hook_active` on stdin — confirmed as a real Claude Code Stop-hook field
 *      (Agent SDK `StopHookInput.stop_hook_active: boolean`), set true on the Stop
 *      event that follows a hook-forced turn. Claude Code also has its own backstop
 *      (auto-overrides a Stop hook after 8 consecutive blocks with no progress), so
 *      this is defense-in-depth, not the only thing standing between this hook and
 *      an infinite loop.
 *   2. A short-TTL lock file this hook writes right before blocking, fully
 *      self-contained (doesn't depend on the harness honoring guard #1). A stale
 *      lock (older than LOCK_TTL_MS) is ignored, so a genuinely-still-dirty repo can
 *      still trigger a fresh checkpoint later.
 *
 * Trigger-scope guards (avoid hijacking an in-flight human-in-the-loop exchange or a
 * delicate git operation):
 *   - Skip if the assistant's last message reads like it's waiting on the user
 *     (ends in `?`) — git-dirty state alone doesn't mean the turn is "done", it can
 *     just as easily mean "paused mid-task to ask something".
 *   - Skip if a rebase/merge/cherry-pick is in progress (`.git/rebase-merge`,
 *     `.git/rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`) — a dirty tree there
 *     means something other than "ordinary uncommitted work ready to checkpoint".
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to cover one checkpoint run
const EXPECTED_REPO_NAME = "next-web-boilerplate";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function isSameRepo(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return pkg?.name === EXPECTED_REPO_NAME;
  } catch {
    return false; // no readable root package.json — can't confirm identity, stay inert
  }
}

function looksLikePendingQuestion(input) {
  const msg = input?.last_assistant_message;
  return typeof msg === "string" && msg.trim().endsWith("?");
}

function gitOperationInProgress(root) {
  return (
    existsSync(join(root, ".git", "rebase-merge")) ||
    existsSync(join(root, ".git", "rebase-apply")) ||
    existsSync(join(root, ".git", "MERGE_HEAD")) ||
    existsSync(join(root, ".git", "CHERRY_PICK_HEAD"))
  );
}

function git(root, args) {
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

function hasPendingWork(root) {
  const status = git(root, ["status", "--short"]);
  if (status && status.trim().length > 0) return true;

  // No upstream configured (detached, fresh branch, etc.) — nothing to compare, so this
  // check is inert rather than a false trigger.
  const upstream = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream) return false;

  const unpushed = git(root, ["log", "@{u}..HEAD", "--oneline"]);
  return Boolean(unpushed && unpushed.trim().length > 0);
}

function lockPath(root) {
  return join(root, ".claude", ".checkpoint-hook-active");
}

function lockIsFresh(root) {
  const p = lockPath(root);
  if (!existsSync(p)) return false;
  try {
    const ageMs = Date.now() - statSync(p).mtimeMs;
    if (ageMs < LOCK_TTL_MS) return true;
    unlinkSync(p); // stale — clear it so a real still-dirty repo can retrigger
    return false;
  } catch {
    return false;
  }
}

function writeLock(root) {
  try {
    mkdirSync(dirname(lockPath(root)), { recursive: true });
    writeFileSync(lockPath(root), String(Date.now()));
  } catch (err) {
    // best-effort — the stop_hook_active guard still covers the common case, but
    // leave a trace so a future debugging session isn't left guessing why the
    // double-guard silently degraded to a single one.
    console.error(`checkpoint-autorun: failed to write loop-guard lock: ${err.message}`);
  }
}

const input = readStdin();
if (input?.stop_hook_active === true) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR;
if (!root) process.exit(0); // can't safely locate the repo — stay silent, not noisy
if (!isSameRepo(root)) process.exit(0); // not next-web-boilerplate itself — inert by design
if (looksLikePendingQuestion(input)) process.exit(0);
if (gitOperationInProgress(root)) process.exit(0);

if (lockIsFresh(root)) process.exit(0);
if (!hasPendingWork(root)) process.exit(0);

writeLock(root);

const reason = [
  "Autonomous checkpoint trigger: this repo has uncommitted changes and/or unpushed",
  "commits, and the session just went idle. Read .claude/skills/checkpoint/SKILL.md",
  "and follow it now, fully — ai-dev-kit 0.23.13 marked that skill",
  "`disable-model-invocation`, so the Skill tool refuses it and a plain Read is the",
  "way in (the frontmatter flag does not affect Read). Act on it",
  "autonomously — do NOT ask for confirmation before committing or pushing; that",
  "authorization is standing for this hook's scope (checkpoint's own git actions),",
  'recorded in docs/context/DECISIONS.md → "checkpoint-autorun standing push',
  'authorization". Everything else (destructive ops, force-push, anything outside',
  "checkpoint's normal scope) still follows the repo's normal safety rules.",
  "",
  "Follow that SKILL.md exactly: commit pending work with a conventional-style",
  "message matching this repo's `git log` style (use `git commit -F <file>`, no",
  "`Co-Authored-By` trailers per this repo's commit-message conventions), push, watch",
  "CI to green and confirm with `gh run view <id> --json status,conclusion`, run the",
  "adapter's `cache.prune` command, then ALWAYS finish by writing/overwriting the",
  "resume-prompt.md handoff memory file (orientation, next item + its sign-off status,",
  "carried findings with file:line, verification expectations, close-the-loop",
  "checklist) plus a launch recommendation (model x effort) as its last line — then",
  "print that same resume prompt and launch line back to the user so they know exactly",
  "what to do next without opening the file.",
].join(" ");

console.log(
  JSON.stringify({
    decision: "block",
    reason,
  }),
);
