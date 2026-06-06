# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.3 LINE DB_ONLY extended pilot evidence)

## Current master

- Master HEAD: `4e3773e` (PR **#188** CCP-4.2 merged)
- CCP-4.3: Preflight artifact ready — **HOLD — AWAITING GO LINE DB_ONLY EXTENDED PILOT**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| Runtime modes | **`DB_WITH_ENV_FALLBACK`** (LINE / Facebook / Instagram) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| CCP-4.3 extended pilot | **Not executed** — 30-minute LINE-only scope |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** |

## Guardrails (CCP-4.3)

- **`DB_ONLY`:** not enabled until **`GO LINE DB_ONLY EXTENDED PILOT`**
- Pilot duration: **30 minutes** (hard stop T+30 min from enable)
- **`--execute`:** prohibited
- Final required state after pilot: **`DB_WITH_ENV_FALLBACK`** + flag **OFF / ABSENT**

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.3 LINE DB_ONLY extended pilot evidence (preflight only).

## Operator GO phrase (not received)

**`GO LINE DB_ONLY EXTENDED PILOT`**

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
