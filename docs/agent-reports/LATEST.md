# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first → `agent-a/latest.md` → `PROJECT_STATE.md`.  
> Last updated: 2026-05-22 (Agent A — reusable AI agent workflow docs)

## Current master
- Commit: `695191e` — docs: Instagram rollout report (#64); includes #63 agent reports
- In progress: **docs/reusable-ai-agent-workflow** (this task)

## Runtime status (production — HubChat-specific)

| Area | Status |
|------|--------|
| LINE outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Facebook outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Inbound webhooks | Env-based — PASS |
| Channel Settings / Test connection | PASS |
| Worker logs | Clean — no known secret leak |

## Agent A latest
- Task: Reusable AI Agent Project Workflow documentation
- Branch: `docs/reusable-ai-agent-workflow`
- Scope: docs/process only — universal workflow + HubChat handoff updates
- PR: TBD
- Next: Open PR; ChatGPT review; merge

## Agent B latest
**Inactive.**

## Recommended next step
1. Merge reusable workflow docs PR.
2. Monitor Instagram `DB_WITH_ENV_FALLBACK` in production.
3. Plan Phase II-G2-D (runtime cleanup / `DB_ONLY` readiness — **do not enable `DB_ONLY` yet**).

## Universal workflow (not HubChat-specific)
[`docs/ai-agent-project-workflow.md`](../ai-agent-project-workflow.md)
