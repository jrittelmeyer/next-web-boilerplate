# next-web-boilerplate — Claude Code

@AGENTS.md

The canonical agent onboarding (working agreements, stack, commands, monorepo map,
context-doc index) is [AGENTS.md](AGENTS.md), imported above. Claude-Code-specific
notes:

- **Skill library** ([ai-dev-kit/](ai-dev-kit/) — canonical source; installed to
  `.claude/skills/` by `node ai-dev-kit/install.mjs`): `checkpoint` (commit + push +
  cache-prune at step boundaries), `project-audit` (score the repo, seed a backlog),
  `doc-audit` (docs/context/memory/showcase accuracy + token-lean; dual-home —
  `--global` also installs it to `~/.claude/skills/`), `tidy` (machine hygiene),
  `dep-check` (registry-verify deps), `live-verify` (fresh prod build + drive the
  flow). Project params live in `.claude/ai-dev-kit.config.json`; edit skills in the
  kit and re-install — never edit `.claude/skills/` directly (`install.mjs --check`
  guards drift). Run `/checkpoint` at each step boundary.
- `.claude/settings.json` (tracked) holds the shared permission allowlist;
  `settings.local.json` stays untracked/gitignored.
