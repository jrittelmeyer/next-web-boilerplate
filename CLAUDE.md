# next-web-boilerplate — Claude Code

@AGENTS.md

Claude-Code-specific notes:

- Skill library: installed from
  [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) (versions:
  `.claude/ai-dev-kit.installed.json` · params: `.claude/ai-dev-kit.config.json` ·
  why-layer: the kit's `docs/PLAYBOOK.md`). Never edit `.claude/skills/` or
  `.claude/hooks/ai-dev-kit/` — edit a kit clone, then
  `node <clone>/install.mjs --adapter <clone>/adapters/next-web-boilerplate.json
  --dest <this repo> --global --hooks`; `install.mjs --check` guards drift.
- Run `/checkpoint` at each step boundary.
- `.claude/settings.json` (tracked) holds the shared permission allowlist;
  `settings.local.json` stays untracked/gitignored.
