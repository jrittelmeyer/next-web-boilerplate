# ai-dev-kit

A portable, versioned library of agentic-development skills — the working method
distilled from building next-web-boilerplate, packaged so any project can adopt it.
Skill bodies are **generic**; everything project-specific lives in one small adapter
config. Designed to be extracted into its own repo later and imported wherever it's
needed.

**Version:** see [VERSION](VERSION) · **History:** [CHANGELOG.md](CHANGELOG.md) ·
**Machine-readable index:** [manifest.json](manifest.json) ·
**Why-layer:** [docs/PLAYBOOK.md](docs/PLAYBOOK.md) ·
**Catalog/pitch deck:** [docs/pitch-deck.html](docs/pitch-deck.html)

## What's inside

| Skill | Job | Typical trigger |
| --- | --- | --- |
| `checkpoint` | Commit + push, context-health verdict, continue or hand off with a resume prompt | every step boundary |
| `doc-audit` | Keep docs / agent context / memory / showcase docs accurate + token-lean | periodic maintenance |
| `project-audit` | Score the repo /100 per feature group; emit a prioritized backlog | "how good is this really?" |
| `tidy` | Prune the unbounded build cache; surface judgment-required machine cleanups | checkpoint boundary / low disk |
| `dep-check` | Registry-verify version, release age, and pin policy before any dependency change | adding/upgrading a dependency |
| `live-verify` | Fresh prod build + drive the real flow — behavioral proof before commit | before committing product changes |

The intended lifecycle (machine-readable in `manifest.json` → `pipeline`):

```text
orient → plan-gate → [dep-check] → build → live-verify
      → code-review / simplify → checkpoint (→ tidy)
      → periodic: doc-audit · project-audit
```

`code-review`, `simplify`, and `verify` are Claude Code built-ins the kit composes
with rather than reimplements.

## Install into a project

```bash
node ai-dev-kit/install.mjs --adapter ai-dev-kit/adapters/<your-project>.json --global --hooks
```

- Copies `skills/*` → `<project>/.claude/skills/` (byte-identical) and hook handlers
  (`hooks/*.mjs`) → `.claude/hooks/ai-dev-kit/`.
- `--global` also installs dual-home skills (`doc-audit`) → `~/.claude/skills/`.
- `--adapter <file>` validates the adapter JSON and writes it verbatim to
  `.claude/ai-dev-kit.config.json`.
- `--hooks` merges `hooks/hooks.json` into `.claude/settings.json` — only entries
  whose command carries the `.claude/hooks/ai-dev-kit/` marker are ever replaced;
  every other setting is preserved. Omit it to wire hooks manually.
- `--dest <path>` targets a different project root (default: cwd).
- Writes `.claude/ai-dev-kit.installed.json` (kit + skill versions, no timestamp).
  Idempotent — a second run writes nothing.
- Skills in `.claude/skills/` that the manifest doesn't list are left untouched.

Drift guard:

```bash
node ai-dev-kit/install.mjs --check   # exit 1 + file list if installed copies differ
```

## The adapter contract

Skills read `.claude/ai-dev-kit.config.json` at run time for project parameters —
package manager, gate commands, prod-verify port, cache commands, doc paths, commit
style, hygiene targets, dependency policy. Schema:
[adapters/project.schema.json](adapters/project.schema.json) · reference example:
[adapters/next-web-boilerplate.json](adapters/next-web-boilerplate.json).

Every field is optional — a skill missing a field derives it from the repo (and says
so) rather than failing. After install the config belongs to the project: edit it
freely (`--check` doesn't police it).

## Automation (hooks)

Three Claude Code hooks make the lifecycle self-reinforcing. **All of them advise,
never block** — they inject a reminder into the agent's context; the agent decides.

| Handler | Event · matcher | Fires on |
| --- | --- | --- |
| `dep-check-nudge.mjs` | PostToolUse · `Edit\|Write\|Bash` | package.json edits; pm `add`/`update`/install-with-args |
| `live-verify-reminder.mjs` | PreToolUse · `Bash` (`if: "Bash(git *)"`) | any command segment containing `git … commit` |
| `skill-drift-guard.mjs` | PostToolUse · `Edit\|Write` | direct file-tool edits under `.claude/skills\|hooks/` |

Handlers are pure-Node stdin→stdout scripts (no jq/bash dependency — Windows-safe),
installed to `.claude/hooks/ai-dev-kit/` and drift-guarded by `--check` like skills.
Reviewed and deliberately **not** automated: a Stop-hook checkpoint nag and a
tidy/cache hook — existing cadence (standing agreement, husky pre-push) covers both,
and a nag would be noise. Hooks changed in `settings.json` load at session start;
an already-running session may need `/hooks` opened once (or a restart) to pick
them up.

## Rules

- **Edit skills in the kit, then reinstall.** Never edit `.claude/skills/` directly —
  `--check` exists to catch exactly that.
- **Keep skill bodies generic.** Project facts go in the adapter (mechanical params)
  or the project's agent memory (recipes/gotchas) — never hardcoded in a skill.
- **Versioning:** semver per skill plus a kit version; bump `manifest.json`, `VERSION`,
  and `CHANGELOG.md` together with any behavior change.

## Roadmap

- ~~Step 2 — automation~~ **shipped in 0.2.0** (see Automation above).
- ~~Step 3 — playbook + deck~~ **shipped in 0.3.0**
  ([PLAYBOOK.md](docs/PLAYBOOK.md) · [pitch-deck.html](docs/pitch-deck.html)).
- **Later:** extract to a standalone repo; consume here (and elsewhere) via install.
