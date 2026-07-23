#!/usr/bin/env bash
# Maintains the repo's single rolling "security triage" issue — the machine
# guarantee that a red `pnpm audit` becomes a prioritized-backlog entry instead
# of an unread red run. Called by security-audit.yml (daily) and ci.yml's audit
# lane (push / heartbeat):
#
#   security-triage-issue.sh red   <audit-output-file>   # file or update the issue
#   security-triage-issue.sh green <audit-output-file>   # close it once audit is clear
#
# Requires: gh (present on GitHub runners), GH_TOKEN with issues: write,
# GITHUB_REPOSITORY / GITHUB_RUN_ID (standard runner env). Idempotent: one open
# issue at a time — "red" appends a comment when the issue already exists, and
# "green" closes EVERY open labeled issue (so a rare red/red race between the
# two lanes self-heals) but only when the output proves the audit actually ran.
set -euo pipefail

MODE="${1:?usage: security-triage-issue.sh <red|green> <audit-output-file>}"
AUDIT_FILE="${2:?usage: security-triage-issue.sh <red|green> <audit-output-file>}"

LABEL="security-triage"
TITLE="Security triage: pnpm audit is red"
OWNER="${GITHUB_REPOSITORY%%/*}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-0}"
RUNBOOK_URL="https://github.com/${GITHUB_REPOSITORY}/blob/main/docs/MAINTENANCE.md#security-response-runbook"
NOW="$(date -u +'%Y-%m-%d %H:%M UTC')"

existing="$(gh issue list --label "$LABEL" --state open --limit 1 --json number --jq '.[0].number // empty')"

if [ "$MODE" = "green" ]; then
  # A completed pnpm-audit report always ends with a "…vulnerabilities found"
  # trailer (clean = "No known vulnerabilities found"; policy-green with
  # ignoreGhsas entries = "N vulnerabilities found … (N ignored)"). Under
  # --ignore-registry-errors an advisory-API OUTAGE also exits 0 but emits only
  # retry/fetch-failed noise — never close the issue on a run that didn't
  # actually audit.
  if ! grep -qE 'No known vulnerabilities|vulnerabilities found' "$AUDIT_FILE"; then
    echo "::notice::audit output shows no completed audit (advisory endpoint outage?) — leaving the triage issue untouched"
    exit 0
  fi
  # Close ALL open labeled issues, not just the newest — a red/red race between
  # the two lanes can file a duplicate, and close-all makes any race self-heal.
  gh issue list --label "$LABEL" --state open --json number --jq '.[].number' |
    while read -r n; do
      gh issue close "$n" --comment \
        "\`pnpm audit\` is clear again as of [this run](${RUN_URL}) (${NOW}) — closing. If the fix shipped without its CHANGELOG **Security** entry / MAINTENANCE **Watch item**, add them now (see the [runbook](${RUNBOOK_URL}))."
    done
  exit 0
fi

# MODE=red — make sure the label exists (idempotent), then file or append.
gh label create "$LABEL" \
  --description "Auto-filed: pnpm audit found advisories awaiting triage" \
  --color D93F0B --force

body_file="$(mktemp)"
{
  echo "**Automated finding: \`pnpm audit\` is red** — filed by [this run](${RUN_URL}) on ${NOW}."
  echo
  echo "Triage per the [security response runbook](${RUNBOOK_URL}):"
  echo
  echo "- [ ] Enumerate the advisories below (and cross-check open Dependabot alerts — \`pnpm audit\` is the authoritative gate, Dependabot the supplement)"
  echo "- [ ] Remediate: direct dep → bump · transitive with a fix → scoped \`pnpm-workspace.yaml\` override · no fix → dated \`ignoreGhsas\` entry · fix younger than the 7-day age gate → dated \`minimumReleaseAgeExclude\`"
  echo "- [ ] Record it: CHANGELOG **Security** entry + MAINTENANCE **Watch item** (with its removal condition) in the same commit"
  echo "- [ ] This issue closes automatically on the next green audit run"
  echo
  echo '```text'
  if [ -s "$AUDIT_FILE" ]; then
    head -c 55000 "$AUDIT_FILE"
    echo # a truncated file may end mid-line — the closing fence needs its own line
  else
    echo "(audit output unavailable — see the run log: ${RUN_URL})"
  fi
  echo '```'
} > "$body_file"

if [ -n "$existing" ]; then
  gh issue comment "$existing" --body-file "$body_file"
else
  # Assign the repo owner so the issue lands in a human inbox; fall back to an
  # unassigned issue when the owner isn't assignable (e.g. an org-owned fork).
  gh issue create --title "$TITLE" --label "$LABEL" --assignee "$OWNER" --body-file "$body_file" ||
    gh issue create --title "$TITLE" --label "$LABEL" --body-file "$body_file"
fi
