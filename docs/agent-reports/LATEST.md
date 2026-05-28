# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-28 (Agent B - PROD-D2 Outbound Reliability Smoke Plan)

## Current master

- PR **#99** webhook smoke runbook: merged
- PR **#100** webhook regression smoke tests: merged
- PR **#101** worker/queue observability: merged
- PROD-D2 outbound reliability smoke plan: in PR (Agent B)

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE inbound smoke | PASS |
| Facebook inbound smoke | PASS |
| Instagram inbound smoke (via `/api/webhook/facebook`) | PASS |
| Residual `/api/webhook/instagram` 401 noise | Non-blocking (known) |

## Primary runbooks

- Webhook smoke: `docs/hubchat-webhook-smoke-runbook.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` for PROD-D1 implementation details.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for PROD-D2 implementation details.
