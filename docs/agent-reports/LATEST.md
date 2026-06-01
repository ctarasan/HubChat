# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-31 (Agent B — AN-3 Analytics production runbook)

## Current master

- Analytics Overview API (AN-1): merged
- Analytics Dashboard UI (AN-2, PR **#146**): merged / production
- AN-3 Analytics operator runbook + production evidence: in PR (Agent B)

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE inbound smoke | PASS |
| Facebook inbound smoke | PASS |
| Instagram inbound smoke (via `/api/webhook/facebook`) | PASS |
| Analytics `/dashboard/analytics` | PASS (ADMIN/MANAGER; SALES denied) |
| Residual `/api/webhook/instagram` 401 noise | Non-blocking (known) |

## Primary runbooks

- Analytics: `docs/hubchat-analytics-operator-runbook.md`
- SLA Policy: `docs/hubchat-sla-operator-runbook.md`
- Webhook smoke: `docs/hubchat-webhook-smoke-runbook.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` for backend/API workstreams.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
