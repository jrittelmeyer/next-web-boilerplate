# Watching CI to green, per provider

Keyed on the adapter's `ci.provider`. The contract is identical everywhere:
find the run for **this exact commit**, watch it finish, then **confirm the
conclusion with a machine-readable query** — a streaming watcher's exit status
is a convenience, not the verdict.

## github-actions

- `gh run list --commit <full 40-char sha>` — a short sha silently matches
  nothing. Pick the adapter's `ci.workflow` run.
- `gh run watch <id>` to follow, then confirm:
  `gh run view <id> --json status,conclusion` (watch's `--exit-status` is
  unreliable as the sole verdict).
- Repos with default-setup code scanning run it as a separate workflow — list
  all runs for the commit and confirm each.

## gitlab-ci

- `glab ci list --sha <sha>` (or `glab pipeline list`) → the pipeline for the
  commit; `glab ci watch <pipeline-id>` to follow.
- Confirm: `glab ci get <pipeline-id> -F json` → `.status == "success"`.

## azure-devops · jenkins · circleci · other

- Same shape via each CLI/API: find the build for the sha, poll to completion,
  confirm the conclusion field from the JSON response — not the stream.
- No CLI available → poll the provider's REST status endpoint for the commit,
  or say explicitly that CI could not be watched and what remains unconfirmed.
