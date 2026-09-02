# Authoritative sources — re-fetched every harness-audit run

<!-- lint-ok: dated-file — the dates below are maintained metadata; harness-audit refreshes them every run and treats stale rows as findings. -->

Each row: what it governs · URL · how verified · last-verified date. A moved
or dead URL is repaired *during the run*; a row older than two quarters is
itself a finding.

| Governs | Source | Verified | Last |
| --- | --- | --- | --- |
| Skill authoring rubric (structure, descriptions, budgets, disclosure, evals) | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | fetched in full | 2026-08-31 |
| Claude Code skill frontmatter (≈20 fields), invocation control, `allowed-tools`, `context: fork`, `skillOverrides`, `${CLAUDE_SKILL_DIR}` | https://code.claude.com/docs/en/skills | fetched in full (row restored 2026-08-31 — first added 2026-08-29, lost to a reinstall before the kit mirror existed) | 2026-08-31 |
| Skill eval format + with/without benchmark loop (`evals/evals.json`, `grading.json`, `benchmark.json` `delta`) | https://agentskills.io/skill-creation/evaluating-skills | fetched in full (row restored 2026-08-31, same history as above) | 2026-08-31 |
| The portable skill format + which tools support it | https://agentskills.io (spec + client showcase) | fetched (overview + /specification: portable frontmatter is name · description · license · compatibility · metadata · allowed-tools; ~50 clients listed) | 2026-08-31 |
| Harness changelog (new hook events, settings, packaging, features) | https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md (raw — the blob page doesn't render for fetchers) | fetched (head 2.1.252) | 2026-08-31 |
| Hook events + I/O contracts (what each event receives and may return) | https://code.claude.com/docs/en/hooks | fetched (33-event reference table; 5 handler types; command default timeout now 600 s; the two 2.1.251 events are decision-only / display-only, so the additionalContext-capable count stays 11 of 33) | 2026-08-31 |
| Cross-tool instruction-file standard | https://agents.md (Linux Foundation AAIF) | fetched | 2026-08-31 |
| Plugin / marketplace packaging (distribution channel) | https://code.claude.com/docs/en/plugin-marketplaces | fetched | 2026-08-31 |
| MCP server landscape | https://registry.modelcontextprotocol.io (repaired 2026-08-25: the github.com/modelcontextprotocol/servers third-party list was retired 2026-04-14 in favor of the registry) | fetched — resolves as the official registry, no successor notice | 2026-08-31 |
| Official example skills (patterns worth borrowing) | https://github.com/anthropics/skills | fetched (structure) | 2026-08-31 |
| Plugin auto-discovery + version management (the packaging route B4 rows depend on) | https://code.claude.com/docs/en/plugins-reference | fetched | 2026-08-31 |
