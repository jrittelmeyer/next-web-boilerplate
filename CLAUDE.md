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
- **Subagents** live in `.claude/agents/` (repo-owned, tracked — *not*
  kit-managed, so edit them directly). `contrarian` is standing-authorized:
  invoke it without asking, and fold its findings into the plan **before**
  presenting that plan for sign-off — never after. Present its verdict alongside
  the plan so the reader sees the dissent, not just the conclusion.
  - **Always** for: schema/migrations · auth/RBAC · a new package or a
    package-boundary crossing · non-patch dependency adds · and anything that
    changes the **template surface** — a scaffold default, an `init-app`
    behavior, a shipped convention — because a wrong call here is inherited by
    every project generated from this repo and costs a migration to undo.
  - **Also** when a plan comes together with no friction on a non-trivial step —
    frictionless consensus is the trigger, not a reason to skip.
  - **Skip** for: copy/doc/i18n edits, mechanical refactors, test-only changes,
    and anything already merged (post-hoc dissent is noise). Code-level defects
    are `/code-review`'s job, not `contrarian`'s.
  - `.claude/hooks/contrarian-nudge.mjs` (repo-owned, outside `hooks/ai-dev-kit/`
    so `--check` won't read it as drift) fires this reminder on `ExitPlanMode`.
    It cannot see a plan presented by writing a file, so the policy above — not
    the hook — is the authority.
  - **Its wiring is fragile:** `.claude/settings.json` is installer output, so
    the `ExitPlanMode` entry is overwritten by the next `install.mjs --hooks`.
    After any kit install, re-add it (the `.mjs` survives; only the wiring is
    lost) — or fold the agent + hook into the kit so it installs itself.
