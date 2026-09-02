# next-web-boilerplate — Claude Code

@AGENTS.md

Claude-Code-specific notes:

- Skill library: installed from
  [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) (versions:
  `.claude/ai-dev-kit.installed.json` · params: `.claude/ai-dev-kit.config.json`).
  Never edit `.claude/skills/` or `.claude/hooks/ai-dev-kit/` — edit a kit clone, then
  install **from a tag, never from the clone's working tree**:
  `git -C <clone> worktree add <wt> v<X.Y.Z>` then
  `node <wt>/install.mjs --adapter <clone>/adapters/next-web-boilerplate.json
  --dest <this repo> --global --hooks`; `install.mjs --check` guards drift.
  The tag rule is load-bearing — the installer's kit root is wherever `install.mjs`
  itself lives (`install.mjs:36`), so a worktree diffs against the tag and leaves the
  clone alone. Full rationale: [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
  Installer-route only (no marketplace plugin); enforcement hooks stay unconfigured
  here (template surface): [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
- **Seven skills are `disable-model-invocation`** (`checkpoint` · `harness-audit` ·
  `project-adopt` · `project-audit` · `project-init` · `retro` · `tidy`, since kit
  0.23.13): the Skill tool refuses them, so invoke one by **reading
  `.claude/skills/<name>/SKILL.md`** and following it — the flag does not affect
  `Read`. `/<name>` remains the user form. `doc-audit`, `dep-check` and `live-verify`
  are unflagged and invoke normally.
- Run `/checkpoint` at each step boundary (or read
  `.claude/skills/checkpoint/SKILL.md` — see the flag above).
  `.claude/hooks/checkpoint-autorun.mjs`
  (Stop hook) automates this: if the tree is dirty/unpushed when a session goes idle,
  it forces one more turn that runs `checkpoint` fully autonomously (commit, push,
  watch CI, prune cache, write the resume-prompt handoff) — no confirmation prompt,
  per the standing authorization in
  [DECISIONS.md → checkpoint-autorun](docs/context/DECISIONS.md#tooling--dx). Guarded
  to fire only in this repo (checks root `package.json`'s name — `.claude/**` is
  template surface and this consent doesn't travel to generated projects), and skips
  when the last message looks like a pending question or a rebase/merge/cherry-pick
  is in progress.
- `.claude/settings.json` (tracked) holds the shared permission allowlist **and all hook
  wiring — whose `hooks` key is co-owned**, so fix a kit handler's entry upstream, not
  here ([CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude));
  `settings.local.json` stays untracked/gitignored.
- **Subagents** live in `.claude/agents/` (repo-owned and tracked — *not*
  kit-managed; edit them directly). `contrarian` is standing-authorized: invoke it
  without asking, fold its findings into the plan **before** presenting that plan
  for sign-off, and show the findings **with their disposition** — raised, folded,
  overruled — not just its one-line verdict. A pre-smoothed plan plus "Sound with
  caveats" hides exactly what the reader needed to see.
  - **Always** for: schema/migrations · auth/RBAC · a new package or a
    package-boundary crossing · non-patch dependency adds · and any edit to the
    **template surface**, defined as a path set rather than a vibe:
    `scripts/init-app.mjs` · `.claude/**` · `.github/workflows/**` · `knip.jsonc` ·
    `pnpm-workspace.yaml` · `tooling/**` · root configs · `AGENTS.md`/`CLAUDE.md` ·
    `docs/context/CONVENTIONS.md` § Agent tooling. Those ship verbatim into every
    generated project, where a wrong call costs a migration to undo. The
    `CONVENTIONS.md` entry is deliberate: the load-bearing kit-boundary rules live
    there, not here, so without it a rule whose breakage deletes hook wiring would
    sit on the Skip list as "a doc edit".
  - **Also** when a plan comes together with no friction on a non-trivial step —
    frictionless consensus is the trigger, not a reason to skip.
  - **Skip** for: copy/doc/i18n edits, mechanical refactors, test-only changes,
    and anything already merged (post-hoc dissent is noise). **On a collision,
    Always wins** — a doc edit *to a template-surface path* still qualifies.
    Code-level defects are `/code-review`'s job, not `contrarian`'s.
  - Hand it the plan's **file path** plus primary sources, never your own summary:
    anchoring a second instance of the same model on the proposer's framing is what
    turns dissent into agreement. Require at least one finding it verified itself,
    and hand over the plan **before** its outcome log exists — a resolved plan is
    the strongest anchor there is.
  - Registry-fallback (`claude --agent contrarian -p`) lives in
    [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude);
    the nudge-hook timing caveat lives in its own header comment,
    `.claude/hooks/contrarian-nudge.mjs`.
