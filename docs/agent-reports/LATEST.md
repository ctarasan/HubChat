# SmartKorp HubChat Latest Handoff

> **ChatGPT:** Read this file first.
> Then read `agent-a/latest.md` and `PROJECT_STATE.md`.

Last updated: 2026-06-06 (Agent A — CCP-4.3 LINE DB_ONLY extended pilot complete)

## Current master

- Master HEAD: `4e3773e` (PR **#188** CCP-4.2 merged)
- CCP-4.3: **COMPLETE** — **PASS WITH NOTES**; PR [#189](https://github.com/ctarasan/HubChat/pull/189)

## Runtime status (HubChat production)

| Area | Status |
|------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** |
| CCP-4.3 LINE **`DB_ONLY` extended pilot** | **COMPLETE** — rolled back |
| Long-running / production-wide **`DB_ONLY`** | **NOT APPROVED** |
| Facebook / Instagram **`DB_ONLY`** | **NOT APPROVED** — not included in CCP-4.3 |

## Guardrails

- **`DB_ONLY`:** not left running; final state safe
- **`--execute`:** prohibited
- CCP-4.3 proves **30-minute LINE-only pilot** only — not broad **`DB_ONLY` rollout**

## Agent A

See `docs/agent-reports/agent-a/latest.md` — CCP-4.3 LINE DB_ONLY extended pilot evidence.

## Agent B

See `docs/agent-reports/agent-b/latest.md` for AN-3 Analytics documentation.
