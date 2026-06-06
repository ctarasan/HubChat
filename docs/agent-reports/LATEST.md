# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.1 DB_ONLY rehearsal execution evidence, preflight only)

## Current master

- Master HEAD: `370527f` (PR **#186** CCP-4.0 merged)
- CCP-4.1: Preflight **PASS** (repo items); **HOLD — AWAITING GO CONTROLLED DB_ONLY REHEARSAL**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| `DB_ONLY` | **Not enabled / not approved** for long-running production |
| CCP-4.1 rehearsal | **Not executed** — preflight docs only |

## Guardrails (CCP-4.1)

- **`DB_ONLY`:** not enabled; execution requires **`GO CONTROLLED DB_ONLY REHEARSAL`**
- Credential migration **`--execute`:** prohibited
- Long-running flag-on / long-running **`DB_ONLY`:** **NOT APPROVED**
- Final required state after any window: **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT**

## Primary runbooks

- DB_ONLY rehearsal plan: `docs/channel-connect-db-only-rehearsal-plan.md`
- DB_ONLY readiness assessment: `docs/channel-connect-db-only-readiness-assessment.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.1 controlled DB_ONLY rehearsal execution evidence (preflight only).

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.

## Operator GO phrase (not received)

**`GO CONTROLLED DB_ONLY REHEARSAL`**
