# Conventions

> The hard rules live in AGENTS.md (always loaded). Load this file for the full
> naming table, the `apps/web/src` file-structure map, export/knip details, git
> hooks, and the rationale behind the rules.

## TypeScript

- `strict: true` in all tsconfigs. No `// @ts-ignore` or `as any` — fix the type.
- Prefer `interface` for object shapes; `type` for unions, intersections, and primitives.
- Avoid enums — use `as const` objects or string literal unions instead.
- `noUncheckedIndexedAccess` is enabled: always check array/object access results.
- Server-only modules use `import "server-only"` at the top to prevent client bundle leaks.
- Do **not** use `baseUrl` in tsconfig — it is deprecated in TS 6 (removed in TS 7). Define `paths` without it; they resolve relative to the tsconfig's own location (e.g. `"@/*": ["./src/*"]` in `apps/web/tsconfig.json`).
- Never put `paths` in a shared/extended tsconfig — relative path mappings resolve against the file that *defines* them, so they'd point at the wrong directory. Each app declares its own `paths`.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files | kebab-case | `user-profile.tsx` |
| Directories | kebab-case | `components/user-profile/` |
| React components | PascalCase | `UserProfile` |
| Functions / variables | camelCase | `getUserById` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE` |
| Zod schemas | camelCase + `Schema` suffix | `userSchema` |
| Types / interfaces | PascalCase | `UserProfile` |
| tRPC routers | camelCase + `Router` suffix | `userRouter` |
| Zustand stores | camelCase + `Store` suffix | `useAuthStore` |
| DB table names | snake_case (Drizzle convention) | `user_profiles` |

## Exports

- Named exports everywhere. Default exports only where a framework/tool requires: page files, layout files, route handlers, `next.config.ts`, and tool config files (`vitest.config.ts`, `playwright.config.ts` — they `export default defineConfig(...)`).
- One **exported** React component per file. Two deliberate exceptions, recorded 2026-09-01 after sixteen audits had graded the practice without the rule saying so: shadcn compound primitives in `packages/ui/src/components/` ship every part from one file (`dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `table.tsx`, `card.tsx`, `form.tsx`, `avatar.tsx` — upstream's distribution shape, which `shadcn add` re-creates), and an **unexported** helper component may live beside the one component that uses it (`login-form.tsx`'s challenge/passkey/magic-link sub-forms are the pattern). knip polices the boundary: an exported second component is either consumed elsewhere — then it gets its own file — or dead.
- Index barrel files (`index.ts`) at package roots only — not within `apps/web`.
- **Dead code is gated by knip** (`pnpm knip`, root `knip.jsonc`; CI `verify` lane, A27): an unused file, an export no other file imports, or an unused/undeclared dependency fails CI. When it flags your change, prefer deleting the orphan. An export kept deliberately as boilerplate API surface (not yet consumed in-repo) gets a `/** @public — why */` JSDoc tag on the declaration — knip skips `@public`-tagged exports (`tags: ["-public"]`), and the reason lives next to the code. Exports a file itself uses are always allowed (`ignoreExportsUsedInFile`). A `knip.jsonc` ignore is the last resort and must carry its reason.

## Tests

- Unit/component tests: `*.test.ts(x)`, **co-located** with the file under test (run by Vitest).
- E2E tests: `*.spec.ts` under `apps/web/e2e/` (run by Playwright).
- Keep the suffixes distinct — `*.test.*` for Vitest, `*.spec.*` for Playwright — so neither runner picks up the other's files. See [TESTING.md](TESTING.md).

## File Structure Within `apps/web/src`

