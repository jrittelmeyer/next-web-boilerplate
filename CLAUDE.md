# next-web-boilerplate — Claude Code

@AGENTS.md

The canonical agent onboarding (working agreements, stack, commands, monorepo map,
context-doc index) is [AGENTS.md](AGENTS.md), imported above. Claude-Code-specific
notes:

- **Skill library** (canonical source: the standalone
  [ai-dev-kit repo](https://github.com/jrittelmeyer/ai-dev-kit) — extracted
  2026-07-18 at kit 0.5.0; this repo keeps only the installed output): `checkpoint`
  (commit + push + cache-prune at step boundaries), `project-audit` (score the
  repo, seed a backlog), `doc-audit` (docs/context/memory/showcase accuracy +
  token-lean; dual-home — `--global` also installs it to `~/.claude/skills/`),
  `tidy` (machine hygiene), `dep-check` (registry-verify deps), `live-verify`
  (fresh prod build + drive the flow), `project-init` (one-time inception:
  idea/plan docs → discovery → product brief + plan-to-100 backlog). Project
  params live in `.claude/ai-dev-kit.config.json`; kit hooks (advise-never-block:
  dep-check nudge, live-verify reminder, skill-drift guard) are merged into
  `.claude/settings.json` and run from `.claude/hooks/ai-dev-kit/`. To change a
  skill/hook: edit a clone of the kit repo and re-install —
  `node <clone>/install.mjs --adapter <clone>/adapters/next-web-boilerplate.json
  --dest <this repo> --global --hooks`; never edit the installed copies
  (`install.mjs --check --dest <this repo>` guards drift). The why-layer
  techniques live in the kit's docs/PLAYBOOK.md. Run `/checkpoint` at each step
  boundary.
- `.claude/settings.json` (tracked) holds the shared permission allowlist;
  `settings.local.json` stays untracked/gitignored.
