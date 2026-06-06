# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.1 DB_ONLY rehearsal complete)

## Current master

- Master HEAD: `370527f` (PR **#186** CCP-4.0 merged)
- CCP-4.1: **COMPLETE** — **PASS WITH NOTES**; PR [#187](https://github.com/ctarasan/HubChat/pull/187)

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| `DB_ONLY` | **Not running** — controlled LINE rehearsal rolled back |
| Long-running **`DB_ONLY`** | **NOT APPROVED** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — not proven by CCP-4.1 |

## Guardrails

- Controlled LINE **`DB_ONLY` rehearsal:** **PASS WITH NOTES** (rolled back)
- Credential migration **`--execute`:** prohibited
- Long-running **`DB_ONLY`:** **NOT APPROVED** — do not enable from CCP-4.1 alone

## Primary runbooks

- CCP-4.1 evidence: `docs/agent-reports/agent-a/2026-06-06-ccp-4-1-controlled-db-only-rehearsal-execution-evidence.md`
- DB_ONLY rehearsal plan: `docs/channel-connect-db-only-rehearsal-plan.md`
- DB_ONLY readiness assessment: `docs/channel-connect-db-only-readiness-assessment.md`

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.1 controlled DB_ONLY rehearsal execution evidence.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
