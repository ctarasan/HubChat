# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first → `agent-a/latest.md` → `PROJECT_STATE.md`.

Last updated: 2026-05-22 (Agent A — PR #65 review fixes)

## Current master

- Commit: `695191e`
- Merged: PR **#64** (Instagram rollout report), PR **#63** (agent reports)

## In progress

- PR **#65** — reusable AI agent workflow docs (`docs/reusable-ai-agent-workflow`)

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Facebook outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Inbound webhooks | Env-based, unchanged — PASS |
| Worker logs | Clean — no known secret leak |

## Agent A

- Branch: `docs/reusable-ai-agent-workflow`
- PR: **#65**
- Task: Reusable workflow documentation + markdown readability cleanup

## Agent B

Inactive.

## Next step

1. Merge PR **#65** after ChatGPT review.
2. Monitor outbound runtime in production.
3. Plan Phase II-G2-D later — **do not enable `DB_ONLY` yet**.

## Universal workflow (not HubChat-specific)

[`docs/ai-agent-project-workflow.md`](../ai-agent-project-workflow.md)
