# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-3.8 extended monitoring window complete)

## Current master

- Master HEAD: `4d3c3e9` (PR **#183** CCP-3.7 extended monitoring plan merged)
- CCP-3.8 execution evidence: **COMPLETE** — **PASS WITH NOTES**; PR [#184](https://github.com/ctarasan/HubChat/pull/184)

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** — absent from Railway worker environment |
| CCP-3.8 limited extended monitoring | **COMPLETE**; rolled back |
| LINE outbound (window + recovery) | **SENT** / queue **DONE** (sanitized row IDs in evidence doc) |
| Facebook / Instagram during window | No new traffic; no new suspected failures (**PASS WITH NOTE**) |
| `DB_ONLY` | **Not used / prohibited** |
| Long-running flag-on | **NOT APPROVED** |

## Guardrails (CCP-3.8)

- **DB_ONLY** prohibited — do not enable
- Credential migration **`--execute`** prohibited
- Long-running flag-on **NOT APPROVED**
- Final state after window: flag **OFF / ABSENT** ✓

## Primary runbooks

- Analytics: `docs/hubchat-analytics-operator-runbook.md`
- SLA Policy: `docs/hubchat-sla-operator-runbook.md`
- Webhook smoke: `docs/hubchat-webhook-smoke-runbook.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-3.8 limited extended monitoring execution evidence (docs-only; window complete).

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
