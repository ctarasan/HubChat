# Agent Report — Phase II-G2-D DB_ONLY Readiness (Historical)

## Metadata

- Agent: A
- Date: 2026-05-19
- Phase / Task: Phase II-G2-D — DB_ONLY Readiness Analysis
- Branch: `docs/phase-ii-g2-d-db-only-readiness-analysis`
- Base commit: `8c091c4`
- Status: Complete (analysis only)
- PR: *(see GitHub)*

## Summary

Analysis-only deliverable for outbound runtime cutover from `DB_WITH_ENV_FALLBACK` toward optional per-channel `DB_ONLY`.

**Recommendation:** Do **not** enable `DB_ONLY` now. Monitor current modes longer; when approved, trial **LINE → Facebook → Instagram** with rollback env retained.

**Full analysis:** [`docs/phase-ii-g2-d-db-only-readiness-analysis.md`](../../phase-ii-g2-d-db-only-readiness-analysis.md)

## Key findings

- Worker modes are controlled by `HUBCHAT_*_RUNTIME_CONFIG_MODE` env vars (Railway worker).
- `DB_ONLY` removes env credential fallback; missing/disabled/ERROR DB rows fail outbound safely.
- Test connection may pass while worker runtime resolver fails if Channel Settings `status` is **ERROR**.
- Inbound webhooks remain env-based; webhook/verify env vars must not be removed in this phase.
- `META_GRAPH_VERSION` / `FACEBOOK_GRAPH_VERSION` remain worker env even under DB_ONLY for Meta channels.

## Guardrails

- No secrets in report
- No production env changes
- No code changes in this phase
