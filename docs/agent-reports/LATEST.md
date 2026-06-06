# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.2 DB_ONLY rollout decision)

## Current master

- Master HEAD: `d7b48a1` (PR **#187** CCP-4.1 merged)
- CCP-4.2: **APPROVE NEXT STEP ONLY** — next candidate **CCP-4.3**

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| Runtime modes (LINE / Facebook / Instagram) | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| CCP-4.1 LINE **`DB_ONLY` rehearsal** | **COMPLETE** — rolled back |
| Production-wide / long-running **`DB_ONLY`** | **NOT APPROVED** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** |

## CCP-4.2 decision

- **Approved:** stay on **`DB_WITH_ENV_FALLBACK`**
- **Next candidate:** **CCP-4.3 LINE-only `DB_ONLY` Extended Pilot**
- **Not approved:** production-wide, long-running, FB/IG **`DB_ONLY`**

## Primary runbooks

- DB_ONLY rollout decision: `docs/channel-connect-db-only-rollout-decision.md`
- CCP-4.1 evidence: `docs/agent-reports/agent-a/2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md`
- DB_ONLY rehearsal plan: `docs/channel-connect-db-only-rehearsal-plan.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.2 DB_ONLY rollout decision (docs-only).

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.

## Next operator GO (future CCP-4.3)

**`GO LINE DB_ONLY EXTENDED PILOT`** — not received in CCP-4.2.