```text
app/
  layout.tsx        — root layout: a bare passthrough (owns only the globals.css
                      import); the real document shell lives in [locale]/layout.tsx
  [locale]/         — the WHOLE page tree (i18n path routing — see I18N.md);
                      [locale]/layout.tsx owns <html lang>, providers, Toaster
    (auth)/         — auth pages: login, signup, forgot-password, reset-password,
                      goodbye, accept-invitation/[id]
                      (shared centered-card layout; render at /login, /signup, …)
    (dashboard)/    — protected app shell (nav + user menu + sign-out); the layout
                      runs the authoritative session check, redirects to /login if none
    page.tsx        — the landing page (renders at /)
  api/              — route handlers (auth, trpc, stripe/webhook, resend/webhook,
                      uploadthing, notifications/stream, health). Two more sit
                      OUTSIDE api/: [locale]/rsvp/[token] and .well-known/security.txt
i18n/               — next-intl plumbing: routing.ts, request.ts, navigation.ts
components/
  [feature]/        — co-locate component with its types and hooks
    component-name.tsx
    use-component-name.ts   (hook, if any)
server/
  trpc/
    routers/        — one file per domain (user.ts, post.ts, etc.)
    root.ts         — appRouter combining all routers
    trpc.ts         — tRPC instance + context
  actions/          — Server Actions, one file per domain
```

(Message catalogs live beside `src/` at `apps/web/messages/{en,es}.json`.)

## React

- Default to Server Components. Add `"use client"` only when you need browser APIs, event handlers, or hooks.
- Co-locate `"use client"` at the lowest possible component in the tree.
- Do not fetch data in Client Components — pass data down from Server Components or use TanStack Query for client-side refetching.
- **React Compiler is on** (`reactCompiler: true`), so don't reach for `useMemo`/`useCallback`/`React.memo` by default — the compiler memoizes for you. Write idiomatic components and keep the [Rules of React](https://react.dev/reference/rules) (no mutation during render, hooks at the top level); the compiler skips anything that breaks them. If a component must be left uncompiled, add the `"use no memo"` directive to it. Rationale in [DECISIONS.md](DECISIONS.md).

## Comments

No comments unless the WHY is genuinely non-obvious (a hidden constraint, a subtle invariant, a framework bug workaround). Never explain WHAT the code does.

## Imports

Biome's `organizeImports` assist handles ordering automatically. Manually maintain this rough order if editing:

1. Node built-ins
2. External packages
3. `@repo/*` packages
4. `@/*` app-internal imports
5. Relative imports

## Error Handling

