# ai-dev-kit changelog

## 0.2.0 — 2026-07-17

Step 2: automation hooks. All hooks **advise, never block** — they inject context;
the agent decides.

- `hooks/` — three cross-platform Node handlers, installed to
  `.claude/hooks/ai-dev-kit/` (drift-guarded like skills):
  - `dep-check-nudge.mjs` (PostToolUse: Edit|Write|Bash) — fires on package.json
    edits and package-manager add/update/install-with-args commands.
  - `live-verify-reminder.mjs` (PreToolUse: Bash, `if: "Bash(git *)"`) — fires
    before any `git commit` (compound commands included).
  - `skill-drift-guard.mjs` (PostToolUse: Edit|Write) — fires on direct edits to
    `.claude/skills/` or `.claude/hooks/` (installer output; edit the kit instead).
- `hooks/hooks.json` — the settings snippet; `install.mjs --hooks` merges it
  idempotently into `.claude/settings.json`, replacing only kit-owned entries
  (identified by the handler-path marker).
- Reviewed and deliberately NOT hook-automated: a Stop-hook checkpoint nag and a
  tidy/cache hook (standing cadence + husky pre-push already cover them; a nag
  would be noise).

## 0.1.0 — 2026-07-17

Initial extraction from next-web-boilerplate.

- Skills: `checkpoint`, `doc-audit` (dual-home), `project-audit`, `tidy` — generalized
  from the repo-specific originals (behavior preserved; mechanical params moved to the
  adapter config). New: `dep-check`, `live-verify`.
- Cross-platform installer (`install.mjs`): copy, `--check` drift guard, `--global`
  dual-home sync, `--adapter` config install. Pure Node fs, no symlinks, idempotent.
- Adapter contract: `adapters/project.schema.json`; reference adapter for
  next-web-boilerplate.
- Not yet: automation hooks (Step 2), playbook + pitch deck (Step 3).
