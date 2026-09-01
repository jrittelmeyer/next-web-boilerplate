# Harness audit — 2026-08-31

First consumer-side run of the `harness-audit` skill in this repo (the skill's own
earlier runs audited the kit repo; see the delta section). Subject: this repo's
agent harness at **ai-dev-kit 0.23.11** (installed 2026-08-29) under **Claude Code
2.1.251**, head `3e68733`. Depth: **full pass** — inventory script, every
`sources.md` row re-fetched plus four consumer-relevant harness pages, a dated
category sweep, the kit's mechanical linter + eval runner, a **sampled with/without
graded pass** (two scenarios, four fresh read-only runs), and the judgment diff.
Network: available — the report is **not PARTIAL**.

Delta bound: `git diff 46c570c..3e68733` on the harness surface (kit 0.18.0 install on
2026-08-23 → today): 23 files — kit 0.18.0 → 0.23.1 (`--hooks` adopted, the
enforcement trio wired inert, `compact-reorient` doc-existence fix) → 0.23.11;
`docs-sanity` kit-wiring parity + exec-form reading; knip entries for kit scripts;
Biome excludes for installer-owned paths; the 2026-08-24 adoption memo (harness-audit
cadence line in MAINTENANCE, `skillDescriptionMaxTokens: 909`); `renovate.yml`. No
prior `HARNESS_AUDIT_*` report exists here, so the scores below are the baseline.

## Method & sources

