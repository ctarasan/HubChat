# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-3.8 limited extended monitoring execution evidence)

## Current master

- Master HEAD: `4d3c3e9` (PR **#183** CCP-3.7 extended monitoring plan merged)
- CCP-3.8 execution evidence branch: preflight **PASS**; flag **OFF / ABSENT**; **HOLD — AWAITING GO EXTENDED MONITORING**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** (do not enable until operator **GO EXTENDED MONITORING**) |
| LINE inbound smoke | PASS |
| Facebook inbound smoke | PASS |
| Instagram inbound smoke (via `/api/webhook/facebook`) | PASS |
| CCP-3.6 LINE resolver window | Rolled back; recovery smoke **SENT** referenced |
| Ops menu test | PASS |

## Guardrails (CCP-3.8)

- **DB_ONLY** prohibited
- Credential migration **`--execute`** prohibited
- Long-running flag-on **NOT APPROVED**
- Final expected state after any window: flag **OFF / ABSENT**

## Primary runbooks

- Analytics: `docs/hubchat-analytics-operator-runbook.md`
- SLA Policy: `docs/hubchat-sla-operator-runbook.md`
- Webhook smoke: `docs/hubchat-webhook-smoke-runbook.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-3.8 limited extended monitoring execution evidence (docs-only).

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
