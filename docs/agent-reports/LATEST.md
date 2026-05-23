# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-23 (Agent A — Phase II-H1 Instagram outbound image MVP)

## Current master

- Base after PR **#68** merge: `2773b86`
- PR **#68** merged (Dashboard lead status UI)
- PR **#67** merged (lead status API foundation)
- **DB_ONLY not enabled**

## In progress

- PR — Phase II-H1 Instagram Outbound Image MVP
- Branch: `feature/phase-ii-h1-instagram-outbound-image-mvp`
- Status: **Complete** on branch — awaiting ChatGPT review / merge

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Facebook outbound | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound text | `DB_WITH_ENV_FALLBACK` — PASS |
| Instagram outbound image | MVP on branch (Graph URL attachment) |
| Inbound webhooks | Env-based, unchanged |
| DB_ONLY | **Not enabled** |

## Agent A

- Latest report: `docs/agent-reports/agent-a/latest.md`
- Historical: `docs/agent-reports/agent-a/2026-05-23-phase-ii-h1-instagram-outbound-image-mvp.md`

## Agent B

- Status: **Inactive**

## Next step

1. ChatGPT final review PR for Phase II-H1.
2. Merge if approved.
3. Next phase: Dashboard filters / Manager UX or production hardening as prioritized.

## Universal workflow

See [docs/ai-agent-project-workflow.md](../ai-agent-project-workflow.md).
