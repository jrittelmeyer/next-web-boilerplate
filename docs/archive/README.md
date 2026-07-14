# docs/archive

**Historical record — not part of normal agent task context.** Load a file here only
when you need the background behind a past decision, the exact verification a step
performed, or a completed plan. Current, living docs are one level up in `docs/` and
in `docs/context/`.

| File | What it is |
| --- | --- |
| [PHASE_HISTORY.md](PHASE_HISTORY.md) | The full per-step record for Steps 1–29 — the prepended narrative log plus the per-step notes/carry-overs, preserved verbatim from the original (pre-slim) `PROJECT_STATUS.md` — **plus a "Phase 3 — feature depth" section** holding the full C1–D11 prose **and the 2026-06-26→27 maintenance-audit M1–M7 + Tier-2 Turbo-remote-cache prose**, **plus the archived "Audit backlog — 100/100 pass" record (P0–P3, 2026-07-02→05)**, **plus a "Tier 4 — upgrade paths" section (Phase 4 + Band 1/2/4, archived 2026-07-09)**, **plus the verbatim Tier-4 Band-2/3/4 shipped rows (backup/DR · Docker-image CI · audit log + UI · Dialog fix · docs trio · passkeys · privacy · visual · perf · SBOM · worker · rate-limit storage · admin plugin · i18n · A12 CAPTCHA — archived 2026-07-11)**, **plus the verbatim B3 CSP-nonce-rework + A22–A31 rows (archived 2026-07-12, ship dates corrected to the real 2026-07-11→12 commit dates)**, **plus the final Tier-4 / deploy / live-verify rows — B2 uuid-cursor · A32 · A13 · Fly.io deploy · Stripe Phase-5 · prod email domain (archived verbatim 2026-07-14)** — the verbose shipped-row prose the resume file's build-progress table now keeps only as compact one-line rows. |
| [PHASE_B_AUDIT.md](PHASE_B_AUDIT.md) | The read-only Phase B 100/100 audit (at the Phase 1+2 completion checkpoint). The evidence/reasoning record behind the audit backlog (completed 2026-07-05; archived in PHASE_HISTORY.md — the forward backlog is `../BACKLOG.md`). |
| [PHASE_2_PLAN.md](PHASE_2_PLAN.md) | The Phase 2 build plan (Steps 17–29). Completed; kept for the gap analysis and per-step scope/rationale. |
| [PROJECT_AUDIT_2026-07-08.md](PROJECT_AUDIT_2026-07-08.md) | The `/project-audit` scoring pass (2026-07-08): per-feature-group scores /100 (overall 93), the 7 doc-drift fixes, the considered-and-excluded list, and the A1–A22 backlog it seeded (rows live in `../BACKLOG.md`). |
| [PROJECT_AUDIT_2026-07-12.md](PROJECT_AUDIT_2026-07-12.md) | The second `/project-audit` scoring pass (2026-07-12, post-Tier-4 re-score): per-group scores /100 (overall **97.5**, no correctness bugs) and the A23–A31 polish backlog it seeded — all closed 2026-07-11→12 (A31 evaluated → not adopted). |
| [PROJECT_AUDIT_2026-07-12B.md](PROJECT_AUDIT_2026-07-12B.md) | The third `/project-audit` scoring pass (2026-07-12B, post-A23–A31 close): verified every close in code, re-scored **98.2** (no correctness bugs, one comment-date drift fixed), seeded A32 (locale-aware date formatting). |
| [PROJECT_AUDIT_2026-07-14.md](PROJECT_AUDIT_2026-07-14.md) | The fourth `/project-audit` scoring pass (2026-07-14, post-close of everything): verified the B2/A32/A13/Fly/Stripe-P5/email-domain closes in code, re-scored **99.3** — zero new backlog rows (a first); the day's three doc drifts were already fixed by the same-day doc-audit (`43257f7`). |

Durable, still-relevant material that used to live in `PROJECT_STATUS.md` was promoted
out of the archive to discoverable homes: architectural decisions → `../context/DECISIONS.md`,
working agreements → `../../AGENTS.md`.
