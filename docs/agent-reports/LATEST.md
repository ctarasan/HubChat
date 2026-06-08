# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — PROD-CUTOVER-1A Facebook Page readiness)

## Current master

- Master HEAD: `602feb3` (PR **#191** CCP-4.5 merged; PR **#190** CCP-4.4 merged)
- PROD-CUTOVER-1A: **PASS WITH NOTES** — Facebook Page onboarding backend review

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| LINE / Facebook / Instagram runtime modes | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| CCP-4.5 all-channel **`DB_ONLY` pilot** | **COMPLETE** — rolled back |
| Production-wide permanent / long-running **`DB_ONLY`** | **NOT APPROVED** until CCP-4.6 |

## PROD-CUTOVER-1A focus

- Manual Facebook Page onboarding via **Channel Settings** — outbound **PASS**
- Inbound webhook — **ENV-coupled**; align Meta App + Railway env for cutover
- See `docs/agent-reports/agent-a/latest.md`

## Guardrails

- Do not enable permanent **`DB_ONLY`** or resolver flag
- **`--execute`:** prohibited
- Marketplace / CDP bridge: **out of scope**

## Agent A

See `docs/agent-reports/agent-a/latest.md` — PROD-CUTOVER-1A Facebook Page readiness.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
