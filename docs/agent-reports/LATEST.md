# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.5 all-channel DB_ONLY pilot complete)

## Current master

- Master HEAD: `2048d64` (PR **#189** CCP-4.3 merged; PR **#190** CCP-4.4 per operator sync)
- CCP-4.5: **COMPLETE** — **PASS WITH NOTES**; PR [#191](https://github.com/ctarasan/HubChat/pull/191)

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE / Facebook / Instagram runtime modes | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| CCP-4.5 all-channel **`DB_ONLY` pilot** | **COMPLETE** — rolled back |
| Production-wide permanent / long-running **`DB_ONLY`** | **NOT APPROVED** |

## Guardrails

- Controlled pilot success **does not** approve long-running or production-wide permanent **`DB_ONLY`**
- **`--execute`:** prohibited
- **CCP-4.6** final rollout decision required before permanent **`DB_ONLY`**

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.5 all-channel DB_ONLY pilot evidence.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
