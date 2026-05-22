# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-19 (Agent A — Phase II-G2-D DB_ONLY readiness analysis)

## Current master

- Commit: `8c091c4` (sync from `origin/master` at analysis start)
- PR **#65** reusable workflow docs — verify merge status on GitHub
- PR **#64** merged (Instagram rollout report)
- PR **#63** merged (agent report handoff protocol)

## In progress

- Branch: `docs/phase-ii-g2-d-db-only-readiness-analysis`
- Task: Phase II-G2-D — DB_ONLY readiness analysis (docs only)
- **Do not enable `DB_ONLY`**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Facebook outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Inbound webhooks | Env-based, unchanged — PASS |
| Worker logs | Clean — no known secret leak |
| DB_ONLY | **Not enabled** — analysis only |

## Agent A

- Branch: `docs/phase-ii-g2-d-db-only-readiness-analysis`
- PR: *(open after push)*
- Deliverable: [`docs/phase-ii-g2-d-db-only-readiness-analysis.md`](../phase-ii-g2-d-db-only-readiness-analysis.md)

## Agent B

- Status: Inactive

## Next step

1. ChatGPT review DB_ONLY readiness analysis PR.
2. **Keep monitoring** `DB_WITH_ENV_FALLBACK` (recommend ≥ 1–2 weeks).
3. Do **not** enable `DB_ONLY` without approved rollout phase + operator.
4. When approved: trial **LINE** first, then Facebook, then Instagram.
5. Plan **inbound runtime config** as a **separate later phase**.

## Universal workflow (not HubChat-specific)

See [docs/ai-agent-project-workflow.md](../ai-agent-project-workflow.md).
