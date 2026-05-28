# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-05-28 (Agent A - PROD-C3 Webhook Smoke Runbook)

## Current master

- PR **#96** inbound signature verification baseline: merged
- PR **#97** LINE signature-before-payload hotfix: merged
- PR **#98** Instagram webhook compat route hotfix: merged

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE inbound smoke | PASS |
| Facebook inbound smoke | PASS |
| Instagram inbound smoke (via `/api/webhook/facebook`) | PASS |
| Residual `/api/webhook/instagram` 401 noise | Non-blocking (known) |

## Primary runbook

- Webhook smoke runbook: `docs/hubchat-webhook-smoke-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`

## Agent A

- Latest: `docs/agent-reports/agent-a/latest.md`

## Universal workflow

See [docs/ai-agent-project-workflow.md](../ai-agent-project-workflow.md).
