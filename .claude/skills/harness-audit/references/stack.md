# Recommended stack — verified per harness-audit run

<!-- lint-ok: dated-file — every recommendation below is stamped with its verification date; harness-audit step 3 re-verifies and updates this file each run. -->

The doctrine is **lean**: every always-connected tool server pays a
per-session context cost, so the default set stays small and everything else
is documented, not wired. Entries carry the date they were last verified
against the live ecosystem.

## Baseline tool servers (dev projects) — verified 2026-08-23

- **Forge server** (GitHub MCP or the forge's equivalent) — PRs, issues, CI
  from the conversation. Skip when the `gh`/`glab` CLI already covers the
  workflows (CLI calls cost no standing context).
- **Context7** — version-correct library docs on demand; highest value when
  building against fast-moving frameworks.
- **Playwright MCP** — real-browser driving for web verification
  (accessibility-tree based, no vision model needed); pairs with
  live-verify's web reference.

## Per-domain servers — verified 2026-08-23

- **Unity**: the official Unity CLI ships a first-party MCP server (editor/
  scene control).
- **Unreal**: first-party experimental MCP plugin since UE 5.8.
- **Godot**: community servers (gdai-mcp and peers) — pin by repo/commit.
- Games note: engine servers are verification surfaces for live-verify's
  game reference, not always-on defaults — connect for the session that
  needs editor control.

## Adjacent tooling — evaluated 2026-08-23

- **Agent task/memory stores** (e.g. Beads — git-backed graph issue tracker):
  strong for long-horizon multi-agent programs; overlaps this kit's
  checkpoint/resume-prompt + backlog discipline, so it's documented, not a
  kit dependency. Re-evaluate if a program outgrows single-session handoffs.
- **Spec-driven kits** (GitHub Spec Kit, OpenSpec): the plan → sign-off →
  build discipline plus the inception skills already cover the pattern here;
  adopt one only if a team standardizes on its artifact format.
- **Permissions**: least-privilege starter and doctrine live in the kit's
  `docs/PERMISSIONS.md`.