Every `sources.md` row fetched 2026-08-31 (the installed copy carries 9 rows; the kit
clone's pending copy carries 11 — all 11 fetched), plus four pages this repo's surface
depends on that the kit-generic list doesn't pin:

| Source | Fetched | Result |
| --- | --- | --- |
| Skill authoring best practices (platform.claude.com) | full | rubric unchanged: third-person what+when descriptions · `name` ≤64 chars · `description` ≤1,024 chars · body <500 lines · references one level deep, TOC past 100 lines · ≥3 evals, tested on every model tier · scripts solve-don't-defer · no Windows paths · no time-sensitive text |
| Claude Code skills reference (code.claude.com/docs/en/skills) | full | commands merged into skills; ≈20 frontmatter fields; **`disable-model-invocation: true` ⇒ description not in context and the skill is absent from Claude's Skill tool** (user-only); `allowed-tools` is honored in every session and is *not* gated by workspace trust; `skillOverrides` (`on` · `name-only` · `user-invocable-only` · `off`); `${CLAUDE_SKILL_DIR}`; `claude plugin validate .claude/skills` (v2.1.233+); a rendered SKILL.md persists across turns, its `allowed-tools` grant does not |
| agentskills.io evaluating-skills | full | with/without loop is the reference method (`evals/evals.json`, `with_skill/` vs `without_skill/`, `grading.json`, `benchmark.json` `delta`); "remove or replace assertions that always pass in both configurations" |
| agentskills.io specification | full | portable fields `name` · `description` · `license` · `compatibility` · `metadata` · `allowed-tools`; `name` must match the directory; <5,000-token body; `skills-ref validate` |
| claude-code CHANGELOG (raw) | full, head **2.1.252** | 2.1.251: `PreModelSwitch`/`PostModelSwitch` hook events, `SessionStart` resume hooks receive staleness + re-cache cost; 2.1.248: `--restricted`, agent `experimental.cacheTtl`; 2.1.247: `SendFeedback` tool; nothing in scope in 2.1.249/250/252 |
| code.claude.com/docs/en/hooks | full | **33 events**; five handler types (`command` · `http` · `mcp_tool` · `prompt` · `agent`); command default timeout 600 s (30 s on `UserPromptSubmit`/model-switch); `asyncRewake` = background run that wakes Claude on exit 2; `if` uses permission-rule syntax; `Stop` matcher `manual|timeout|rate_limit`, `SessionStart` matcher `startup|resume|clear|compact|fork`; **hooks in settings files run even before a folder is trusted** (parent-trusted or `-p`); `.cmd` shims need shell form on Windows |
| agents.md (AAIF) | full | Linux Foundation stewardship, 60k+ projects, nearest-file-wins; 20+ tools listed — **Claude Code is not in the roster** (it reads `CLAUDE.md`; the `@AGENTS.md` import is the documented bridge — exactly this repo's shape) |
| plugin-marketplaces | full | source types + minimum versions unchanged; **still no payload-exclusion mechanism**; scopes via `enabledPlugins` (user/project/local) |
| registry.modelcontextprotocol.io | fetched (JS shell) | the official registry; no successor notice |
| anthropics/skills | structure | `skills/` · `spec/` · `template/` · `.claude-plugin/` (172.8k stars) |
| plugins-reference | full | `plugin.json` fields, `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}`, `claude plugin validate --strict`; no exclusion mechanism |
| **+** code.claude.com/docs/en/settings | full | precedence managed > `--settings` > local > project > user; project `permissions.allow` waits for the trust dialog, `deny`/`ask` apply immediately |
| **+** code.claude.com/docs/en/permissions | full | `Bash(prefix *)` matches everything before the first `*` as written; `:*` ≡ trailing ` *`; startup warning for a `*` before the subcommand; **PowerShell rules have the same shape** (aliases canonicalized, case-insensitive); `auto` mode = classifier auto-approval; `Read(./.env)` is the paste-ready deny example |
| **+** code.claude.com/docs/en/sub-agents | full | fields: `tools` · `disallowedTools` · `model` · `permissionMode` · `maxTurns` · `skills` · `mcpServers` · `hooks` · `memory` · `background` · `effort` · `isolation` · `color` · `initialPrompt` · `experimental.cacheTtl`; custom subagents load `CLAUDE.md`, built-in `Explore`/`Plan` do not; descriptions <100 tokens |
| **+** code.claude.com/docs/en/memory | full | Claude Code reads `CLAUDE.md` not `AGENTS.md`; `@import` (4 hops); nested `CLAUDE.md` loads on demand; `.claude/rules/` with `paths:` frontmatter; ~200-line target; block HTML comments stripped; `MEMORY.md` first 200 lines / 25 KB; `/doctor` proposes trims |
| **+** code.claude.com/docs/en/mcp | full | scopes local/project/user; **claude.ai connectors auto-appear in CLI sessions**; `disableClaudeAiConnectors: true` (any scope) or per-project `/mcp` toggle; tool search default since v2.1.221 |

**Category sweep** (dated queries, August 2026; product names only where verified
against a primary page): skill authoring guidance (consistent with the rubric —
"the description is a routing rule", split past 500 lines) · cross-tool instruction
files (30+ agents read `AGENTS.md`; Claude Code is the named exception → `@AGENTS.md`)
· tool servers for a Next.js/TypeScript monorepo (consensus "three to five, max":
docs-lookup, forge, browser driving — all covered here without a standing server, see
Tool servers) · plugin distribution (semver + git tags; official marketplace signed,
community unsigned) · harness-engineering patterns (the O'Reilly/Osmani pieces, the
awesome-lists, an arXiv reference architecture for skill-mediated agents — all
consistent with the kit's guardrails-in-runtime / evals-as-sensors doctrine) · the
connector-leak threads (claude-code issues #26625 → #58453) — now answered by the
`disableClaudeAiConnectors` setting the MCP page documents.

**Verified for this project type:** the installed `next@16.3.3` ships
`experimental.mcpServer` with `@default true`
(`dist/server/config-shared.d.ts`), i.e. the **dev server already exposes an MCP
endpoint at `/_next/mcp`**; the `next-devtools-mcp` package is the client-side
bridge. Dev-only, documented here, not wired (Tool servers below).

**Mechanical layer:** kit `skill-lint` 0 errors / 0 warnings (855/900 always-loaded
tokens); kit `skill-evals` 10 skills · 30 scenarios · 94 anchors, 0 errors — **also
green against this repo's installed 0.23.11 copies** (run in a scratch dir);
`pnpm docs:sanity` green (65 files link-checked, hook wiring parity, 117/150 lines);
`install.mjs --check` against the 0.23.15 clone: **13 files drifted**, every one
upstream-forward (0.23.12–0.23.15), none an in-place edit here.

## Inventory (the local surface)

- **Skills:** 10, kit 0.23.11. Always-loaded descriptions ≈855 tokens (94% of the
  adapter's 909 cap), and at 0.23.11 **all ten are model-invocable** — 0.23.13
  (unreleased here) sets `disable-model-invocation: true` on the seven workflow
  skills, which the skills reference confirms removes their descriptions from
  context (charged cost ≈257 tokens: `doc-audit` 93 + `dep-check` 92 +
  `live-verify` 72) and stops `checkpoint`/`tidy`/`project-init`/`project-adopt`/
  `retro`/`project-audit`/`harness-audit` from firing on a stray phrase match.
- **Hooks:** **10 wired entries** in `.claude/settings.json` across 4 events —
  `SessionStart(compact)` ×1 · `PreToolUse` ×2 (`contrarian-nudge` on
  `ExitPlanMode`, `live-verify-reminder` on `Bash` if `git *`) · `PostToolUse` ×4
  (`dep-check-nudge`, `skill-drift-guard`, `context-guard`, `banned-api-guard`) ·
  `Stop` ×3 (repo-owned identity-guarded `checkpoint-autorun` 15 s; kit `stop-gate`
  300 s and kit `checkpoint-autorun` 30 s, both inert without an `enforcement`
  block). Eight kit + two repo-owned; every path anchored on
  `${CLAUDE_PROJECT_DIR}`; `docs:sanity` asserts kit-wiring parity. The **installed
  `inventory.mjs` (0.23.11) reported 8** — it reads `hooks.json` only and missed both
  repo-owned handlers; 0.23.14's settings-aware script (run from the clone) produced
  the table this report uses.
- **Instruction files:** `AGENTS.md` 100 lines ≈1.9k tokens; `CLAUDE.md` 56 lines
  ≈1.0k tokens (`@AGENTS.md` import + the Claude-specific kit/contrarian policy);
  six leaf `packages/*/AGENTS.md` (227–1,248 tokens) each wrapped by a one-line
  `packages/*/CLAUDE.md` = `@AGENTS.md` — **verified: this is the documented pattern
  and nested `CLAUDE.md` loads on demand**, so the leaf rules do reach Claude Code.
  No `.claude/rules/`, no `CLAUDE.local.md`.
- **Subagents / commands:** one subagent (`contrarian`: `Read, Glob, Grep,
  WebSearch, WebFetch`; no `model`/`effort`/`memory` fields) — registered in this
  session's registry under 2.1.251, so the CONVENTIONS registration table (stamped
  v2.1.220) still holds. No commands (merged into skills upstream — matches).
- **Tool servers:** none wired at any scope (no `.mcp.json`; `~/.claude.json`
  `mcpServers` empty at global and project level). This session nonetheless carried
  **11 claude.ai connectors** (Figma, Gmail, Google Calendar/Drive, Notion,
  Pantry Persona, Atlassian, Linear, PayPal, github, Claude_Code_Remote) — all
  unauthenticated in the CLI, deferred via tool search, none serving this project.
- **Permissions:** shared `settings.json` — 8 `allow`, 0 `deny`, 0 `ask`, all
  eight from the 2026-07-14 release commit and never reviewed since;
  `settings.local.json` — 477 `allow` (296 Bash · 172 PowerShell · 3 WebFetch ·
  2 MCP), 0 `deny`; user `~/.claude/settings.json` `defaultMode: "auto"`.
- **Packaging:** installer route (plugin route documented as mutually exclusive);
  `installed.json` 0.23.11 vs clone 0.23.15; the kit tags v0.23.0–v0.23.10 and
  nothing from 0.23.11 to 0.23.15, the installed version included (corrected by
  contrarian — the first draft's `v0.23.1*` glob had hidden nine tags).
- **CI gates on the harness:** `docs:sanity` (links · AGENTS.md commands · hook
  wiring in both forms · kit parity · agent ↔ policy), `knip` (hook and skill
  scripts as entries), Biome excludes installer-owned paths. No kit-drift check.

## Sampled graded pass (delta mode)

Two scenarios from the kit fixtures, chosen because their skills' installed text is
byte-identical to kit source (untouched by 0.23.13): each run twice on the
**Sonnet** tier in a fresh read-only `Explore` subagent (which skips `CLAUDE.md`, so
the baseline can't inherit the repo's working agreements) — Run A told to read and
follow the skill, Run B forbidden from reading `.claude/`, `AGENTS.md`, `CLAUDE.md`,
`MAINTENANCE.md`. Graded against the fixtures' `expect[]`/`reject[]`.

| Scenario | expect only-with-skill | present in both | reject fired in baseline only | tokens A / B | wall A / B |
| --- | --- | --- | --- | --- | --- |
| live-verify · standing-dev-server | **3/3** (refuses dev mode · one domain reference · adapter-derived readiness) | 0 | 1 of 2 ("verifies against the running dev process" — baseline targeted `:3000`; "disturbs the standing server" passed in both) | 35.0k / 40.4k | 41 s / 92 s |
| doc-audit · archive-not-delete | **0/3** | 3 (baseline read `PROJECT_STATUS.md`'s own compaction rule and the 7th-compaction archive precedent) | 0 of 2 (neither fired) | 51.6k / 41.1k | 93 s / 47 s |

**Delta: 3/6 expected behaviors earned only with the skill, 1 reject prevented;**
live-verify was *cheaper* with the skill (−13% tokens, −55% wall-clock — the baseline
spent 13 tool calls re-deriving the flow), doc-audit +25% tokens. Three findings the
runs surfaced beyond the rubric:

1. The with-skill live-verify run echoed the adapter's
   `pnpm --filter web start -- --port 3100` **verbatim** — the exact broken form
   the open B1 row documents. The adapter defect reaches real runs; the row is
   under-prioritized as "one-field fix".
2. Its readiness step keyed on `verify.ready.kind`, which this adapter doesn't carry
   (it is on the schema's legacy `prodVerify` shape, honored as fallback) — the
   agent improvised an HTTP-200 check on `:3100`. Correct by luck, not by contract.
3. doc-audit's skill-only value in a mature consumer showed in steps the fixture
   doesn't assert: the archive-index same-commit update (baseline missed it), the
   quantified savings (33 K → 16–18 K chars), the audit-anchored cutoff. By the
   reference's rule, the three `archive-not-delete` assertions are not evidence in
   a repo whose docs already carry the doctrine — kit-side fixture refinement.

## Scores

| Area | /100 | Named deductions |
| --- | --- | --- |
| Description quality & always-loaded budget | **93** | −6 at 0.23.11 all ten descriptions are charged (855 tokens) and seven side-effect workflow skills are model-invocable — fixed upstream in 0.23.13, pending the bump; −1 the 909 budget is a single figure where the harness now distinguishes portable (all descriptions) from charged (auto-invocable only). Descriptions themselves: 10/10 third person, what + when, trigger phrases, 288–372 chars |
| Disclosure structure | **98** | −2 `project-adopt` body ≈2,726 tokens, largest and nearing the split heuristic — watch, don't split (kit verdict unchanged) |
| Eval presence | **94** | −3 first consumer-side graded record — two scenarios sampled, no full pass; −3 two fixture assertions pass in both configurations here (doc-audit `archive-not-delete` ×3 as a set; live-verify reject #2) and should be replaced per the reference — **kit-side, recovers on relay** (row 5), not by a repo action. Mechanical anchors green against the installed copies |
| Hook coverage & discipline | **94** | −3 harness surface is 33 events, the kit's verdict log covers 31 (`PreModelSwitch`/`PostModelSwitch` unverdicted — kit B1-48 open; repo-level verdicts recorded below: reject/reject); −2 the installed inventory script undercounted this repo's own hooks (8 of 10) until 0.23.14 — **kit-side, recovers with the bump**; −1 both `checkpoint-autorun` reason texts say "run the `checkpoint` skill", which the Skill tool can no longer honor once 0.23.13's `disable-model-invocation: true` lands (verified against the skills reference, not reproduced live). Loud and partial, not silent — the reason text carries the commit/push/CI/prune/resume procedure, so what is lost is checkpoint's continue-vs-handoff judgment and its CI-watch reference (contrarian's calibration) |
| Tool-server leanness | **100** | zero standing servers at any scope; `gh` CLI and the Playwright CLI already cover the forge and browser-driving roles at no standing cost; Next's built-in `/_next/mcp` documented, not wired. The 11-connector session cost is account-level hygiene (below), not a repo deduction |
| Permissions | **82** | −6 `Bash(winget install *)` in the **tracked, template-surface** allowlist — arbitrary software install auto-approved in every clone and every generated project (PERMISSIONS.md: broad exec grants stay out of shared settings); −2 `Bash(docker exec *)` — the same class, arbitrary exec inside any container (`docker exec nwb-postgres psql … -c "DROP SCHEMA …"` runs without a prompt; contrarian's find, missed by the first draft); −3 `Bash(pnpm --filter web add -D dotenv-cli@^11.0.0)` — a dead one-off that is also a package install, the moment dep-check is supposed to run; −2 `Bash(git -c core.safecrlf=false commit -q -m ' *)` — dead (commits use `-F` per the adapter); −3 the gate is incomplete and Bash-only: no `pnpm lint`, and **zero PowerShell-form rules** although the harness's primary shell on the owner's machine is PowerShell, which is why 172 PowerShell rules accreted in the untracked local file; −2 no `deny` floor at all (env files with live keys, force-push) — under the user's `defaultMode: auto` deny rules are the only hard floor, and they apply before trust |
| Instruction files | **98** | −2 CONVENTIONS' subagent-registration table is stamped v2.1.220 (31 releases ago); the claim was re-verified today under 2.1.251 — restamp. `AGENTS.md` 100/150 lines, `CLAUDE.md` `@AGENTS.md` import, leaf wrappers all per the current memory page |
| Packaging currency | **92** | −4 no CI gate for kit drift — `install.mjs --check` is manual, `skill-drift-guard` advisory; −3 the kit tags v0.23.0–v0.23.10 but nothing from 0.23.11 (installed) to 0.23.15 (latest), so a pin-by-tag reproduction of today's state is impossible — **kit-side, recovers on relay**; −1 four patches behind, cadence honored (this run *is* the kit-bump trigger) |

**Aggregate: 93.9/100** (unweighted mean; baseline run — no prior report to diff.
94.1 before the contrarian fold added the `docker exec *` deduction).

## No change needed (decision log)

- **Installer route, not the plugin** — re-affirmed: the mutual-exclusion hazard
  (double-fired hooks) still holds and no payload-exclusion mechanism exists
  (plugin-marketplaces + plugins-reference, both fetched today).
- **Zero MCP servers wired** — re-affirmed. The sweep's "three to five" consensus
  names docs-lookup, forge and browser driving; here Next 16 ships version-exact
  docs under `node_modules/next/dist/docs/`, `gh` covers the forge, and the
  Playwright CLI covers the browser at zero standing context. Next's built-in
  `/_next/mcp` is a dev-only verification surface — document (kit `stack.md`),
  don't wire.
- **`.claude/rules/`** — not adopted: `AGENTS.md` is 100 lines and every rule is
  repo-wide; path-scoped loading already exists through the leaf `CLAUDE.md`
  wrappers.
- **New subagent frontmatter for `contrarian`** (`model`, `effort`, `memory`,
  `maxTurns`, `isolation`, `experimental.cacheTtl`) — not adopted: `memory: project`
  would create `.claude/agent-memory/` on the template surface, a pinned `model`
  fights the "different framing, not a different model" doctrine, and effort
  inherits from the session. `tools:` stays shell-free by decision.
- **`PreModelSwitch` / `PostModelSwitch`** — repo-level verdict **reject / reject**:
  no repo invariant keys off a model change; `PostModelSwitch` is display-only.
  (The kit-level verdicts are owed in the manifest — kit B1-48.)
- **`.claude/scheduled_tasks.lock` and the other harness runtime files** — no
  `.gitignore` change: Claude Code maintains the `# claude-code-runtime` block in
  `.git/info/exclude` per clone (ten patterns, verified locally).
- **`enforcement.checkpointAutorun` / `stopGate`** — re-affirmed inert: autonomous
  push consent must not ship to generated projects; the repo-owned,
  identity-guarded hook stays. (`bannedApis` is *not* the same consent shape — row
  5 below.)
- **`claude plugin validate .claude/skills` as a CI step** — not adopted: needs the
  binary in CI; `skill-lint` gates the same class upstream and `docs:sanity` covers
  wiring here.
- **`skillOverrides` in tracked settings to hide the seven workflow skills before
  the bump** — not adopted: 0.23.13 does it in-frontmatter; two mechanisms would
  drift.
- **Two `Stop`-wired `checkpoint-autorun` handlers** (repo-owned + inert kit shell)
  — re-affirmed as documented in CONVENTIONS; the inert one costs a node spawn per
  stop and nothing else.
- **`--restricted` flag, `experimental.cacheTtl`, `SendFeedback`, `modelPicker`,
  `promptCacheTtl`** — harness features with no repo surface; noted, no row.

## Proposed rows (await sign-off — this skill proposes, the gate decides)

Post-contrarian shape (the pre-fold draft had six rows; the disposition table
below records what moved). Seeded into `docs/BACKLOG.md` as forward-only rows.

1. **B1 · Kit / harness — bump ai-dev-kit 0.23.11 → 0.23.15 *and* migrate the
   adapter contract, one sign-off.** Contrarian: any reinstall from the clone
   installs 0.23.13's `disable-model-invocation`, so the adapter fix cannot land
   without the bump's riders — the two former rows are one. *Kit half* (13
   drifted files: seven skills gain `disable-model-invocation`,
   `harness-audit`/`project-audit` gain `effort: high`, `stop-gate` →
   `asyncRewake`, settings-aware inventory, `harnessAudit.kitSourcePath`,
   refreshed `sources.md`/`stack.md`). *Adapter half* (`adapters/next-web-boilerplate.json`
   in the clone → reinstall): the schema's `verify` block — `build: pnpm build` ·
   `run: pnpm --filter web start --port 3100` (the no-`--` form only; an
   env-prefix form is a PowerShell syntax error on a Windows-safe template) ·
   `ready.kind: http` · `ready.port: 3100` · `notes` · optional `observe` —
   keeping `prodVerify` until the kit drops the fallback, plus
   `harnessAudit.kitSourcePath`. Evidence: graded-pass findings 1–2. Riders, all
   in the same commit: (a) rewrite the reason text of
   `.claude/hooks/checkpoint-autorun.mjs` to name
   `.claude/skills/checkpoint/SKILL.md` — "read and follow it"; a plain `Read` is
   unaffected by the frontmatter flag — as a precondition of *any* reinstall;
   (b) confirm `docs:sanity` green — its parity shape compares
   event/matcher/handler/if/timeout only, so the new `asyncRewake: true` key
   passes silently; decide whether to widen the shape; (c) the two-figure budget
   (portable 855 · charged ≈257) is a **doc note** beside the 909 figure in
   CONVENTIONS/MAINTENANCE, not an adapter field — `contextBudget` is
   `additionalProperties: false` and the installer validates before writing;
   (d) restamp CONVENTIONS' registration table to 2.1.251; (e) rehearse in a
   scratch dir per the standing checklist; (f) ask the kit to tag v0.23.11
   through v0.23.15 — backfilling is the kit's own 0.23.10 precedent; (g) one
   convention sentence in `CLAUDE.md` — "skills marked `disable-model-invocation`
   are invoked by reading `.claude/skills/<name>/SKILL.md`; `/name` is the user
   form" — and reword `CLAUDE.md`'s "Run `/checkpoint` at each step boundary"
   and MAINTENANCE's "re-run [harness-audit] when the kit bumps" to match, since
   generated projects inherit both. Template surface ⇒ contrarian + sign-off.
   Effort S–M.
2. **B1 · Permissions (template surface) — least-privilege pass on
   `.claude/settings.json`.** Remove `Bash(winget install *)`, the dead
   `dotenv-cli` install grant, the dead literal-commit grant, **and
   `Bash(docker exec *)`** (same class — arbitrary exec inside any container; it
   moves to the owner's `settings.local.json`, where the DB-assertion recipes
   that grew it live). Add `Bash(pnpm lint *)` plus the verify lane's
   worktree-local commands (`pnpm test *`, `pnpm docs:sanity`, `pnpm knip`,
   `pnpm lint:deps`), and the PowerShell-form twins for the gate and read-only
   git — PowerShell rules share the Bash shape, alias-canonicalized — so a fresh
   clone stops prompting under the harness's primary shell. Add a `deny`
   **tripwire, not a wall**: force-push in both flag orders — `Bash(git push -f *)`,
   `Bash(git push --force*)`, `Bash(git push * -f)`, `Bash(git push * -f *)`,
   `Bash(git push * --force*)` and the PowerShell twins (decide
   `--force-with-lease` explicitly; `--force*` catches it) — and env files by
   gitignore-semantics bare names mirroring `.gitignore`: `Read(.env)`,
   `Read(.env.local)`, `Read(.env.*.local)` (any depth; `.env.example` stays
   readable). Pre-merge: run the two `.env`-reading recipes (`set -a; . ./.env`
   sourcing; the `grep | cut` form) under the rule — `Read` denies reach
   `cat`/`head`/`tail`/`sed`; if `source` is recognized too, rewrite the recipes
   to the `pnpm exec dotenv -e .env -- <cmd>` subprocess form, which deny rules
   don't reach. Record in the row that `ask: Bash(git push *)` was considered and
   rejected (it would prompt the autonomous checkpoint push), and that deny beats
   allow from every scope — with this repo's Stop hook committing any tracked
   edit, there is no session-level lift. Contrarian + sign-off. Effort S.
3. **B3 · Tooling / CI — kit-drift gate, fork-safe.** A static-lane step gated
   `if: vars.ENABLE_KIT_DRIFT == 'true'` — the repo's existing convention for
   lanes generated projects must not inherit hot (`ENABLE_CSP_NONCE` ·
   `ENABLE_GHCR_PUBLISH` · `ENABLE_VISUAL` · `ENABLE_PERF`) — ON here, unset
   elsewhere: resolve `v<installed.json.kit>`, **skip with a warning when the tag
   is missing**, otherwise fetch the kit at that tag and run
   `install.mjs --check --dest .` (`--check` ignores `--adapter`; no `--global`).
   Alternative to ask the kit for: record the install commit SHA in
   `installed.json` and fetch by SHA — immutable, no tag ritual. Workflow
   surface ⇒ contrarian. Effort S.
4. **B3 · Tooling / lint — mechanical enforcement for the prose-only hard rules,
   lint-only.** The probe file (`@ts-ignore`, `as any`, `enum`, `useMemo`) passed
   `pnpm exec biome lint` with one warning and exit 0. Real footprint today: zero
   enums, zero `@ts-ignore`, one `as any`
   (`apps/web/src/server/actions/calendar-rsvp.test.ts:144`, an invalid-input
   probe — `as never` or a test-file override), and the React-Compiler rule
   **already violated at five sites** — `notifications-feed.tsx:103,111,120`
   (`useMemo`, with a WHY: query-key identity for `setQueryData`) and
   `use-consent.ts:47,52` (`useCallback`). Step 1 is a decision on those five:
   remove (Compiler ON) or keep with an inline suppression carrying the WHY. Then
   `noExplicitAny: error` (broader than "`as any`" — it bans `: any` too; say so),
   Biome 2's `suspicious/noTsIgnore` and `style/noEnum` (verify the names when
   building), and for the Compiler rule ESLint core `no-restricted-imports`
   (`paths: [{ name: "react", importNames: ["useMemo", "useCallback", "memo"] }]`)
   in `tooling/eslint/next.js` — zero new dependencies, per-line disable with a
   reason (or Biome's `noRestrictedImports` with `importNames` — verify).
   **`enforcement.bannedApis` overruled:** `banned-api-guard` scans the whole file
   after every edit, exits 2 on any hit, and its only exemption is path-level, so
   it would block every edit to the two files above including the one removing
   the memoization; and CONVENTIONS' "carries no `enforcement` block, and must
   not" is absolute as written. Effort S–M.
5. **Kit-side relay (no repo row) — evals:** replace the pass-in-both assertions
   (doc-audit `archive-not-delete` → assert the archive-index same-commit update
   and the quantified savings; live-verify `standing-dev-server` reject #2) and
   record this run's delta in the kit's next `SKILL_EVALS_<date>.md`.

**Kit-side relays** (no repo row): the kit's own `hooks/checkpoint-autorun.mjs`
reason text has the same `disable-model-invocation` interaction as rider 1a; the
kit's same-day self-audit (`docs/archive/HARNESS_AUDIT_2026-08-31.md`, agents.md
row) states "Claude Code reads AGENTS.md natively" — the memory page fetched today
says the opposite, and `sources.md` must absorb the right one; `stack.md` lacks a
web/Next.js per-domain entry (built-in `/_next/mcp`, dev-only,
`experimental.mcpServer` default `true`; `next-devtools-mcp` bridge — documented,
not wired); `sources.md` candidates for the sub-agents and memory pages (both
consumer-relevant: subagent frontmatter, `CLAUDE.md`/`AGENTS.md` loading rules);
release tags for 0.23.11–0.23.15, or an install SHA in `installed.json`.

**Hygiene (no row — machine/account-local):** `settings.local.json` carries 477
allow entries, 18 referencing files that no longer exist and 27 one-off shapes
(`/tmp` jars, tracked-var curls, scratch scripts) — prune; `~/.claude.json` holds
**two** entries for this project (`c:/…` untrusted, `C:/…` trusted) — the lower-case
one will re-prompt for trust if the session is launched from that spelling; the 11
claude.ai connectors cost every CLI session their deferred tool names — set
`disableClaudeAiConnectors: true` in user settings or toggle them off in `/mcp` for
this project; `defaultMode: auto` makes row 2's deny floor the real hard floor.

## Reference-file refresh (steps 2–3)

The installed `sources.md`/`stack.md` under `.claude/skills/harness-audit/` were
**not edited in place** — `CLAUDE.md` forbids editing installer output. The kit clone
at the standing path already carries every row stamped 2026-08-31 plus two dated
`stack.md` additions (the Playwright-CLI-over-MCP preference; the Vite dev-server
MCP class), **uncommitted** — an earlier run today on the kit itself, awaiting that
repo's sign-off commit. This run re-fetched all eleven rows independently and
confirmed them; nothing was added to the clone mid-sign-off. The refresh reaches
this repo with row 1; the consumer-relevant additions (sub-agents · memory pages;
the Next.js entry) are relayed above rather than written.

## Contrarian disposition

Run on the report file before any outcome existed, with the primary sources (not a
summary). It verified seven claims itself: the kit tag set (found the draft wrong),
the `.git/info/exclude` runtime block, the memory page's `AGENTS.md` rule (and the
kit's same-day report contradicting it), `docs-sanity`'s parity shape, the settings
inventory, the `disable-model-invocation` semantics, and the five live
`useMemo`/`useCallback` sites. Verdict: **Sound with caveats**.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Major | Row "hooks"'s `bannedApis` half rests on a wrong premise: the Compiler rule is already violated at five sites, one with a documented WHY; the guard has no per-line exemption; CONVENTIONS' no-`enforcement` rule is absolute as written | **Overruled the `bannedApis` half, folded the lint half** — row 4 is lint-only, starts with the five-site decision, uses ESLint core `no-restricted-imports` (zero deps) for the Compiler rule |
| 2 | Major | The adapter row is not independent of the bump: any reinstall from the clone installs 0.23.13 | **Folded** — merged into row 1; rider (a) is a precondition of any reinstall; `--adapter` dropped from the `--check` shape |
| 3 | Major | Rider (a) under-scoped: `CLAUDE.md`'s "Run `/checkpoint`" and MAINTENANCE's "re-run harness-audit" also name soon-user-only skills; "silently disarm" overstates — the loss is loud and partial | **Folded** — rider (g) added; hooks deduction and verdict reworded |
| 4 | Major | The least-privilege pass kept `Bash(docker exec *)`, the same class as `winget` | **Folded** — removed to local; Permissions 84 → 82; verify-lane commands added per the PERMISSIONS.md starter |
| 5 | Major | The deny floor's patterns have definite holes (flag order, `--force-with-lease`, cwd-anchored `./.env`); `Read` denies reach Bash file commands, so the owner's sourcing/`grep` recipes may break with no session-level lift (deny beats allow; the Stop hook commits any tracked edit) | **Folded** — both flag orders, gitignore-semantics bare names, pre-merge recipe test with the `dotenv` subprocess fallback, the `ask` rejection recorded, "tripwire, not a wall" |
| 6 | Major | The CI drift step ships to every generated project and couples their CI to the kit's tag ritual | **Folded** — `vars.ENABLE_KIT_DRIFT` gate + skip-on-missing-tag; SHA-in-`installed.json` alternative relayed |
| 7 | Minor | Packaging −3 scored on a false statement (v0.23.0–v0.23.10 are tagged); rider (f) under-asked | **Folded** — inventory and deduction corrected (the deduction survives on its true half); (f) widened to 0.23.11–0.23.15 |
| 8 | Minor | Rider (c) cannot be an adapter field (`contextBudget` is `additionalProperties: false`) | **Folded** — a doc note |
| 9 | Minor | `PORT=3100 …` is bash-only on a Windows-safe template | **Folded** — no-`--` form only |
| 10 | Minor | Two deductions (eval assertions, inventory undercount) are kit-owned; "Windows-primary repo" describes the owner's machine, not the template | **Folded** — marked "kit-side, recovers on relay"; wording fixed |
| 11 | — | Every "no change needed" verdict checks out; the kit's same-day report asserts Claude Code reads `AGENTS.md` natively, contradicted by the memory page | **Raised → relayed upstream** |

## Verdict

The harness is **current with the 2026-08-31 ecosystem on structure** — installer
route, advisory hooks anchored and parity-checked, `@AGENTS.md` bridge with leaf
wrappers, zero standing tool servers, mechanical lint/eval layers green even
against the installed copies — and the sampled graded pass shows `live-verify`
earning its keep outright (3/3 behaviors, one regression prevented, cheaper than
the baseline). The gaps are concentrated in two places this repo owns and no kit
release fixes: the **shared permission allowlist** (template-surface `winget
install *` and `docker exec *` grants, two dead grants, no PowerShell twins, no deny
floor) and the **adapter contract** (legacy `prodVerify` with a start command a real
run copied verbatim). The kit bump is the third: at 0.23.11 every skill is
auto-invocable and every description is charged; 0.23.13 fixes both, but its
`disable-model-invocation` on `checkpoint` degrades the Stop-hook checkpoint flow —
loudly and partially, per contrarian's calibration — unless the hook's reason text
and the two always-loaded instruction lines are changed to name the file in the same
commit. Contrarian's fold cost the draft one point (`docker exec *`), merged two rows
into one sign-off, and overruled the one proposal that would have shipped a blocking
hook onto the template surface.
