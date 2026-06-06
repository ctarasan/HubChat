# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.5 all-channel DB_ONLY pilot preflight)

## Current master

- Master HEAD: `2048d64` (PR **#189** CCP-4.3 merged; PR **#190** CCP-4.4 per operator sync)
- CCP-4.5: **HOLD** — preflight + evidence artifact; **AWAITING GO ALL-CHANNEL DB_ONLY PILOT**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE / Facebook / Instagram runtime modes | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| CCP-4.4 Meta **`DB_ONLY` rehearsals** | **COMPLETE** — rolled back |
| All-channel **`DB_ONLY` pilot** | **NOT STARTED** — **HOLD** |
| Production-wide / long-running **`DB_ONLY`** | **NOT APPROVED** |

## Guardrails

- All-channel **`DB_ONLY`:** not enabled until **`GO ALL-CHANNEL DB_ONLY PILOT`**
- Controlled pilot success **does not** approve long-running or production-wide **`DB_ONLY`**
- **`--execute`:** prohibited
- Final required state after pilot: all channels **`DB_WITH_ENV_FALLBACK`** + resolver **OFF / ABSENT**

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.5 all-channel DB_ONLY pilot evidence.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
