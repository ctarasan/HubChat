# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-19 (Agent A — Phase II-C3-B dashboard lead status UI)

## Current master

- Base after PR **#67** merge: `9c0588c`
- PR **#67** merged (lead status + SLA completion foundation)
- **DB_ONLY not enabled**

## In progress

- PR — Phase II-C3-B Dashboard Lead Status UI Controls
- Branch: `feature/phase-ii-c3-b-dashboard-lead-status-ui`
- Status: **Complete** on branch — awaiting ChatGPT review / merge

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Facebook outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Inbound webhooks | Env-based, unchanged |
| DB_ONLY | **Not enabled** |

## Agent A

- Latest report: `docs/agent-reports/agent-a/latest.md`
- Historical: `docs/agent-reports/agent-a/2026-05-19-phase-ii-c3-b-dashboard-lead-status-ui.md`

## Agent B

- Status: **Inactive**

## What C3-B delivers

- Dashboard header + list badges for `lead_management_status`
- Lead status dropdown → `PATCH /api/conversations/[id]/lead-status`
- Terminal WON / LOST / CLOSED clears follow-up visuals after save
- Safe permission / not-found error messages

## Next step

1. ChatGPT review C3-B PR.
2. Merge if approved.
3. Next: production hardening or follow-on inbox UX as prioritized.

## Universal workflow

See [docs/ai-agent-project-workflow.md](../ai-agent-project-workflow.md).
