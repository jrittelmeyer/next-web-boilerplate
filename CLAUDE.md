# next-web-boilerplate — Claude Code

@AGENTS.md

Claude-Code-specific notes:

- Skill library: installed from
  [ai-dev-kit](https://github.com/jrittelmeyer/ai-dev-kit) (versions:
  `.claude/ai-dev-kit.installed.json` · params: `.claude/ai-dev-kit.config.json` ·
  why-layer: the kit's `docs/PLAYBOOK.md`). Never edit `.claude/skills/` or
  `.claude/hooks/ai-dev-kit/` — edit a kit clone, then
  `node <clone>/install.mjs --adapter <clone>/adapters/next-web-boilerplate.json
  --dest <this repo> --global`; `install.mjs --check` guards drift. **`--hooks` is
  deliberately omitted** — the wiring is already current, and re-adding it would wire a
  hook whose text points at files `init-app --slim` deletes; installer-route only (no
  marketplace plugin). Both: [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
- Run `/checkpoint` at each step boundary. `.claude/hooks/checkpoint-autorun.mjs`
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
  - **If `contrarian` is not in the subagent registry, it is the surface, not the
    file.** Fall back to `claude --agent contrarian -p "<prompt>"`, which reads
    `.claude/agents/` directly. Reloading does *not* fix it. Detail:
    [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
  - `.claude/hooks/contrarian-nudge.mjs` fires on `ExitPlanMode`, but a `PreToolUse`
    hook's context lands *next to the tool result* — after the plan is on screen —
    and plans here are usually files, not `ExitPlanMode` calls. It is a **next-turn
    safety net; this policy is the mechanism.** Wiring and kit-boundary rules:
    [CONVENTIONS.md → Agent tooling](docs/context/CONVENTIONS.md#agent-tooling-claude).
