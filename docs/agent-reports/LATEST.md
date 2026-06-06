# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.0 controlled DB_ONLY rehearsal plan)

## Current master

- Master HEAD: `9de1643` (PR **#185** CCP-3.9 merged)
- CCP-4.0: **Controlled DB_ONLY rehearsal plan** — planning-only; execution **not approved**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| `DB_ONLY` | **Not enabled / not approved** for long-running production |
| CCP-3.9 verdict | **`DB_ONLY` NOT READY** (unchanged) |

## Guardrails

- **`DB_ONLY`:** not enabled; CCP-4.0 does not approve execution
- Credential migration **`--execute`:** prohibited
- Long-running flag-on / long-running **`DB_ONLY`:** **NOT APPROVED**
- Future execution GO phrase: **`GO CONTROLLED DB_ONLY REHEARSAL`**

## Primary runbooks

- DB_ONLY rehearsal plan: `docs/channel-connect-db-only-rehearsal-plan.md`
- DB_ONLY readiness assessment: `docs/channel-connect-db-only-readiness-assessment.md`
- Outbound rollout readiness: `docs/channel-connect-outbound-rollout-readiness.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.0 controlled DB_ONLY rehearsal plan (docs-only).

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.

## Recommended next step

**CCP-4.1 Controlled DB_ONLY Rehearsal Execution** — only after operator review and explicit **GO CONTROLLED DB_ONLY REHEARSAL**.
