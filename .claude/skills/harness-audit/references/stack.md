# Recommended stack — verified per harness-audit run

<!-- lint-ok: dated-file — every recommendation below is stamped with its verification date; harness-audit step 3 re-verifies and updates this file each run. -->

The doctrine is **lean**: every always-connected tool server pays a
per-session context cost, so the default set stays small and everything else
is documented, not wired. Entries carry the date they were last verified
against the live ecosystem.

Landscape source: **registry.modelcontextprotocol.io** (the servers repo's
third-party list was retired 2026-04-14; verified 2026-08-25, re-confirmed
2026-08-31 — resolves as the official registry, no successor notice).

## Baseline tool servers (dev projects) — verified 2026-08-23, re-confirmed 2026-08-31

- **Forge server** (GitHub MCP or the forge's equivalent) — PRs, issues, CI
  from the conversation. Skip when the `gh`/`glab` CLI already covers the
  workflows (CLI calls cost no standing context).
- **Context7** — version-correct library docs on demand; highest value when
  building against fast-moving frameworks.
- **Playwright MCP** — real-browser driving for web verification
  (accessibility-tree based, no vision model needed); pairs with
  live-verify's web reference. **Prefer the Playwright CLI when the agent
  has filesystem access** (Claude Code does): the 2026-08-31 sweep found
  the CLI route roughly 4× more token-efficient than the MCP server, which
  is the same conclusion as the lean doctrine — connect the server only
  when the agent cannot run the CLI itself.

## Per-domain servers — verified 2026-08-23, re-confirmed 2026-08-31

- **Unity**: the official Unity CLI ships a first-party MCP server (editor/
  scene control).
- **Unreal**: first-party experimental MCP plugin since UE 5.8.
- **Godot**: community servers (gdai-mcp and peers) — pin by repo/commit.
- **Vite-hosted web/game clients** (added 2026-08-31): a class of community
  "Vite MCP" servers drives Chrome via Playwright against the dev server and
  streams HMR events and console output back — a verification surface for a
  browser-rendered game, same standing as the engine servers below.
  Documented, not wired: the Playwright CLI plus a normal `vite` dev server
  covers the same loop at zero standing cost.
- Games note: engine servers are verification surfaces for live-verify's
  game reference, not always-on defaults — connect for the session that
  needs editor control.

## Adjacent tooling — evaluated 2026-08-23, re-confirmed 2026-08-31

- **Agent task/memory stores** (e.g. Beads — git-backed graph issue tracker):
  strong for long-horizon multi-agent programs; overlaps this kit's
  checkpoint/resume-prompt + backlog discipline, so it's documented, not a
  kit dependency. Re-evaluate if a program outgrows single-session handoffs.
- **Spec-driven kits** (GitHub Spec Kit, OpenSpec): the plan → sign-off →
  build discipline plus the inception skills already cover the pattern here;
  adopt one only if a team standardizes on its artifact format.
- **Harness-evolution tooling** (evaluated 2026-08-31): the "harness
  engineering" pattern — observability-driven, automatic evolution of an
  agent harness with multi-agent proposers and worktree isolation — now has
  named plugins and an academic literature. It is the automated form of
  what `harness-audit` + `retro` do by hand; not adopted while the audit
  cadence is quarterly and the surface is one repo. Re-evaluate at
  portfolio scale.
- **Permissions**: least-privilege starter and doctrine live in the kit's
  `docs/PERMISSIONS.md`.
