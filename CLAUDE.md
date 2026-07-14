# next-web-boilerplate — Claude Code

@AGENTS.md

The canonical agent onboarding (working agreements, stack, commands, monorepo map,
context-doc index) is [AGENTS.md](AGENTS.md), imported above. Claude-Code-specific
notes:

- **Committed skills** (`.claude/skills/`): `checkpoint` (commit + push + cache-prune
  at step boundaries), `project-audit` (score the repo, seed a backlog), `tidy`
  (local machine hygiene). Run `/checkpoint` at each step boundary.
- `.claude/settings.json` (tracked) holds the shared permission allowlist;
  `settings.local.json` stays untracked/gitignored.