- Server Actions return the shared `ActionResult<T>` (`@repo/validators`): `{ data: T }`
  or `{ error: string; fieldErrors?: Record<string, string> }` — the optional per-field
  `fieldErrors` (A7) map to inline RHF `setError` messages; the form-level `error` stays
  a banner. See [API.md](API.md#typed-field-errors--the-actionresult-convention-a7).
- tRPC procedures throw `TRPCError` with appropriate codes.
- Client-side errors surface via TanStack Query's `error` state or React Error Boundaries.
- Never swallow errors silently.

## Git hooks

[husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) run a fast quality gate locally before code leaves your machine (CI still runs the full gate). They install automatically on `pnpm install` via the root `prepare` script — no manual setup. Bypass any hook with `git commit --no-verify` / `git push --no-verify`.

| Hook | Runs | Purpose |
| --- | --- | --- |
| `pre-commit` | `lint-staged` → `biome check --write` on staged `*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,jsonc,css}` | Formats, lints, and sorts imports on **staged files only**; safe fixes are re-staged. An unfixable error (e.g. an unused variable) blocks the commit. |
| `commit-msg` | a dependency-free POSIX-sh check (`.husky/commit-msg`) | Rejects empty / too-short (`< 10` chars) subjects and leftover `fixup!`/`squash!` prefixes. Deliberately **not** a Conventional-Commits enforcer (history is mixed-style on purpose); the length floor is a tunable variable at the top of the script. |
| `pre-push` | `pnpm type-check` | Project-wide `tsc` across all packages (turbo-cached → near-instant when types are unchanged). |

- **Why type-check is pre-push, not pre-commit:** the repo's types cross package boundaries and `type-check` `dependsOn` `^build`, so a per-file `tsc` would be unsound. The full check is heavier, so it sits at the less-frequent push boundary while `pre-commit` stays fast by touching only staged files.
- **Markdown isn't linted by the hooks** — Biome doesn't lint Markdown; markdownlint stays editor-only (see `.markdownlint.jsonc`).
- **husky internals** live in the git-ignored `.husky/_/`; the committed hooks are `.husky/{pre-commit,commit-msg,pre-push}`. The `prepare` script no-ops safely where there's no `.git` (the Docker build, CI installs), so it never breaks those.

## Agent tooling (`.claude/`)

Claude Code hooks, not git hooks. `.claude/` is **template surface**: `scripts/init-app.mjs`
never touches it, so everything here ships verbatim into every generated project. Three
layers, with different ownership:

| Path | Owner | Rule |
| --- | --- | --- |
| `.claude/skills/`, `.claude/hooks/ai-dev-kit/` | ai-dev-kit (installer output) | Never edit in place — edit a kit clone and re-run `install.mjs`; `install.mjs --check` guards drift. Includes `hooks/ai-dev-kit/hooks.json` (since kit 0.17.0) — a **record** of the kit's wiring, not live config; `settings.json` is what actually runs. |
| `.claude/agents/`, `.claude/hooks/*.mjs` (top level) | this repo | Hand-maintained; edit directly. `knip.jsonc`'s root `entry` glob `.claude/hooks/*.mjs` already covers a new top-level hook (nothing imports them, so knip would otherwise report a dead file); agent `.md` files are not knip inputs. |
| `.claude/settings.json` | this repo, merged by the installer | See below. |

**This repo is installer-route — do not also install the kit's marketplace plugin.** The kit
ships two install channels and they are mutually exclusive: the plugin loader auto-discovers the
plugin's own wiring file, so a repo that already carries installer-form entries in
`settings.json` would fire **every kit hook twice**, from two files, with no local artifact
explaining it. The installer's ownership marker cannot help — it only sees `settings.json`.

**`--hooks` is adopted as of kit 0.23.1** (2026-08-25). It was deliberately omitted while
`compact-reorient.mjs`'s injected text pointed at docs `scripts/init-app.mjs --slim` deletes
(`docs/PROJECT_STATUS.md`/`docs/BACKLOG.md`) while shipping `.claude/` verbatim — a generated
project would have gotten a nudge at nonexistent files on every compaction, silently, forever.
Kit 0.23.1 landed the recorded condition: the handler now stats the adapter's
`docs.status`/`docs.backlog` and names only files that exist, so the wiring is safe in
generated projects too. The install command is
`node <worktree>/install.mjs --adapter <clone>/adapters/next-web-boilerplate.json --dest <repo>
--global --hooks`.

⚠️ **Install from a TAG, never from the clone's working tree** (rule adopted 2026-09-02
after a live incident: the clone moved 0.23.16 → 0.23.17 *mid-session*, unprompted, while a
bump was being planned against it). `install.mjs --check` diffs the destination against
whatever the kit source currently is, so a clone that drifts makes the drift gate **green by
construction whatever you installed** — it cannot detect this, and nothing else in the pipeline
looks. The fix is mechanical, because `install.mjs:36` derives its kit root from the script's
own location (`dirname(fileURLToPath(import.meta.url))`), not from the clone:

```
git -C <clone> worktree add <worktree> v<X.Y.Z>
node <worktree>/install.mjs --adapter <clone>/adapters/…json --dest <repo> --global --hooks
```

The worktree is an immutable tagged kit root; the clone is never touched, and the resulting
`ai-dev-kit.installed.json` names a version that actually exists as a tag (which the B3
kit-drift-gate row depends on). The **adapter** is passed by path and copied verbatim, so it
correctly comes from the clone — it is not versioned payload. Two further rehearsal rules,
both learned the same day: the scratch-dir rehearsal must **omit `--global`** (that flag
writes to `~/.claude/skills/`, a path *not* derived from `--dest`, so a "rehearsal" carrying
it performs the real, un-revertable home-directory write), and the dual-home skills must be
diffed against `~/.claude/skills/` separately, since the `--dest` diff never sees them.

The kit's Stop-event handlers (`stop-gate`, `checkpoint-autorun`) and
`banned-api-guard` wire with it but are **inert here by design**: this repo's tracked adapter
config carries no `enforcement` block, and must not — `.claude/**` is template surface, and
`enforcement.checkpointAutorun` would ship autonomous-push consent into every generated
project. This repo's checkpoint automation stays the repo-owned, identity-guarded
`.claude/hooks/checkpoint-autorun.mjs`.

