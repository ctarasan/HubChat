# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-3.9 DB_ONLY readiness assessment)

## Current master

- Master HEAD: `79e595e` (PR **#184** CCP-3.8 merged)
- CCP-3.9: **`DB_ONLY` readiness assessment** — analysis-only; **`DB_ONLY` NOT READY**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** |
| `DB_ONLY` | **Not enabled / not approved** for long-running production |
| CCP-3.8 controlled window | **COMPLETE** — **PASS WITH NOTES**; rolled back |
| Long-running flag-on | **NOT APPROVED** |

## Guardrails

- **`DB_ONLY`:** not enabled; assessment verdict **NOT READY**
- Credential migration **`--execute`:** prohibited
- Production config: unchanged by CCP-3.9

## Primary runbooks

- DB_ONLY assessment: `docs/channel-connect-db-only-readiness-assessment.md`
- Outbound rollout readiness: `docs/channel-connect-outbound-rollout-readiness.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-3.9 DB_ONLY readiness assessment (docs-only).

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.

## Recommended next step

**CCP-4.0 Controlled DB_ONLY Rehearsal Plan** — planning only; no production `DB_ONLY` enablement.
