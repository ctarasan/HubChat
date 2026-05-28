# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-28 (Agent A - PROD-D1 Worker Queue Observability)

## Current master (pre-PR)

- PR **#99** webhook smoke runbook: merged
- PR **#100** webhook regression smoke tests: merged
- PROD-D1 worker/queue observability: in PR (Agent A)

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
