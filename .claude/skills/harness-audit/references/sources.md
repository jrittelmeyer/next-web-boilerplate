# Authoritative sources — re-fetched every harness-audit run

<!-- lint-ok: dated-file — the dates below are maintained metadata; harness-audit refreshes them every run and treats stale rows as findings. -->

Each row: what it governs · URL · how verified · last-verified date. A moved
or dead URL is repaired *during the run*; a row older than two quarters is
itself a finding.

| Governs | Source | Verified | Last |
| --- | --- | --- | --- |
| Skill authoring rubric (structure, descriptions, budgets, disclosure, evals) | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | fetched in full | 2026-08-25 |
| The portable skill format + which tools support it | https://agentskills.io (spec + client showcase) | fetched | 2026-08-25 |
| Harness changelog (new hook events, settings, packaging, features) | https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md (raw — the blob page doesn't render for fetchers) | fetched (head 2.1.246) | 2026-08-25 |
| Hook events + I/O contracts (what each event receives and may return) | https://code.claude.com/docs/en/hooks | fetched (full 31-event surface) | 2026-08-25 |
| Cross-tool instruction-file standard | https://agents.md (Linux Foundation AAIF) | search-confirmed | 2026-08-25 |
| Plugin / marketplace packaging (distribution channel) | https://code.claude.com/docs/en/plugin-marketplaces | fetched | 2026-08-25 |
| MCP server landscape | https://registry.modelcontextprotocol.io (repaired 2026-08-25: the github.com/modelcontextprotocol/servers third-party list was retired 2026-04-14 in favor of the registry) | search-confirmed | 2026-08-25 |
| Official example skills (patterns worth borrowing) | https://github.com/anthropics/skills | fetched (structure) | 2026-08-25 |
| Plugin auto-discovery + version management (the packaging route B4 rows depend on) | https://code.claude.com/docs/en/plugins-reference | fetched | 2026-08-25 |
