# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-27 (Agent A - Phase II-M2-A)

## Current master

- Base: `ee4f7be` — PR **#85** outbound terminal-state guard merged
- Outbound false-DONE incident chain: **closed** (post-mortem PR **#84**)

## In progress

- PR (pending) — Phase II-M2-A Marketing Automation Bridge Mapping Foundation
- Branch: `feature/phase-ii-m2-a-marketing-bridge-mapping`
- Status: **Complete on branch** — pure mapper + tests; no external send

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| Facebook inbound/outbound | PASS |
| Instagram inbound/outbound (text/image) | PASS |
| LINE outbound evidence | PASS |
| Marketing events (`AGENT_MESSAGE_SENT`, `delivery_status=SENT`) | PASS |
| DB_ONLY | **Not enabled** |

## Agent A

- Latest report: `docs/agent-reports/agent-a/latest.md`
- Historical: `docs/agent-reports/agent-a/2026-05-27-phase-ii-m2-a-marketing-bridge-mapping.md`

## Agent B

- Status: **Inactive** (master synced; outbound reliability analysis complete)

## Next step

1. Review / merge M2-A bridge mapping PR.
2. Future M2-B: durable outbox + worker for external marketing automation (not in M2-A).

## Universal workflow

See [docs/ai-agent-project-workflow.md](../ai-agent-project-workflow.md).