### Permissions in the tracked `settings.json`

`permissions` ships verbatim into every generated project, so it is written for a
**stranger's repo**, not this machine. Least-privilege pass 2026-09-02; every claim below
was verified by running it in a throwaway project, not read off the docs.

- **Rules are prefixed per shell tool, and `Bash(...)` does not reach `PowerShell(...)`.**
  There is a separate `PowerShell(...)` prefix with the same shape (aliases canonicalized,
  case-insensitive). PowerShell is the primary shell on Windows hosts, so every allow entry
  is listed **twice**. Before this pass all eight tracked entries were `Bash(...)` only —
  i.e. inert for the shell the harness actually reached for, since the 2026-07-14 release.
- **Removed as over-broad:** `Bash(winget install *)` (arbitrary machine-wide install) and
  `Bash(docker exec *)` (arbitrary exec in any container) — both auto-approved in every
  generated project. The DB-assertion recipes that grew the latter belong in the owner's
  untracked `settings.local.json`. Also removed: a one-off `dotenv-cli` install grant and a
  literal-commit grant, both dead (this repo commits via `git commit -F <file>`).
- **`deny` beats everything, from every scope** — including `--allowedTools`,
  `settings.local.json`, and `bypassPermissions`. Verified: a `Read` deny blocked an edit
  *while running under `--permission-mode bypassPermissions`*. There is no session-level
  lift, which is exactly why the env rules below are **`ask`, not `deny`**.
- ⚠️ **A `Read` DENY also blocks Edit and Write on the same path** — *"File is covered by a
  Read deny rule in your permission settings and cannot be edited."* `scripts/init-app.mjs`
  prints `Edit .env` as Next Step 1 of every generated project, so a tracked
  `deny: Read(.env)` would brick the on-ramp it ships with. Hence `ask`: an interactive
  session prompts (the right tripwire for a secrets file) and the edit still happens.
