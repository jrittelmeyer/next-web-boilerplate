# ai-dev-kit changelog

## 0.1.0 — 2026-07-17

Initial extraction from next-web-boilerplate.

- Skills: `checkpoint`, `doc-audit` (dual-home), `project-audit`, `tidy` — generalized
  from the repo-specific originals (behavior preserved; mechanical params moved to the
  adapter config). New: `dep-check`, `live-verify`.
- Cross-platform installer (`install.mjs`): copy, `--check` drift guard, `--global`
  dual-home sync, `--adapter` config install. Pure Node fs, no symlinks, idempotent.
- Adapter contract: `adapters/project.schema.json`; reference adapter for
  next-web-boilerplate.
- Not yet: automation hooks (Step 2), playbook + pitch deck (Step 3).