- ⚠️ **`ask` is not free headlessly.** In a non-interactive `claude -p` run there is nobody
  to answer, so an `ask` behaves as a refusal (*"requested permissions to read … but you
  haven't granted it yet"*) — including under `bypassPermissions`. A headless agent that
  must read `.env` uses the subprocess form (`pnpm exec dotenv -e .env -- <cmd>`), which no
  `Read` rule reaches.
- **Which shell reads a `Read` rule actually intercepts** (tested against a denied file):
  `cat` **blocked** · `grep` **blocked** (it is *not* in the documented example list —
  assume the recognized set is wider than the docs enumerate) · `set -a; . ./.env`
  **not blocked** (shell builtin) · `node -e "fs.readFileSync(...)"` **not blocked**
  (arbitrary subprocess). So the repo's `grep | cut` env recipe is the one that would
  break under a deny; the sourcing and `dotenv` forms survive either way.
- **Force-push denial is a tripwire, not a wall.** Wildcards are valid at any position, so
  five patterns per shell cover every spelling — verified blocked: `--force`, `-f`,
  `origin main --force`, `origin main -f`, `--force-with-lease`, and the refspec form
  `origin +main`; a plain `git push origin main` is unaffected. **Known gaps, deliberate:**
  the rules anchor on `git push`, so `git -c … push --force` slips past, and `--no-verify`
  bypasses any hook. A git `pre-push` hook is *not* the answer either — it receives refs on
  stdin and the remote name/URL as argv, and **cannot see the flags at all**; detecting a
  force there means an ancestry test (`git merge-base --is-ancestor`), not a flag grep. The
  server-side wall already exists: `main`'s repository ruleset blocks non-fast-forward pushes
  and branch deletion (verified 2026-09-02 via `gh api …/rules/branches/main`), so the deny is
  belt-and-braces; what `main` still lacks is a **required status check** (an owner decision,
  tracked in BACKLOG).
- `ask: Bash(git push *)` was considered and **rejected**: it would prompt the autonomous
  checkpoint push that `DECISIONS.md` standing-authorizes.
- Bare-command matching under `PowerShell(...)` is **undocumented** (the "a trailing ` *`
  also matches the bare command" rule is stated for Bash only) and was not verified, so a
  first bare `pnpm knip` may prompt once under PowerShell. Listing no-arg twins to dodge
  that was rejected as exactly the accretion this pass reverses.

**The skill-description budget is two figures, not one.** The adapter's
`contextBudget.skillDescriptionMaxTokens: 909` is a *measured* baseline (contrarian's call
over a padded 1000), and it counts the **portable** cost — every skill description, ≈855
tokens across the ten. Since kit 0.23.13 the **charged** cost is much lower: the seven
`disable-model-invocation` skills drop out of the always-loaded context, leaving ≈257 tokens
(`doc-audit` + `dep-check` + `live-verify`). Read 909 as the portable ceiling; a generated
project that re-enables model invocation on those seven pays the portable figure. This stays
a **doc note deliberately** — `contextBudget` is `additionalProperties: false` in the kit's
adapter schema and the installer validates before writing, so a second key would fail the
install.

**`settings.json` survives a kit install** — it is not regenerated. The installer mutates
only its `hooks` key, and within each event strips only entries carrying the literal marker
`.claude/hooks/ai-dev-kit/`; the header of `install.mjs` says as much ("the adapter config and
settings.json are user-owned and never checked"). A repo-owned hook whose handler path points
*outside* that path is preserved by construction.

Since kit 0.17.0 the marker is read from **both** `command` and every `args` entry
(`install.mjs` → `carriesMarker`), so wiring in either form is recognised and replaced cleanly.
Before that it read `command` only, which is why older revisions of this file called exec form
unusable — see below.

That marker — not `--check` — is the real reason `contrarian-nudge.mjs` sits at the top level.
`--check` walks the kit **source** tree and diffs each source file against its destination, so
a destination-only file is never visited and would not be flagged in either location.
**Moving a repo-owned handler under `.claude/hooks/ai-dev-kit/` would put the marker in its
command string and make the next install delete its wiring** — so don't. The one visible
effect of a reinstall is a one-time reordering of the `PreToolUse` groups (kit entries append
after repo-owned ones); it is idempotent thereafter. `pnpm docs:sanity` asserts every
repo-owned handler is still wired, so a bad hand-merge fails a gate instead of silently
disarming the hook.

Since 2026-08-25 `docs-sanity.mjs` reads **both** wiring forms (shell-form `command` strings
and exec-form `args` entries) and additionally asserts the kit-marker entries in
`settings.json` agree with `.claude/hooks/ai-dev-kit/hooks.json` — **every** key, deep-compared
with basenames and key order normalized (since 2026-09-02; the earlier five-field
`event/matcher/handler/if/timeout` compare let kit 0.23.12's `asyncRewake` through silently) —
the check that would have caught `compact-reorient` sitting installed but
unwired. A green `docs:sanity` now does cover the kit wiring; fix disagreements by re-running
the installer with `--hooks`, not by hand-editing.

**Every handler path must be anchored on `${CLAUDE_PROJECT_DIR}`, braced and double-quoted:**

```json
"command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/contrarian-nudge.mjs\""
```

The exec-form twin — how the kit wires `dep-check-nudge.mjs` in `settings.json` — is
`"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/ai-dev-kit/dep-check-nudge.mjs"]`:
braced, and unquoted (see below).

Hooks are spawned with the **session cwd, not the project root**, so a repo-relative
`node .claude/hooks/…` resolves against whatever subdirectory the session last `cd`'d into
and dies with `MODULE_NOT_FOUND`. The failure is invisible: only exit 2 blocks a hook, these
advise, and every gate stayed green — it cost this repo 14 silently-lost runs and a consumer
274 before anyone looked. Both details are load-bearing: a **bare** `$CLAUDE_PROJECT_DIR`
reads as `$null` under the PowerShell hook shell (Windows without Git Bash), and an
**unquoted** path word-splits under bash when the project path contains a space. The official
hooks-guide examples use the bare form — they are POSIX-only, don't copy them here.
`pnpm docs:sanity` fails on an un-anchored handler in **either** form (a shell-form `command`
must carry the braced, quoted anchor; an exec-form `args` entry must equal
`${CLAUDE_PROJECT_DIR}/<path>`, unquoted), and the kit's `smoke-hooks.mjs` asserts the same over **both** its wiring files —
`installer-hooks.json` against `${CLAUDE_PROJECT_DIR}` and the plugin-form `hooks.json`
against `${CLAUDE_PLUGIN_ROOT}` — plus structural parity between them.

**The double-quoting half applies to shell form only.** In exec form the path is a JSON array
element in `args`, carries no inner quotes, and the harness substitutes and spawns without a
shell — quoting is its job, not yours. Braced (`${…}`, never bare `$…`) is required in both.

**Form, by owner.** Exec form (`args`) is cleaner at runtime — Claude Code substitutes the
placeholder itself and spawns with no shell. The kit ships its own entries that way and, since
0.17.0, its ownership marker reads `args` too, so the duplicate-wiring hazard this section used
to warn about is gone.

**Repo-owned handlers stay shell form** for a reason that has not changed: on an adopter build
predating `args` support, an exec-form entry runs bare `node` with no arguments, while the
shell form degrades to precisely the prior behaviour. It is a harness version floor, not a
marker consequence (`docs:sanity` polices both forms, so the check is not the reason). Do **not** reach
for `"shell": "bash"` for determinism either — it hard-throws on Windows without Git Bash.

Residual limit: `CLAUDE_PROJECT_DIR` is the **launch cwd**, not the git root, so starting
`claude` from inside `apps/web` still misses. Strictly better than a relative path, which broke
on any `cd`.

`permissions` is tracked and shared; `settings.local.json` is gitignored, personal, and holds
no `hooks` key — it is not a place to put shared wiring.

**Known false positive:** the kit's `skill-drift-guard` matches any `.claude/{skills,hooks}/`
path, so editing a *repo-owned* top-level hook triggers a "this is installer output, edit a kit
clone instead" nudge. That advice is exactly backwards for those files — ignore it there. The
guard's own escape clause says the same: if the file isn't in the kit manifest, disregard.

### Subagent registration is surface-dependent

A well-formed `.claude/agents/*.md` does **not** register everywhere, and this is the single
most confusing thing about the directory. Verified 2026-07-28 against `contrarian`:

| Where | Registers? |
| --- | --- |
| `claude` CLI (**≥2.1.220**; re-observed on 2.1.258, 2026-09-02) | **Yes** — appears in the Agent-tool registry, dispatchable by slug |
| `claude --agent <slug> -p "…"` | **Yes** — reads the file directly; works everywhere |
| Some hosted/desktop surfaces | **No** — `.claude/agents/` is never read; only built-ins resolve |
| `--agents '<json>'` | **No** — does not inject into the Agent-tool registry |

The symptom is `Agent type 'contrarian' not found. Available agents: claude,
claude-code-guide, Explore, general-purpose, Plan, statusline-setup`. **Restarting the session
does not fix it** — a widely repeated claim that this repo carried in three places and that a
session started days after the agent landed disproved. Upstream:
[claude-code#59881](https://github.com/anthropics/claude-code/issues/59881), closed
`not_planned` by a staleness bot rather than on the merits.

Practical rule: when the registry lacks the agent, use `claude --agent <slug> -p "<prompt>"`.
It loads the same file, system prompt, and `tools:` allowlist.

**This is why `docs:sanity` checks agent *existence* and not frontmatter shape.** A shape
validator passes green in exactly the world where registration is broken, which would certify
the wrong property. Registration can only be observed by running the CLI, which CI does not do
— so it is unguarded on purpose, and stated here rather than papered over with a check that
looks equivalent.

**Agents get no `Bash`.** `contrarian`'s `tools:` is `Read, Glob, Grep, WebSearch, WebFetch`.
"No `Write`/`Edit`" does *not* make an agent read-only: `Bash` covers `rm`, `>`, and
`git reset`, and a non-interactive run executes shell commands with no permission prompt
(confirmed by running a non-allowlisted `whoami` from an agent session). An agent that is
standing-authorized — invoked without asking — should not carry a shell.
